-- Add INSERT policy for sms_logs table so agents can log their sent SMS messages
CREATE POLICY "Agents can insert their SMS logs"
  ON public.sms_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = agent_id);