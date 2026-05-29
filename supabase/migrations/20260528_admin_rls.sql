-- Admin RLS Migration
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Create admins table
CREATE TABLE IF NOT EXISTS public.admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to check admin status (needed for RLS sub-queries)
CREATE POLICY "Authenticated users can read admins"
  ON public.admins FOR SELECT TO authenticated
  USING (true);

-- 2. Insert Mattia as admin
INSERT INTO public.admins (user_id)
VALUES ('eb62a411-f709-4990-9a09-52f7846ac18f')
ON CONFLICT DO NOTHING;

-- 3. Update venues UPDATE policy: allow owners AND admins
DROP POLICY IF EXISTS "Owners can update own venues" ON public.venues;
CREATE POLICY "Owners and admins can update venues"
  ON public.venues FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() = owner_id OR auth.uid() IN (SELECT user_id FROM public.admins));

-- 4. Update venues DELETE policy: allow owners AND admins
DROP POLICY IF EXISTS "Owners can delete own venues" ON public.venues;
CREATE POLICY "Owners and admins can delete venues"
  ON public.venues FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR auth.uid() IN (SELECT user_id FROM public.admins));

-- 5. Add events SELECT policy for admins (so admin can see inactive events)
CREATE POLICY "Admins can view all events"
  ON public.events FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins));

-- 6. Add events UPDATE policy for admins (to toggle is_active)
CREATE POLICY "Admins can update any event"
  ON public.events FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));

-- 7. Add events DELETE policy for admins
CREATE POLICY "Admins can delete any event"
  ON public.events FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins));
