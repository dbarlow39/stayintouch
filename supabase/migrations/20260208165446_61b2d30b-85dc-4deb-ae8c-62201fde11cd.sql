
-- Allow anonymous (unauthenticated) users to read the invite code for signup validation
CREATE POLICY "Allow anon read for signup" ON public.app_settings FOR SELECT TO anon USING (true);
