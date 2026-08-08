-- =====================================================================
--  PILOTAGE DES BACS BLANCS : SUJETS ET RETOURS DES PROFS
--
--  OU  : Supabase, projet CRM (celui de NEXT_PUBLIC_SUPABASE_URL,
--        orpbfnmdlvxmkvyrpvtj) — PAS le projet du pipeline de correction.
--  QUOI: SQL Editor > New query > coller TOUT > Run.
--
--  Ce que cela ajoute, et pourquoi :
--
--  1. session_sujets — le sujet d'un bac blanc. Il n'existait nulle part :
--     les fiches sujets du pipeline (subject_cards) servent a CORRIGER,
--     elles ne sont ni deposables depuis le site, ni visibles du prof qui
--     surveille l'epreuve. Cette table porte le fichier depose par
--     l'administratrice (Storage, bucket "sujets"), et facultativement
--     l'identifiant de la fiche du pipeline quand elle existe.
--
--  2. session_retours — le questionnaire de fin de session. Un prof, une
--     session, un retour (contrainte d'unicite) ; il peut le modifier tant
--     qu'il veut, c'est le meme enregistrement qui est mis a jour.
--
--  Idempotent : rejouable sans risque.
--  RLS actif SANS policy : la cle anon du navigateur ne lit rien. Seul le
--  serveur, avec la cle service_role, entre — comme pour emails_brevo.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  1. LES SUJETS
-- ---------------------------------------------------------------------
create table if not exists public.session_sujets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions_bacs_blancs(id) on delete cascade,

  -- 'sujet' (l'enonce remis aux eleves), 'corrige', 'bareme', 'annexe'.
  type text not null default 'sujet',
  titre text,
  consigne text,

  -- Fichier dans le Storage du projet CRM, bucket "sujets".
  fichier_path text,
  fichier_nom text,
  fichier_octets bigint,

  -- Fiche du pipeline de correction, quand le sujet y a ete installe.
  -- Pas de cle etrangere : elle vit dans un AUTRE projet Supabase.
  subject_card_id text,

  -- Visible dans l'espace prof ? Un sujet se prepare souvent en avance ;
  -- on ne le montre aux profs qu'une fois pret.
  visible_prof boolean not null default false,

  depose_par uuid references public.professeurs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_sujets_session_idx on public.session_sujets (session_id);

-- ---------------------------------------------------------------------
--  2. LES RETOURS DE FIN DE SESSION
-- ---------------------------------------------------------------------
create table if not exists public.session_retours (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions_bacs_blancs(id) on delete cascade,
  professeur_id uuid not null references public.professeurs(id) on delete cascade,

  -- Le questionnaire. Chaque champ est facultatif : un retour partiel vaut
  -- mieux qu'un retour jamais envoye.
  deroulement text,              -- 'tres_bien' | 'bien' | 'moyen' | 'difficile'
  nb_eleves_presents integer,
  nb_eleves_absents integer,
  duree_adaptee text,            -- 'trop_court' | 'juste' | 'trop_long'
  difficulte_sujet text,         -- 'trop_facile' | 'adapte' | 'trop_difficile'
  niveau_eleves text,            -- 'faible' | 'heterogene' | 'bon'
  incidents text,                -- retards, materiel, salle, triche...
  retours_eleves text,           -- ce que les eleves ont dit
  besoins text,                  -- ce qui manquerait au prof la prochaine fois
  note_organisation integer,     -- 1 a 5
  recommanderait boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un prof, une session, un retour. Le formulaire fait un upsert dessus.
  constraint session_retours_unique unique (session_id, professeur_id)
);

create index if not exists session_retours_session_idx on public.session_retours (session_id);
create index if not exists session_retours_prof_idx on public.session_retours (professeur_id);

-- ---------------------------------------------------------------------
--  3. updated_at automatique
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists session_sujets_touch on public.session_sujets;
create trigger session_sujets_touch
  before update on public.session_sujets
  for each row execute function public.touch_updated_at();

drop trigger if exists session_retours_touch on public.session_retours;
create trigger session_retours_touch
  before update on public.session_retours
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  4. Fermeture : RLS actif, aucune policy. La cle anon ne lit rien.
-- ---------------------------------------------------------------------
alter table public.session_sujets  enable row level security;
alter table public.session_retours enable row level security;

commit;

-- =====================================================================
--  VERIFICATION — doit renvoyer 2 lignes, puis 0 sujet et 0 retour.
-- =====================================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('session_sujets', 'session_retours')
order by table_name;

select 'sujets' as objet, count(*) from public.session_sujets
union all select 'retours', count(*) from public.session_retours;
