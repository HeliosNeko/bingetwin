-- ============================================
-- Migration 002 : Similarité de Pearson
-- + colonne match_type (jumeau / cousin)
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- 1. Nouvelle colonne match_type
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT 'cousin'
  CHECK (match_type IN ('jumeau', 'cousin'));

-- 2. Fonction compute_matches — Pearson sur vecteurs de notes
CREATE OR REPLACE FUNCTION public.compute_matches(target_user_id uuid)
RETURNS void AS $$
DECLARE
  other_user    RECORD;
  n             FLOAT;
  sum_x         FLOAT;
  sum_y         FLOAT;
  sum_xy        FLOAT;
  sum_x2        FLOAT;
  sum_y2        FLOAT;
  numerator     FLOAT;
  denominator   FLOAT;
  pearson       FLOAT;
  similarity    INTEGER;
  mtype         TEXT;
  u1            UUID;
  u2            UUID;
BEGIN
  FOR other_user IN
    SELECT DISTINCT user_id FROM public.favorites
    WHERE user_id != target_user_id
  LOOP

    -- ── Calcul des composantes Pearson ────────────────────────────────────
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

    -- ── Pearson (n ≥ 2) ──────────────────────────────────────────────────
    IF n >= 2 THEN
      numerator   := n * sum_xy - sum_x * sum_y;
      denominator := SQRT(
        GREATEST(0, (n * sum_x2 - sum_x ^ 2) * (n * sum_y2 - sum_y ^ 2))
      );

      IF denominator = 0 THEN
        -- Tous les écarts sont nuls → goûts parfaitement alignés
        pearson := 1.0;
      ELSE
        pearson := GREATEST(-1.0, LEAST(1.0, numerator / denominator));
      END IF;

      similarity := GREATEST(0, ROUND(pearson * 100))::INTEGER;

    -- ── Fallback proximité (n = 1) ────────────────────────────────────────
    ELSIF n = 1 THEN
      -- Score max 70 pour un seul item commun (plafond "cousin")
      -- diff 0 → 70 | diff 1 → 50 | diff 2 → 30 | diff 3 → 10 | diff 4 → 0
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

    -- ── Upsert ou suppression du match ───────────────────────────────────
    -- Garantir user1_id < user2_id (contrainte d'unicité)
    IF target_user_id < other_user.user_id THEN
      u1 := target_user_id;  u2 := other_user.user_id;
    ELSE
      u1 := other_user.user_id;  u2 := target_user_id;
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
      -- Similarité insuffisante → supprimer le match obsolète s'il existe
      DELETE FROM public.matches
      WHERE user1_id = u1 AND user2_id = u2;
    END IF;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
