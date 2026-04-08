-- ============================================
-- Migration 006 : Fonctions d'aide au backfill des genres
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- S'assure que la colonne genres existe (idempotent)
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS genres text[] NOT NULL DEFAULT '{}';

-- ── Retourne les items distincts sans genres ───────────────────────────────
-- Utilisé par le backfill admin pour savoir quoi récupérer
CREATE OR REPLACE FUNCTION public.get_items_missing_genres()
RETURNS TABLE(external_id text, media_type text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT external_id, media_type
  FROM   public.favorites
  WHERE  genres = '{}' OR genres IS NULL
  ORDER  BY media_type, external_id;
$$;

-- ── Met à jour les genres de tous les favorites correspondants ────────────
-- Appelée après avoir récupéré les genres depuis TMDB / Open Library.
-- SECURITY DEFINER : contourne RLS pour mettre à jour tous les utilisateurs.
-- Ne touche que les enregistrements avec genres vides.
CREATE OR REPLACE FUNCTION public.update_favorite_genres(
  p_external_id text,
  p_media_type  text,
  p_genres      text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_updated integer;
BEGIN
  UPDATE public.favorites
  SET    genres = p_genres
  WHERE  external_id = p_external_id
    AND  media_type  = p_media_type
    AND  (genres = '{}' OR genres IS NULL);

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$;
