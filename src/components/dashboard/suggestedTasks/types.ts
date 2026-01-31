export interface SuggestedTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  category: string;
  related_client: string | null;
  reasoning: string | null;
  status: string;
  created_at: string;
  source_email_id: string | null;
  gmail_message_id: string | null;
  email_subject?: string | null;
  thread_id?: string | null;
  email_from?: string | null;
  email_received_at?: string | null;
  // New triage fields
  triage_category?: 'urgent' | 'important' | 'fyi' | 'ignore' | null;
  email_summary?: string | null;
  action_needed?: string | null;
  sender?: string | null;
  snoozed_until?: string | null;
}

export type TriageCategory = 'urgent' | 'important' | 'fyi' | 'ignore';

export interface TriageStats {
  urgent: number;
  important: number;
  fyi: number;
  ignore: number;
}
