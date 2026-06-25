-- =====================================================
-- MIGRATION COMPLÈTE — Les Matinées du Bac
-- À exécuter dans Supabase > SQL Editor
-- Idempotent (IF NOT EXISTS / IF NOT EXISTS)
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. TABLE inscriptions (existe déjà, on ajoute les colonnes manquantes)
-- ─────────────────────────────────────────────────────

alter table inscriptions
  add column if not exists email_parent text,
  add column if not exists date_epreuve date,
  add column if not exists rappel_j1_envoye boolean default false,
  add column if not exists rappel_h1_envoye boolean default false;

-- ─────────────────────────────────────────────────────
-- 2. TABLE copies (à créer)
-- ─────────────────────────────────────────────────────

create table if not exists copies (
  id            uuid primary key default gen_random_uuid(),
  matiere       text not null,
  eleve_nom     text not null,
  eleve_email   text,
  prof_email    text,
  notes_prof    text,
  copie_texte   text,
  remarques     text,

  -- Fichier déposé par le prof (base64 ou Storage)
  fichier_base64 text,
  fichier_type   text,
  fichier_nom    text,

  -- Correction générée
  correction_texte text,
  pdf_base64       text,
  pdf_pret         boolean default false,

  -- Workflow
  statut    text not null default 'à_corriger',  -- 'à_corriger' | 'corrigé' | 'envoyé'
  a_envoyer boolean default false,
  envoye    boolean default false,

  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────
-- 3. INDEX utiles
-- ─────────────────────────────────────────────────────

create index if not exists idx_copies_eleve_email on copies(eleve_email);
create index if not exists idx_copies_statut      on copies(statut);
create index if not exists idx_inscriptions_email on inscriptions(email);
create index if not exists idx_inscriptions_rappels
  on inscriptions(rappel_j1_envoye, rappel_h1_envoye)
  where rappel_j1_envoye = false or rappel_h1_envoye = false;

-- ─────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (désactivé = accès via clé anon OK)
-- ─────────────────────────────────────────────────────
-- Si tu veux restreindre plus tard, active RLS et ajoute des policies ici.
-- alter table copies enable row level security;
-- alter table inscriptions enable row level security;
