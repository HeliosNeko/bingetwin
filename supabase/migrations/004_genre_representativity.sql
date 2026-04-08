-- ============================================
-- Migration 004 : Représentativité des genres
-- Distance de Jensen-Shannon sur distributions
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- 1. Colonne genres sur favorites
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS genres text[] NOT NULL DEFAULT '{}';

-- Index GIN pour les requêtes sur tableaux de genres
CREATE INDEX IF NOT EXISTS favorites_genres_gin
  ON public.favorites USING GIN(genres);

-- 2. Nouveau paramètre dans app_settings
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'genre_representativity_threshold',
  '70',
  'Pourcentage minimum (0-100) de similarité Jensen-Shannon entre la distribution des genres communs et la distribution globale de chaque utilisateur. En dessous, le match est rejeté même si la corrélation de Pearson est bonne.'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Colonne genre_representativity sur matches (score 0-100)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS genre_representativity INTEGER NOT NULL DEFAULT 100;

-- ============================================
-- 4. Fonction : similarité JS entre deux distributions de genres
--
--    Calcule min(sim_A, sim_B) où :
--      sim_X = 1 - JS(dist_globale_X || dist_commune_X) / ln(2)
--
--    Valeur retournée : [0.0 .. 1.0]
--      1.0 = les items communs sont parfaitement représentatifs
--      0.0 = les items communs sont totalement atypiques
--
--    Si aucun genre n'est disponible → retourne 1.0 (check ignoré)
-- ============================================
CREATE OR REPLACE FUNCTION public.compute_genre_js_similarity(
  p_user_a uuid,
  p_user_b uuid
)
RETURNS FLOAT AS $$
DECLARE
  has_genre_data BOOLEAN;
  score_a        FLOAT;
  score_b        FLOAT;
BEGIN
  -- ── Vérifier la présence de données de genres ──────────────────────────
  SELECT EXISTS (
    SELECT 1
    FROM   public.favorites f1
    JOIN   public.favorites f2
           ON  f1.media_type  = f2.media_type
           AND f1.external_id = f2.external_id
    WHERE  f1.user_id = p_user_a
      AND  f2.user_id = p_user_b
      AND  f1.rating  IS NOT NULL
      AND  f2.rating  IS NOT NULL
      AND  cardinality(f1.genres) > 0
  ) INTO has_genre_data;

  -- Sans données de genres : check ignoré, représentativité parfaite
  IF NOT has_genre_data THEN
    RETURN 1.0;
  END IF;

  -- ── Score de représentativité pour l'utilisateur A ─────────────────────
  -- JS(P || Q) = 0.5·KL(P||M) + 0.5·KL(Q||M),  M = (P+Q)/2
  -- Calculé comme : SUM[ p·ln(p/m) + q·ln(q/m) ] / (2·ln2)
  -- Normalisé dans [0, 1] ; 0 = distributions identiques
  WITH
    -- IDs des items communs (notés par les deux)
    common_ids AS (
      SELECT f1.media_type, f1.external_id
      FROM   public.favorites f1
      JOIN   public.favorites f2
             ON  f1.media_type  = f2.media_type
             AND f1.external_id = f2.external_id
      WHERE  f1.user_id = p_user_a
        AND  f2.user_id = p_user_b
        AND  f1.rating  IS NOT NULL
        AND  f2.rating  IS NOT NULL
    ),
    -- Distribution globale des genres de A
    a_global AS (
      SELECT lower(g) AS genre, COUNT(*)::FLOAT AS cnt
      FROM   public.favorites f, unnest(f.genres) g
      WHERE  f.user_id = p_user_a
        AND  f.rating  IS NOT NULL
        AND  cardinality(f.genres) > 0
      GROUP  BY 1
    ),
    -- Distribution des genres de A dans les items communs
    a_common AS (
      SELECT lower(g) AS genre, COUNT(*)::FLOAT AS cnt
      FROM   public.favorites f
      JOIN   common_ids c
             ON  f.media_type  = c.media_type
             AND f.external_id = c.external_id,
             unnest(f.genres) g
      WHERE  f.user_id = p_user_a
        AND  cardinality(f.genres) > 0
      GROUP  BY 1
    ),
    totals AS (
      SELECT
        GREATEST((SELECT SUM(cnt) FROM a_global), 1) AS g_tot,
        GREATEST((SELECT SUM(cnt) FROM a_common), 1) AS c_tot
    ),
    all_genres AS (
      SELECT genre FROM a_global
      UNION
      SELECT genre FROM a_common
    ),
    dist_a AS (
      SELECT
        COALESCE(ag.cnt, 0) / (SELECT g_tot FROM totals) AS p,
        COALESCE(ac.cnt, 0) / (SELECT c_tot FROM totals) AS q
      FROM   all_genres gn
      LEFT   JOIN a_global ag ON ag.genre = gn.genre
      LEFT   JOIN a_common ac ON ac.genre = gn.genre
    )
  SELECT
    1.0 - LEAST(1.0, GREATEST(0.0,
      COALESCE(
        SUM(
          CASE WHEN p > 0 AND (p+q)/2.0 > 0
               THEN p * ln(p / ((p+q)/2.0)) ELSE 0 END
          +
          CASE WHEN q > 0 AND (p+q)/2.0 > 0
               THEN q * ln(q / ((p+q)/2.0)) ELSE 0 END
        ) / (2.0 * ln(2)),
        0
      )
    ))
  INTO score_a
  FROM dist_a;

  -- ── Score de représentativité pour l'utilisateur B ─────────────────────
  WITH
    common_ids AS (
      SELECT f1.media_type, f1.external_id
      FROM   public.favorites f1
      JOIN   public.favorites f2
             ON  f1.media_type  = f2.media_type
             AND f1.external_id = f2.external_id
      WHERE  f1.user_id = p_user_a
        AND  f2.user_id = p_user_b
        AND  f1.rating  IS NOT NULL
        AND  f2.rating  IS NOT NULL
    ),
    b_global AS (
      SELECT lower(g) AS genre, COUNT(*)::FLOAT AS cnt
      FROM   public.favorites f, unnest(f.genres) g
      WHERE  f.user_id = p_user_b
        AND  f.rating  IS NOT NULL
        AND  cardinality(f.genres) > 0
      GROUP  BY 1
    ),
    b_common AS (
      SELECT lower(g) AS genre, COUNT(*)::FLOAT AS cnt
      FROM   public.favorites f
      JOIN   common_ids c
             ON  f.media_type  = c.media_type
             AND f.external_id = c.external_id,
             unnest(f.genres) g
      WHERE  f.user_id = p_user_b
        AND  cardinality(f.genres) > 0
      GROUP  BY 1
    ),
    totals AS (
      SELECT
        GREATEST((SELECT SUM(cnt) FROM b_global), 1) AS g_tot,
        GREATEST((SELECT SUM(cnt) FROM b_common), 1) AS c_tot
    ),
    all_genres AS (
      SELECT genre FROM b_global
      UNION
      SELECT genre FROM b_common
    ),
    dist_b AS (
      SELECT
        COALESCE(bg.cnt, 0) / (SELECT g_tot FROM totals) AS p,
        COALESCE(bc.cnt, 0) / (SELECT c_tot FROM totals) AS q
      FROM   all_genres gn
      LEFT   JOIN b_global bg ON bg.genre = gn.genre
      LEFT   JOIN b_common bc ON bc.genre = gn.genre
    )
  SELECT
    1.0 - LEAST(1.0, GREATEST(0.0,
      COALESCE(
        SUM(
          CASE WHEN p > 0 AND (p+q)/2.0 > 0
               THEN p * ln(p / ((p+q)/2.0)) ELSE 0 END
          +
          CASE WHEN q > 0 AND (p+q)/2.0 > 0
               THEN q * ln(q / ((p+q)/2.0)) ELSE 0 END
        ) / (2.0 * ln(2)),
        0
      )
    ))
  INTO score_b
  FROM dist_b;

  -- Le score retenu est le minimum des deux (les deux doivent passer)
  RETURN LEAST(COALESCE(score_a, 1.0), COALESCE(score_b, 1.0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 5. compute_matches — version finale avec :
--    • Seuil minimum de notes (minimum_ratings_required)
--    • Corrélation de Pearson sur les notes
--    • Validation Jensen-Shannon sur les genres
-- ============================================
CREATE OR REPLACE FUNCTION public.compute_matches(target_user_id uuid)
RETURNS void AS $$
DECLARE
  threshold           INTEGER;
  genre_threshold     FLOAT;
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
  genre_sim           FLOAT;
  mtype               TEXT;
  u1                  UUID;
  u2                  UUID;
BEGIN
  -- ── Lire les paramètres depuis app_settings ───────────────────────────
  SELECT COALESCE(value::INTEGER, 500) INTO threshold
  FROM   public.app_settings WHERE key = 'minimum_ratings_required';
  threshold := COALESCE(threshold, 500);

  SELECT COALESCE(value::FLOAT / 100.0, 0.70) INTO genre_threshold
  FROM   public.app_settings WHERE key = 'genre_representativity_threshold';
  genre_threshold := COALESCE(genre_threshold, 0.70);

  -- ── Vérifier si l'utilisateur cible atteint le seuil ─────────────────
  SELECT COUNT(*) INTO target_rated_count
  FROM   public.favorites
  WHERE  user_id = target_user_id AND rating IS NOT NULL;

  IF target_rated_count < threshold THEN
    DELETE FROM public.matches
    WHERE  user1_id = target_user_id OR user2_id = target_user_id;
    RETURN;
  END IF;

  -- ── Boucle sur les partenaires éligibles ──────────────────────────────
  FOR other_user IN
    SELECT user_id
    FROM   public.favorites
    WHERE  user_id != target_user_id AND rating IS NOT NULL
    GROUP  BY user_id
    HAVING COUNT(*) >= threshold
  LOOP

    -- ── Corrélation de Pearson ──────────────────────────────────────────
    SELECT
      COUNT(*)::FLOAT,
      COALESCE(SUM(f1.rating::FLOAT), 0),
      COALESCE(SUM(f2.rating::FLOAT), 0),
      COALESCE(SUM(f1.rating::FLOAT * f2.rating::FLOAT), 0),
      COALESCE(SUM(f1.rating::FLOAT ^ 2), 0),
      COALESCE(SUM(f2.rating::FLOAT ^ 2), 0)
    INTO n, sum_x, sum_y, sum_xy, sum_x2, sum_y2
    FROM   public.favorites f1
    JOIN   public.favorites f2
           ON  f1.media_type  = f2.media_type
           AND f1.external_id = f2.external_id
    WHERE  f1.user_id = target_user_id
      AND  f2.user_id = other_user.user_id
      AND  f1.rating  IS NOT NULL
      AND  f2.rating  IS NOT NULL;

    IF n >= 2 THEN
      numerator   := n * sum_xy - sum_x * sum_y;
      denominator := SQRT(GREATEST(0,
                      (n * sum_x2 - sum_x ^ 2) * (n * sum_y2 - sum_y ^ 2)));
      pearson     := CASE
                       WHEN denominator = 0 THEN 1.0
                       ELSE GREATEST(-1.0, LEAST(1.0, numerator / denominator))
                     END;
      similarity  := GREATEST(0, ROUND(pearson * 100))::INTEGER;

    ELSIF n = 1 THEN
      SELECT GREATEST(0, 70 - ABS(f1.rating - f2.rating) * 20)
      INTO   similarity
      FROM   public.favorites f1
      JOIN   public.favorites f2
             ON  f1.media_type  = f2.media_type
             AND f1.external_id = f2.external_id
      WHERE  f1.user_id = target_user_id
        AND  f2.user_id = other_user.user_id
        AND  f1.rating  IS NOT NULL AND f2.rating IS NOT NULL;
    ELSE
      similarity := 0;
    END IF;

    -- Garantir user1_id < user2_id
    IF target_user_id < other_user.user_id THEN
      u1 := target_user_id;     u2 := other_user.user_id;
    ELSE
      u1 := other_user.user_id; u2 := target_user_id;
    END IF;

    IF similarity >= 60 THEN

      -- ── Validation Jensen-Shannon ──────────────────────────────────────
      genre_sim := public.compute_genre_js_similarity(target_user_id, other_user.user_id);

      IF genre_sim < genre_threshold THEN
        -- Bonne corrélation de Pearson mais genres non représentatifs → rejet
        DELETE FROM public.matches WHERE user1_id = u1 AND user2_id = u2;
        CONTINUE;
      END IF;

      mtype := CASE WHEN similarity >= 85 THEN 'jumeau' ELSE 'cousin' END;

      INSERT INTO public.matches
        (user1_id, user2_id, score, common_favorites, match_type, genre_representativity)
      VALUES
        (u1, u2, similarity, n::INTEGER, mtype, ROUND(genre_sim * 100)::INTEGER)
      ON CONFLICT (user1_id, user2_id) DO UPDATE SET
        score                = EXCLUDED.score,
        common_favorites     = EXCLUDED.common_favorites,
        match_type           = EXCLUDED.match_type,
        genre_representativity = EXCLUDED.genre_representativity;

    ELSE
      DELETE FROM public.matches WHERE user1_id = u1 AND user2_id = u2;
    END IF;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
