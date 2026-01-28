import { addDays, format } from "date-fns";
import { gmailUrlForLegacyHex } from "@/utils/gmailDeepLink";
import type { SuggestedTask } from "./types";

/**
 * Best-effort Gmail URL for a suggested task.
 * Returns null when we don't have enough metadata to link to an email.
 */
export function getSuggestedTaskGmailUrl(suggestion: SuggestedTask): string | null {
  const messageId = (suggestion.gmail_message_id ?? "").trim();
  if (messageId) {
    return `https://mail.google.com/mail/#inbox/${encodeURIComponent(messageId)}`;
  }

  const threadId = (suggestion.thread_id ?? "").trim();
  if (threadId) {
    const directUrl = gmailUrlForLegacyHex(threadId);
    if (directUrl) return directUrl;
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
