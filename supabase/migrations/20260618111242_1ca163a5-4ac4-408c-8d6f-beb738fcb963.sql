GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_analysis_files TO authenticated;
GRANT ALL ON public.market_analysis_files TO service_role;

CREATE POLICY "Agents can update their own market analysis files"
ON public.market_analysis_files
FOR UPDATE
TO authenticated
USING (auth.uid() = agent_id)
WITH CHECK (auth.uid() = agent_id);