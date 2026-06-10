-- Bucket pubblico per le cover image dei locali. Path: <venue_id>/<filename>.
-- Solo il proprietario del venue può fare INSERT/UPDATE/DELETE; SELECT pubblico.

INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-covers', 'venue-covers', true)
ON CONFLICT (id) DO NOTHING;

-- SELECT: pubblico (le cover sono visibili a tutti).
DROP POLICY IF EXISTS "venue_covers_public_read" ON storage.objects;
CREATE POLICY "venue_covers_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'venue-covers');

-- INSERT: solo se il primo segmento del path corrisponde a un venue di cui sei owner.
DROP POLICY IF EXISTS "venue_covers_owner_insert" ON storage.objects;
CREATE POLICY "venue_covers_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'venue-covers'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.venues WHERE owner_id = auth.uid()
    )
  );

-- UPDATE: stessa logica di INSERT.
DROP POLICY IF EXISTS "venue_covers_owner_update" ON storage.objects;
CREATE POLICY "venue_covers_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'venue-covers'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.venues WHERE owner_id = auth.uid()
    )
  );

-- DELETE: stessa logica.
DROP POLICY IF EXISTS "venue_covers_owner_delete" ON storage.objects;
CREATE POLICY "venue_covers_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'venue-covers'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.venues WHERE owner_id = auth.uid()
    )
  );
