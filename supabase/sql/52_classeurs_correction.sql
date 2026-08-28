-- 52 — Un classeur de correction par bac blanc, et son archive
--
-- Jusqu'ici, le professeur ouvrait LE classeur de sa matière : le même fichier
-- pour toutes les sessions, tous les profs, toutes les dates. Deux bacs blancs
-- de maths le même mois écrivaient donc dans les mêmes cases, et une correction
-- litigieuse était impossible à retrouver : il n'en restait aucune trace datée.
--
-- Désormais, chaque bac blanc reçoit SA COPIE du classeur de la matière,
-- intitulée « Bac blanc — Mathématiques — 14 novembre 2026 — Léa Dupont ».
-- Elle est rangée à deux endroits, et c'est le point de ce script :
--   · dans l'espace du professeur, qui l'ouvre d'un clic depuis sa console ;
--   · dans une archive, côté administration, pour la retrouver des mois après.
--
-- Rejouable sans risque.

-- --- Garde-fou : on doit être dans le projet CRM ----------------------

do $$
begin
  if to_regclass('public.sessions_bacs_blancs') is null then
    raise exception 'STOP: table public.sessions_bacs_blancs absente. Ouvre le projet CRM, puis relance ce script.';
  end if;
end $$;

-- --- L'archive ---------------------------------------------------------
--
-- Une ligne par classeur créé. On ne supprime jamais : c'est précisément la
-- ligne qu'on veut encore avoir sous les yeux le jour où un élève conteste sa
-- note. Le classeur peut disparaître du Drive, la trace de son existence, non.

create table if not exists public.classeurs_correction (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions_bacs_blancs(id) on delete cascade,
  professeur_id  uuid references public.professeurs(id) on delete set null,
  -- Recopiés à la création plutôt que lus par jointure : si la session est
  -- renommée ou le prof supprimé, l'archive doit continuer à dire ce qui a été
  -- corrigé, par qui, et quand.
  matiere        text not null,
  date_epreuve   date,
  professeur_nom text,
  nom            text not null,
  url            text not null,
  cree_le        timestamptz not null default now()
);

comment on table public.classeurs_correction is
  'Archive des classeurs de correction : une copie du classeur de la matière par bac blanc. Sert au professeur (sa console) et à l''administration (retrouver une correction).';

-- Un seul classeur par (bac blanc, professeur) : recliquer sur « Créer mon
-- classeur » ne doit pas semer trois copies dans le Drive. La contrainte est
-- en base, pas seulement dans le code.
create unique index if not exists classeurs_correction_un_par_prof
  on public.classeurs_correction (session_id, professeur_id);

create index if not exists classeurs_correction_session_idx
  on public.classeurs_correction (session_id, cree_le desc);

alter table public.classeurs_correction enable row level security;
-- Aucune politique : lu et écrit uniquement par le serveur (service_role).

-- --- Vérification -----------------------------------------------------

select 'table' as quoi, 'classeurs_correction' as nom,
       (select count(*)::text from information_schema.tables
         where table_name = 'classeurs_correction') as present;
