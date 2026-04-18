-- ============================================================
-- Migration 010 : Préférences multi-sélection (périodes + langues)
-- ============================================================
-- Remplace period (text) et language_group (text) par des tableaux

alter table public.suggestion_preferences
  drop column period,
  drop column language_group,
  add column periods         text[] not null default '{}',
  add column language_groups text[] not null default '{}';
