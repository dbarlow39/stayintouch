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

/**
 * Best-effort Gmail URL for a suggested task.
 * Returns null when we don't have enough metadata to link to an email.
 */
export function getSuggestedTaskGmailUrl(
  suggestion: SuggestedTask,
  opts: GmailUrlOptions = { accountIndex: 0 }
): string | null {
  // Gmail API returns hex IDs (e.g., "19c00e6eb77d32e6") which need conversion
  // to the new Gmail UI token format. Try message ID first, then thread ID.
  const messageId = (suggestion.gmail_message_id ?? "").trim();
  if (messageId) {
    // Check if it's a hex ID (Gmail API format) vs already a new-UI token
    const isHexId = /^[0-9a-f]{15,16}$/i.test(messageId);
    if (isHexId) {
      // We can't reliably distinguish message-id vs thread-id just from the hex.
      // Use auto mode: prefer thread token first (generally best for opening the conversation),
      // then fall back to msg.
      const url = gmailUrlForLegacyHexWithAccount(messageId, "auto", opts.accountIndex);
      if (url) return url;
    } else {
      // Already a new-UI token format (e.g., "FMfcgz...")
      return `${gmailBaseUrl(opts.accountIndex)}#all/${encodeURIComponent(messageId)}`;
    }
  }

  const threadId = (suggestion.thread_id ?? "").trim();
  if (threadId) {
    // Prefer thread token, but allow msg fallback when stored data is inconsistent.
    const directUrl = gmailUrlForLegacyHexWithAccount(threadId, "auto", opts.accountIndex);
    if (directUrl) return directUrl;
  }

  return buildSearchUrl(suggestion, opts);
}

/** Always returns a Gmail search URL when we have enough metadata. */
export function getSuggestedTaskGmailSearchUrl(
  suggestion: SuggestedTask,
  opts: GmailUrlOptions = { accountIndex: 0 }
): string | null {
  return buildSearchUrl(suggestion, opts);
}
