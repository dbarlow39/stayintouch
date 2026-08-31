import { supabase } from "@/integrations/supabase/client";

/**
 * Universal outgoing-activity logger.
 *
 * Every app-generated email action (Copy & Email letters, notices, contact
 * buttons) records a row in client_email_logs so it shows up in the client's
 * Notes timeline. Fails silently — logging must never block the user action.
 */

const recent = new Map<string, number>();
const DEDUPE_MS = 10000;

export const logEmailActivity = async (
  toEmail: string,
  subject?: string,
  description?: string
) => {
  try {
    const to = (toEmail || "").trim();
    if (!to) return;

    const key = `${to.toLowerCase()}|${(subject || "").toLowerCase()}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;

    await supabase.from("client_email_logs").insert({
      agent_id: user.id,
      gmail_message_id: `app-${crypto.randomUUID()}`,
      direction: "outgoing",
      from_email: user.email || "me",
      to_email: to,
      subject: subject || "(No subject)",
      snippet: description || subject || null,
      body_preview: description || null,
      received_at: new Date().toISOString(),
      notes: "Logged automatically by the app",
    });
  } catch (err) {
    console.error("Failed to log email activity:", err);
  }
};
