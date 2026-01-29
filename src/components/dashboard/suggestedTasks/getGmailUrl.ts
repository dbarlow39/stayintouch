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
  if (fromEmail) parts.push(`from:${fromEmail}`);
  if (subject) parts.push(`subject:"${subject.replace(/"/g, '\\"')}"`);

  if (receivedAt) {
    const d = new Date(receivedAt);
    if (!Number.isNaN(d.getTime())) {
      const after = format(addDays(d, -1), "yyyy/MM/dd");
      const before = format(addDays(d, 1), "yyyy/MM/dd");
      parts.push(`after:${after}`);
      parts.push(`before:${before}`);
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
  opts: GmailUrlOptions = { accountIndex: 0 }
): string | null {
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
  
  // Use search as final fallback
  return buildSearchUrl(suggestion, opts);
}

/** Always returns a Gmail search URL when we have enough metadata. */
export function getSuggestedTaskGmailSearchUrl(
  suggestion: SuggestedTask,
  opts: GmailUrlOptions = { accountIndex: 0 }
): string | null {
  return buildSearchUrl(suggestion, opts);
}
