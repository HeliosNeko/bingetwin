-- ============================================
-- Migration 003 : Table app_settings + is_admin
-- + compute_matches avec seuil configurable
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- 1. Colonne is_admin sur profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 2. Table de configuration
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Lecture autorisée à tous les utilisateurs authentifiés
CREATE POLICY "Settings readable by authenticated users" ON public.app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Écriture réservée aux admins
CREATE POLICY "Settings writable by admins only" ON public.app_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- 3. Valeur par défaut du seuil
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'minimum_ratings_required',
  '500',
  'Nombre minimum de notes requises pour qu''un profil soit inclus dans le matching'
)
ON CONFLICT (key) DO NOTHING;

-- 4. compute_matches — Pearson + seuil configurable
CREATE OR REPLACE FUNCTION public.compute_matches(target_user_id uuid)
RETURNS void AS $$
DECLARE
  threshold           INTEGER;
  target_rated_count  INTEGER;
  other_user          RECORD;
  n                   FLOAT;
  sum_x               FLOAT;
  sum_y               FLOAT;
  sum_xy              FLOAT;
  sum_x2              FLOAT;
  sum_y2              FLOAT;
  numerator           FLOAT;
  denominator         FLOAT;
  pearson             FLOAT;
  similarity          INTEGER;
  mtype               TEXT;
  u1                  UUID;
  u2                  UUID;
BEGIN
  -- ── Lire le seuil depuis app_settings ─────────────────────────────────
  SELECT COALESCE(value::INTEGER, 500)
  INTO threshold
  FROM public.app_settings
  WHERE key = 'minimum_ratings_required';

  threshold := COALESCE(threshold, 500);

  -- ── Vérifier si l'utilisateur cible atteint le seuil ─────────────────
  SELECT COUNT(*)
  INTO target_rated_count
  FROM public.favorites
  WHERE user_id = target_user_id
    AND rating IS NOT NULL;

  -- Profil non éligible : nettoyage de ses anciens matches et sortie
  IF target_rated_count < threshold THEN
    DELETE FROM public.matches
    WHERE user1_id = target_user_id OR user2_id = target_user_id;
    RETURN;
  END IF;

  -- ── Boucle sur les autres utilisateurs éligibles ──────────────────────
  FOR other_user IN
    SELECT user_id
    FROM public.favorites
    WHERE user_id != target_user_id
      AND rating IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) >= threshold
  LOOP

    -- Composantes Pearson
    SELECT
      COUNT(*)::FLOAT,
      COALESCE(SUM(f1.rating::FLOAT), 0),
      COALESCE(SUM(f2.rating::FLOAT), 0),
      COALESCE(SUM(f1.rating::FLOAT * f2.rating::FLOAT), 0),
      COALESCE(SUM(f1.rating::FLOAT ^ 2), 0),
      COALESCE(SUM(f2.rating::FLOAT ^ 2), 0)
    INTO n, sum_x, sum_y, sum_xy, sum_x2, sum_y2
    FROM public.favorites f1
    INNER JOIN public.favorites f2
      ON  f1.media_type  = f2.media_type
      AND f1.external_id = f2.external_id
    WHERE f1.user_id = target_user_id
      AND f2.user_id = other_user.user_id
      AND f1.rating  IS NOT NULL
      AND f2.rating  IS NOT NULL;

    -- Pearson (n ≥ 2)
    IF n >= 2 THEN
      numerator   := n * sum_xy - sum_x * sum_y;
      denominator := SQRT(
        GREATEST(0, (n * sum_x2 - sum_x ^ 2) * (n * sum_y2 - sum_y ^ 2))
      );

      IF denominator = 0 THEN
        pearson := 1.0;
      ELSE
        pearson := GREATEST(-1.0, LEAST(1.0, numerator / denominator));
      END IF;

      similarity := GREATEST(0, ROUND(pearson * 100))::INTEGER;

    -- Fallback proximité (n = 1)
    ELSIF n = 1 THEN
      SELECT GREATEST(0, 70 - ABS(f1.rating - f2.rating) * 20)
      INTO similarity
      FROM public.favorites f1
      INNER JOIN public.favorites f2
        ON  f1.media_type  = f2.media_type
        AND f1.external_id = f2.external_id
      WHERE f1.user_id = target_user_id
        AND f2.user_id = other_user.user_id
        AND f1.rating  IS NOT NULL
        AND f2.rating  IS NOT NULL;
    ELSE
      similarity := 0;
    END IF;

    -- Garantir user1_id < user2_id
    IF target_user_id < other_user.user_id THEN
      u1 := target_user_id;    u2 := other_user.user_id;
    ELSE
      u1 := other_user.user_id; u2 := target_user_id;
    END IF;

    IF similarity >= 60 THEN
      mtype := CASE WHEN similarity >= 85 THEN 'jumeau' ELSE 'cousin' END;

      INSERT INTO public.matches (user1_id, user2_id, score, common_favorites, match_type)
      VALUES (u1, u2, similarity, n::INTEGER, mtype)
      ON CONFLICT (user1_id, user2_id) DO UPDATE SET
        score            = EXCLUDED.score,
        common_favorites = EXCLUDED.common_favorites,
        match_type       = EXCLUDED.match_type;
    ELSE
      DELETE FROM public.matches WHERE user1_id = u1 AND user2_id = u2;
    END IF;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Pour désigner un admin manuellement ───────────────────────────────────
-- UPDATE public.profiles SET is_admin = true WHERE id = '<user-uuid>';
