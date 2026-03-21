CREATE POLICY "Users can update own property documents"
ON public.property_documents
FOR UPDATE
TO authenticated
USING (agent_id = auth.uid())
WITH CHECK (agent_id = auth.uid());