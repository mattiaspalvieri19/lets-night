-- =========================================================
-- SOCIAL + LOYALTY SCHEMA (Fase 1)
-- Estensioni profiles/events + tabelle follows, favorite_venues,
-- event_interests, activities, loyalty_milestones, user_milestones
-- + RLS + seed milestones
-- =========================================================

-- ---------------------------------------------------------
-- 1. profiles: campi social + loyalty + privacy
-- ---------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests text[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS loyalty_points integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS loyalty_level text DEFAULT 'Rookie';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS privacy_settings jsonb DEFAULT '{
  "searchable": true,
  "profile_visibility": "public",
  "show_future_events": true,
  "show_past_events": true,
  "show_photos": true,
  "show_badges": true,
  "show_favorite_venues": true,
  "show_followers": true,
  "show_following": true
}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (LOWER(username)) WHERE username IS NOT NULL;

-- ---------------------------------------------------------
-- 2. events: nuovi campi per filtri avanzati Home
-- ---------------------------------------------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS music_type text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS dress_code text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS age_target text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- ---------------------------------------------------------
-- 3. follows (segui/seguito)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS follows_follower_id_idx ON public.follows(follower_id);

DROP POLICY IF EXISTS "Public can read follows" ON public.follows;
CREATE POLICY "Public can read follows"
  ON public.follows FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can follow others"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
CREATE POLICY "Users can unfollow"
  ON public.follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

-- ---------------------------------------------------------
-- 4. favorite_venues
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorite_venues (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, venue_id)
);
ALTER TABLE public.favorite_venues ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS favorite_venues_user_id_idx ON public.favorite_venues(user_id);

DROP POLICY IF EXISTS "Public can read favorites" ON public.favorite_venues;
CREATE POLICY "Public can read favorites"
  ON public.favorite_venues FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own favorites" ON public.favorite_venues;
CREATE POLICY "Users manage own favorites"
  ON public.favorite_venues FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 5. event_interests (utenti interessati a un evento)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_interests (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
ALTER TABLE public.event_interests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS event_interests_event_id_idx ON public.event_interests(event_id);
CREATE INDEX IF NOT EXISTS event_interests_user_id_idx ON public.event_interests(user_id);

DROP POLICY IF EXISTS "Public can count interests" ON public.event_interests;
CREATE POLICY "Public can count interests"
  ON public.event_interests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own interests" ON public.event_interests;
CREATE POLICY "Users manage own interests"
  ON public.event_interests FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 6. activities (feed sociale)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  milestone_id text,
  image_url text,
  caption text,
  visibility text DEFAULT 'public',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS activities_user_id_idx ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS activities_created_at_idx ON public.activities(created_at DESC);

DROP POLICY IF EXISTS "Users manage own activities" ON public.activities;
CREATE POLICY "Users manage own activities"
  ON public.activities FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Public reads public activities" ON public.activities;
CREATE POLICY "Public reads public activities"
  ON public.activities FOR SELECT
  TO anon, authenticated
  USING (visibility = 'public');

DROP POLICY IF EXISTS "Followers see followers-only activities" ON public.activities;
CREATE POLICY "Followers see followers-only activities"
  ON public.activities FOR SELECT
  TO authenticated
  USING (
    visibility = 'followers'
    AND EXISTS (
      SELECT 1 FROM public.follows
      WHERE following_id = activities.user_id AND follower_id = auth.uid()
    )
  );

-- ---------------------------------------------------------
-- 7. loyalty_milestones (catalogo) + user_milestones (progressi)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_milestones (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  points integer DEFAULT 0,
  goal integer DEFAULT 1,
  icon text,
  category text
);
ALTER TABLE public.loyalty_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Catalog readable by all" ON public.loyalty_milestones;
CREATE POLICY "Catalog readable by all"
  ON public.loyalty_milestones FOR SELECT
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.user_milestones (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_id text REFERENCES public.loyalty_milestones(id) ON DELETE CASCADE,
  progress integer DEFAULT 0,
  unlocked_at timestamptz,
  PRIMARY KEY (user_id, milestone_id)
);
ALTER TABLE public.user_milestones ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS user_milestones_user_id_idx ON public.user_milestones(user_id);

DROP POLICY IF EXISTS "Users manage own milestones" ON public.user_milestones;
CREATE POLICY "Users manage own milestones"
  ON public.user_milestones FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Public reads unlocked milestones" ON public.user_milestones;
CREATE POLICY "Public reads unlocked milestones"
  ON public.user_milestones FOR SELECT
  TO anon, authenticated
  USING (unlocked_at IS NOT NULL);

-- ---------------------------------------------------------
-- 8. Seed milestones
-- ---------------------------------------------------------
INSERT INTO public.loyalty_milestones (id, title, description, points, goal, icon, category) VALUES
  ('first_booking',     'Prima serata',         'Hai prenotato il tuo primo evento',         50,  1,  '🎉', 'starter'),
  ('five_bookings',     '5 biglietti',          'Hai prenotato 5 eventi',                    100, 5,  '🎟️', 'tickets'),
  ('ten_bookings',      '10 biglietti',         'Hai prenotato 10 eventi',                   200, 10, '🏆', 'tickets'),
  ('weekend_warrior',   'Weekend Warrior',      '3 serate nello stesso weekend',             150, 3,  '⚡', 'special'),
  ('photographer',      'Fotografo della notte','Hai caricato la prima foto da una serata',  50,  1,  '📸', 'social'),
  ('table_leader',      'Table Leader',         'Hai organizzato un tavolo condiviso',       100, 1,  '🍾', 'social'),
  ('social_starter',    'Social Starter',       'Hai invitato 3 amici',                      100, 3,  '🤝', 'social'),
  ('vip_lover',         'VIP Lover',            'Hai partecipato a 3 eventi VIP',            200, 3,  '👑', 'special'),
  ('aperitivo_expert',  'Aperitivo Expert',     'Hai partecipato a 5 aperitivi',             150, 5,  '🍹', 'special'),
  ('milano_explorer',   'Milano Explorer',      '5 eventi a Milano',                         100, 5,  '🌃', 'city'),
  ('roma_explorer',     'Roma Explorer',        '5 eventi a Roma',                           100, 5,  '🏛️', 'city'),
  ('multi_city',        'Multi City',           '1 evento in ogni città',                    100, 2,  '✈️', 'special'),
  ('profile_complete',  'Profilo completo',     'Hai compilato tutti i campi',               50,  1,  '✅', 'starter'),
  ('first_favorite',    'Locale del cuore',     'Hai salvato il tuo primo locale',           20,  1,  '❤️', 'starter')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  points = EXCLUDED.points,
  goal = EXCLUDED.goal,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category;
