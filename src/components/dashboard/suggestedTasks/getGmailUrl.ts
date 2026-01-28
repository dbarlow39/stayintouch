import { addDays, format } from "date-fns";
import { gmailUrlForLegacyHex } from "@/utils/gmailDeepLink";
import type { SuggestedTask } from "./types";

/**
 * Best-effort Gmail URL for a suggested task.
 * Returns null when we don't have enough metadata to link to an email.
 */
export function getSuggestedTaskGmailUrl(suggestion: SuggestedTask): string | null {
  // Gmail API returns hex IDs (e.g., "19c00e6eb77d32e6") which need conversion
  // to the new Gmail UI token format. Try message ID first, then thread ID.
  const messageId = (suggestion.gmail_message_id ?? "").trim();
  if (messageId) {
    // Check if it's a hex ID (Gmail API format) vs already a new-UI token
    const isHexId = /^[0-9a-f]{15,16}$/i.test(messageId);
    if (isHexId) {
      // If this is actually a message-id, msg-f links tend to work better.
      // If it's a thread-id, thread-f is usually the right choice.
      // We can't reliably distinguish, so try msg first (when using messageId)
      // then fall back to thread.
      const msgUrl = gmailUrlForLegacyHex(messageId, "msg");
      if (msgUrl) return msgUrl;

      const threadUrl = gmailUrlForLegacyHex(messageId, "thread");
      if (threadUrl) return threadUrl;
    } else {
      // Already a new-UI token format (e.g., "FMfcgz...")
      return `https://mail.google.com/mail/#all/${encodeURIComponent(messageId)}`;
    }
  }

  const threadId = (suggestion.thread_id ?? "").trim();
  if (threadId) {
    // For explicit thread ids, prefer thread-f.
    const directUrl = gmailUrlForLegacyHex(threadId, "thread");
    if (directUrl) return directUrl;

    // Best-effort fallback: in case the stored value is actually a message id.
    const msgFallback = gmailUrlForLegacyHex(threadId, "msg");
    if (msgFallback) return msgFallback;
  }

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
  return `https://mail.google.com/mail/#search/${encodeURIComponent(query)}`;
}
