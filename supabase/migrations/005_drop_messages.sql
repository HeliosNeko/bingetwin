-- ============================================
-- Migration 005 : Suppression de la messagerie
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================

DROP TABLE IF EXISTS public.messages CASCADE;
