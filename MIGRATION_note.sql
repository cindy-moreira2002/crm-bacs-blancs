-- =====================================================
-- MIGRATION — note de l'élève sur chaque copie corrigée
-- À exécuter dans Supabase > SQL Editor (idempotent)
-- =====================================================

-- Note sur 20 (décimales autorisées, ex: 14.5). Nullable tant que non corrigé.
alter table copies
  add column if not exists note numeric;
