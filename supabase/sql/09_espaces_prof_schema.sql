-- =====================================================================
--  ESPACES PROF — SCHEMA COMPLET
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj
--       PAS le projet pipeline xgdaibekjmtffvkwvcge.
--
--  A coller dans le SQL Editor du projet CRM. Idempotent : on peut le
--  relancer autant de fois qu'on veut sans rien casser.
--
--  Ce que ce script cree :
--   1. professeurs            — fiche prof (le mot de passe vit dans
--                               auth.users, JAMAIS ici)
--   2. sessions_bacs_blancs   — les bacs blancs, en base (avant : codes
--                               en dur dans src/lib/sessions.ts)
--   3. session_coachs         — quel prof coache quelle session
--   4. revenus_prof           — affiliation + coaching
--   5. inscriptions.session_id + inscriptions.code_affiliation
--
--  Attendu a la fin : le bloc de verification affiche 4 tables creees
--  et les 5 sessions de septembre/octobre 2026 seedees.
-- =====================================================================

-- Garde-fou : on doit etre dans le projet CRM.
do $$
begin
  if to_regclass('public.inscriptions') is null then
    raise exception 'STOP: table public.inscriptions absente. Tu es probablement dans le projet pipeline. Ouvre le projet CRM orpbfnmdlvxmkvyrpvtj, puis relance ce bloc.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. PROFESSEURS
--    Le mot de passe n'est PAS ici : il est hashe par Supabase Auth dans
--    auth.users. user_id fait le lien. L'admin passe par la service_role
--    pour entrer dans un espace, jamais par le mot de passe du prof.
-- ---------------------------------------------------------------------
create table if not exists public.professeurs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique,
  prenom              text not null,
  nom                 text not null,
  email               text not null unique,
  telephone           text,
  matieres            text[] not null default '{}',
  statut_candidature  text not null default 'en_attente',
  statut_compte       text not null default 'actif',
  code_affiliation    text not null unique,
  role                text not null default 'prof',
  notes_admin         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Colonnes ajoutees apres coup (si la table existait deja).
alter table public.professeurs add column if not exists telephone   text;
alter table public.professeurs add column if not exists notes_admin text;
alter table public.professeurs add column if not exists role        text not null default 'prof';

-- statut_candidature : en_attente | acceptee | refusee
-- statut_compte      : actif | suspendu
-- role               : prof | admin
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'professeurs_statut_candidature_check') then
    alter table public.professeurs add constraint professeurs_statut_candidature_check
      check (statut_candidature in ('en_attente', 'acceptee', 'refusee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'professeurs_statut_compte_check') then
    alter table public.professeurs add constraint professeurs_statut_compte_check
      check (statut_compte in ('actif', 'suspendu'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'professeurs_role_check') then
    alter table public.professeurs add constraint professeurs_role_check
      check (role in ('prof', 'admin'));
  end if;
end $$;

create index if not exists professeurs_email_idx    on public.professeurs (lower(email));
create index if not exists professeurs_matieres_idx on public.professeurs using gin (matieres);

-- ---------------------------------------------------------------------
-- 2. SESSIONS DE BACS BLANCS
--    Remplace le tableau en dur de src/lib/sessions.ts.
-- ---------------------------------------------------------------------
create table if not exists public.sessions_bacs_blancs (
  id                 uuid primary key default gen_random_uuid(),
  matiere            text not null,
  date_epreuve       date not null,
  heure_debut        text not null default '9h',
  heure_fin          text,
  places             int  not null default 8,
  coachs_recherches  int  not null default 1,
  statut             text not null default 'ouverte',
  sheet_correction_url text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (matiere, date_epreuve)
);

alter table public.sessions_bacs_blancs
  add column if not exists sheet_correction_url text;

-- statut : ouverte | complete | en_cours | terminee | annulee
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_bacs_blancs_statut_check') then
    alter table public.sessions_bacs_blancs add constraint sessions_bacs_blancs_statut_check
      check (statut in ('ouverte', 'complete', 'en_cours', 'terminee', 'annulee'));
  end if;
end $$;

create index if not exists sessions_date_idx    on public.sessions_bacs_blancs (date_epreuve);
create index if not exists sessions_matiere_idx on public.sessions_bacs_blancs (matiere);

-- ---------------------------------------------------------------------
-- 3. SESSION_COACHS — inscription d'un prof comme coach sur une session
-- ---------------------------------------------------------------------
create table if not exists public.session_coachs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions_bacs_blancs(id) on delete cascade,
  professeur_id uuid not null references public.professeurs(id) on delete cascade,
  statut        text not null default 'confirme',
  remuneration  numeric(10,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (session_id, professeur_id)
);

-- statut : confirme | annule
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'session_coachs_statut_check') then
    alter table public.session_coachs add constraint session_coachs_statut_check
      check (statut in ('confirme', 'annule'));
  end if;
end $$;

create index if not exists session_coachs_prof_idx    on public.session_coachs (professeur_id);
create index if not exists session_coachs_session_idx on public.session_coachs (session_id);

-- ---------------------------------------------------------------------
-- 4. REVENUS_PROF — affiliation + coaching
-- ---------------------------------------------------------------------
create table if not exists public.revenus_prof (
  id            uuid primary key default gen_random_uuid(),
  professeur_id uuid not null references public.professeurs(id) on delete cascade,
  type          text not null,
  montant       numeric(10,2) not null default 0,
  session_id    uuid references public.sessions_bacs_blancs(id) on delete set null,
  libelle       text,
  statut        text not null default 'a_payer',
  created_at    timestamptz not null default now()
);

-- type   : affiliation | coaching
-- statut : a_payer | paye
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'revenus_prof_type_check') then
    alter table public.revenus_prof add constraint revenus_prof_type_check
      check (type in ('affiliation', 'coaching'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'revenus_prof_statut_check') then
    alter table public.revenus_prof add constraint revenus_prof_statut_check
      check (statut in ('a_payer', 'paye'));
  end if;
end $$;

create index if not exists revenus_prof_prof_idx on public.revenus_prof (professeur_id);

-- ---------------------------------------------------------------------
-- 5. INSCRIPTIONS ELEVES — rattachement a une session + affiliation
-- ---------------------------------------------------------------------
alter table public.inscriptions add column if not exists date_epreuve     date;
alter table public.inscriptions add column if not exists session_id       uuid;
alter table public.inscriptions add column if not exists code_affiliation text;
alter table public.inscriptions add column if not exists statut_eleve     text default 'inscrit';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inscriptions_session_id_fkey') then
    alter table public.inscriptions
      add constraint inscriptions_session_id_fkey
      foreign key (session_id) references public.sessions_bacs_blancs(id) on delete set null;
  end if;
end $$;

create index if not exists inscriptions_session_idx     on public.inscriptions (session_id);
create index if not exists inscriptions_affiliation_idx on public.inscriptions (code_affiliation);

-- ---------------------------------------------------------------------
-- 6. SEED DES SESSIONS (celles qui etaient en dur dans sessions.ts)
-- ---------------------------------------------------------------------
insert into public.sessions_bacs_blancs (matiere, date_epreuve, heure_debut, heure_fin, places, coachs_recherches)
select v.matiere, v.date_epreuve, v.heure_debut, v.heure_fin, v.places, v.coachs
from (
  values
    (convert_from(decode('4672616ec3a7616973', 'hex'), 'UTF8'),       date '2026-09-06', '9h', '13h',  8, 2),
    (convert_from(decode('4d617468c3a96d61746971756573', 'hex'), 'UTF8'), date '2026-09-13', '9h', '12h',  6, 1),
    ('Philosophie',                                                   date '2026-09-20', '9h', '13h', 10, 2),
    (convert_from(decode('486973746f6972652d47c3a96f', 'hex'), 'UTF8'), date '2026-09-27', '9h', '13h',  5, 1),
    ('SES',                                                           date '2026-10-04', '9h', '12h',  8, 1)
) as v(matiere, date_epreuve, heure_debut, heure_fin, places, coachs)
on conflict (matiere, date_epreuve) do nothing;

-- Rattache les inscriptions eleves existantes a leur session (meme matiere + meme date).
update public.inscriptions i
set session_id = s.id
from public.sessions_bacs_blancs s
where i.session_id is null
  and i.date_epreuve is not null
  and i.matiere = s.matiere
  and i.date_epreuve = s.date_epreuve;

-- ---------------------------------------------------------------------
-- 6 bis. CORRECTIONS_GRILLE
--    Ce que le prof a importe depuis le Google Sheet de correction, apres
--    relecture. Une ligne par eleve et par session. `criteres` est un JSON
--    libre : les colonnes de la grille changent d'une matiere a l'autre, on
--    ne veut pas les figer dans le schema.
-- ---------------------------------------------------------------------
create table if not exists public.corrections_grille (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions_bacs_blancs(id) on delete cascade,
  inscription_id uuid not null,
  professeur_id  uuid not null references public.professeurs(id) on delete cascade,
  eleve_nom      text not null,
  note           numeric(4,2),
  criteres       jsonb not null default '{}'::jsonb,
  colonnes       jsonb not null default '[]'::jsonb,
  statut         text not null default 'validee',
  dossier_url    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, inscription_id)
);

-- statut : validee | dossier_demande | dossier_genere
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'corrections_grille_statut_check') then
    alter table public.corrections_grille add constraint corrections_grille_statut_check
      check (statut in ('validee', 'dossier_demande', 'dossier_genere'));
  end if;
end $$;

create index if not exists corrections_grille_session_idx on public.corrections_grille (session_id);

-- ---------------------------------------------------------------------
-- 7. RLS — tout passe par nos routes /api en service_role.
--    On active RLS sans policy publique : le navigateur (cle anon) ne
--    peut donc rien lire ni ecrire directement sur ces tables.
-- ---------------------------------------------------------------------
alter table public.professeurs          enable row level security;
alter table public.session_coachs       enable row level security;
alter table public.revenus_prof         enable row level security;
alter table public.sessions_bacs_blancs enable row level security;
alter table public.corrections_grille   enable row level security;

-- Les sessions sont l'unique info publique (page d'inscription eleve).
drop policy if exists sessions_lecture_publique on public.sessions_bacs_blancs;
create policy sessions_lecture_publique
  on public.sessions_bacs_blancs for select
  using (true);

-- ---------------------------------------------------------------------
-- VERIFICATION
-- ---------------------------------------------------------------------
select 'tables' as controle, string_agg(table_name, ', ' order by table_name) as resultat
from information_schema.tables
where table_schema = 'public'
  and table_name in ('professeurs', 'sessions_bacs_blancs', 'session_coachs', 'revenus_prof')
union all
select 'sessions seedees', count(*)::text from public.sessions_bacs_blancs
union all
select 'inscriptions rattachees', count(*)::text from public.inscriptions where session_id is not null;
