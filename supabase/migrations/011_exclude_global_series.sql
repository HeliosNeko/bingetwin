-- ============================================================
-- Migration 011 : Exclure les séries globales du matching
-- + Ajout colonne match_type sur la table matches
-- ============================================================

-- 1. Ajouter la colonne match_type si elle n'existe pas encore
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS match_type text
CHECK (match_type IN ('jumeau', 'cousin'));

-- 2. Recréer compute_matches en LANGUAGE sql pur (pas de plpgsql, pas de SELECT INTO)
CREATE OR REPLACE FUNCTION public.compute_matches(target_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$

  WITH

  others AS (
    SELECT DISTINCT user_id AS other_id
    FROM public.favorites
    WHERE user_id != target_user_id
  ),

  pairs AS (
    SELECT
      f2.user_id        AS other_id,
      f1.rating::FLOAT  AS rx,
      f2.rating::FLOAT  AS ry
    FROM public.favorites f1
    JOIN public.favorites f2
      ON  f1.media_type  = f2.media_type
      AND f1.external_id = f2.external_id
    WHERE f1.user_id  = target_user_id
      AND f2.user_id != target_user_id
      AND f1.rating IS NOT NULL
      AND f2.rating IS NOT NULL
      AND NOT (f1.media_type = 'series' AND f1.external_id !~ '_s[0-9]+$')
      AND NOT (f2.media_type = 'series' AND f2.external_id !~ '_s[0-9]+$')
  ),

  agg AS (
    SELECT
      o.other_id,
      COUNT(p.rx)::FLOAT           AS cnt,
      COALESCE(SUM(p.rx),      0)  AS sx,
      COALESCE(SUM(p.ry),      0)  AS sy,
      COALESCE(SUM(p.rx*p.ry), 0)  AS sxy,
      COALESCE(SUM(p.rx*p.rx), 0)  AS sx2,
      COALESCE(SUM(p.ry*p.ry), 0)  AS sy2
    FROM others o
    LEFT JOIN pairs p USING (other_id)
    GROUP BY o.other_id
  ),

  scored AS (
    SELECT
      other_id,
      cnt::INTEGER AS common_count,
      CASE
        WHEN cnt >= 2 THEN
          GREATEST(0, ROUND(
            GREATEST(-1.0, LEAST(1.0,
              CASE
                WHEN SQRT(GREATEST(0, (cnt*sx2 - sx*sx) * (cnt*sy2 - sy*sy))) = 0
                THEN 1.0
                ELSE (cnt*sxy - sx*sy)
                     / SQRT(GREATEST(0, (cnt*sx2 - sx*sx) * (cnt*sy2 - sy*sy)))
              END
            )) * 100
          ))::INTEGER
        WHEN cnt = 1 THEN
          GREATEST(0, ROUND(70 - ABS(sx - sy) * 20))::INTEGER
        ELSE 0
      END AS sim
    FROM agg
  ),

  candidates AS (
    SELECT
      CASE WHEN target_user_id < other_id THEN target_user_id ELSE other_id      END AS u1,
      CASE WHEN target_user_id < other_id THEN other_id      ELSE target_user_id END AS u2,
      sim,
      common_count
    FROM scored
  ),

  upserted AS (
    INSERT INTO public.matches (user1_id, user2_id, score, common_favorites, match_type)
    SELECT
      u1, u2, sim, common_count,
      CASE WHEN sim >= 85 THEN 'jumeau' ELSE 'cousin' END
    FROM candidates
    WHERE sim >= 60
    ON CONFLICT (user1_id, user2_id) DO UPDATE SET
      score            = EXCLUDED.score,
      common_favorites = EXCLUDED.common_favorites,
      match_type       = EXCLUDED.match_type
  )

  DELETE FROM public.matches m
  USING candidates c
  WHERE c.sim < 60
    AND m.user1_id = c.u1
    AND m.user2_id = c.u2;

$$;
