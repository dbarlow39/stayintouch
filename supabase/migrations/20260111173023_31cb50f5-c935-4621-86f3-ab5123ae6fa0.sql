-- Allow read access to clients table for external API calls
CREATE POLICY "Allow anon read access for external apps" 
ON public.clients 
FOR SELECT 
USING (true);