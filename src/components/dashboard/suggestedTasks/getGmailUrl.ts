import { addDays, format } from "date-fns";
import { gmailUrlForLegacyHexWithAccount } from "@/utils/gmailDeepLink";
import type { SuggestedTask } from "./types";

type GmailUrlOptions = {
  /** Target Gmail account index (matches /mail/u/{n}/). Defaults to 0 for reliability. */
  accountIndex?: number | null;
};

function gmailBaseUrl(accountIndex?: number | null): string {
  if (typeof accountIndex === "number" && Number.isFinite(accountIndex)) {
    return `https://mail.google.com/mail/u/${accountIndex}/`;
  }
  return "https://mail.google.com/mail/";
}

function buildSearchUrl(suggestion: SuggestedTask, opts?: GmailUrlOptions): string | null {
  const subject = (suggestion.email_subject ?? "").trim();
  const fromEmail = (suggestion.email_from ?? "").trim();
  const receivedAt = (suggestion.email_received_at ?? "").trim();

  const parts: string[] = [];
  
  // Extract email address from "Name (via service)" <email@domain.com> format
  if (fromEmail) {
    const emailMatch = fromEmail.match(/<([^>]+)>/);
    const cleanEmail = emailMatch ? emailMatch[1] : fromEmail;
    parts.push(`from:${cleanEmail}`);
  }
  
  // Extract property address or distinctive keywords from subject
  if (subject) {
    // Look for address pattern (number + street name)
    const addressMatch = subject.match(/\b\d+\s+[A-Za-z\s]+(?:Dr|Drive|St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Ct|Court|Way|Blvd|Boulevard)\b/i);
    if (addressMatch) {
      // Found an address - use it for flexible matching (shows all emails about this property)
      parts.push(addressMatch[0]);
    } else {
      // No address found - extract distinctive keywords
      const keywords = subject
        .replace(/^(re:|fwd?:|RE:|FWD?:)\s*/gi, '')
        .split(/\s+/)
        .filter(word => 
          word.length > 3 && 
          !/^(please|review|documents?|for|the|and|with|has|signed|from|via)$/i.test(word)
        )
        .slice(0, 5) // Take up to 5 distinctive words
        .join(' ');
      
      if (keywords) {
        parts.push(keywords);
      }
    }
  }

  const query = parts.join(" ").trim();
  if (!query) return null;
  return `${gmailBaseUrl(opts?.accountIndex)}#search/${encodeURIComponent(query)}`;
}

function isLegacyHexId(value: string): boolean {
  return /^[0-9a-f]{15,16}$/i.test(value);
}

function asNewUiTokenUrl(
  legacyHex: string,
  kind: "thread" | "msg" | "auto",
  accountIndex?: number | null
): string | null {
  return gmailUrlForLegacyHexWithAccount(legacyHex, kind, accountIndex);
}

/**
 * Best-effort Gmail URL for a suggested task.
 * Uses the raw Gmail API message/thread ID directly in the URL.
 * Gmail's routing handles both hex IDs and encoded tokens.
 */
export function getSuggestedTaskGmailUrl(
  suggestion: SuggestedTask,
  opts: GmailUrlOptions = { accountIndex: null }
): string | null {
  // Most reliable: use a search URL (mirrors what Gmail ends up doing in many cases).
  // This avoids blank pages when token links don't resolve for certain message/thread IDs.
  const searchUrl = buildSearchUrl(suggestion, opts);
  if (searchUrl) return searchUrl;

  const messageId = (suggestion.gmail_message_id ?? "").trim();
  if (messageId) {
    if (isLegacyHexId(messageId)) {
      // Try thread token first
      const threadUrl = asNewUiTokenUrl(messageId, "thread", opts.accountIndex);
      if (threadUrl) return threadUrl;
      
      // Try message token
      const msgUrl = asNewUiTokenUrl(messageId, "msg", opts.accountIndex);
      if (msgUrl) return msgUrl;
    } else {
      // Already a token, use it directly
      return `${gmailBaseUrl(opts.accountIndex)}#all/${encodeURIComponent(messageId)}`;
    }
  }
  
  const threadId = (suggestion.thread_id ?? "").trim();
  if (threadId) {
    if (isLegacyHexId(threadId)) {
      const threadUrl = asNewUiTokenUrl(threadId, "thread", opts.accountIndex);
      if (threadUrl) return threadUrl;
      
      const msgUrl = asNewUiTokenUrl(threadId, "msg", opts.accountIndex);
      if (msgUrl) return msgUrl;
    } else {
      return `${gmailBaseUrl(opts.accountIndex)}#all/${encodeURIComponent(threadId)}`;
    }
  }

  return null;
}

/** Always returns a Gmail search URL when we have enough metadata. */
export function getSuggestedTaskGmailSearchUrl(
  suggestion: SuggestedTask,
  opts: GmailUrlOptions = { accountIndex: null }
): string | null {
  return buildSearchUrl(suggestion, opts);
}
