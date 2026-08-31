import { supabase } from "@/integrations/supabase/client";
import { logEmailActivity } from "@/utils/activityLog";

/**
 * Marks a notice as completed for a property.
 * Fails silently so it never blocks the copy/email flow.
 */
export const markNoticeComplete = async (
  propertyId: string,
  noticeType: string,
  logTo?: string
) => {
  if (!propertyId || !noticeType) return;
  try {
    await supabase
      .from("property_notice_status")
      .upsert(
        {
          property_id: propertyId,
          notice_type: noticeType,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "property_id,notice_type" }
      );

    if (logTo) {
      await logEmailActivity(logTo, `Notice sent: ${noticeType}`);
    }
  } catch (err) {
    console.error("Failed to mark notice complete:", err);
  }
};
