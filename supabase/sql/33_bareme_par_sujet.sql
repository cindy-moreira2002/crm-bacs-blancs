-- =====================================================================
--  BAREME PROPRE AU SUJET, QUESTION PAR QUESTION
--  (mathematiques d'abord, architecture commune a la physique-chimie)
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Deja applique en base par l'API Management le 2026-08-07 : ce fichier
--  est la trace reproductible. Chaque bloc est idempotent.
--
--  CE QUE CE FICHIER CHANGE
--  ------------------------
--  Avant : la note sur 20 sortait d'une grille GENERIQUE de competences
--  (chercher, modeliser, representer, raisonner, calculer, communiquer),
--  la meme pour tous les sujets d'une matiere. correct-french-copy
--  recalculait note_finale = somme des scores de criteres.
--
--  Apres : trois couches nettement separees.
--    Couche 1 - la NOTE vient d'un bareme propre au sujet, question par
--               question, verrouille en version immuable.
--    Couche 2 - le PROFIL DE COMPETENCES est un diagnostic pedagogique.
--               Il ne touche jamais la note.
--    Couche 3 - les COPIES ETALONS servent a calibrer le bareme AVANT
--               ouverture. Jamais a rattraper la note d'un eleve apres.
--
--  RIEN N'EST SUPPRIME. Les tables rubrics / subject_cards /
--  benchmark_cards / corrections restent en place et continuent de
--  fonctionner pour les matieres non migrees. Les anciennes grilles sont
--  seulement RE-ETIQUETEES en grilles de diagnostic (rubrics.role).
--
--  100% ASCII VOLONTAIRE : l'editeur SQL de Supabase abime les accents
--  colles depuis un Mac.
-- =====================================================================


-- =====================================================================
--  BLOC 1 - EXAMENS ET VERSIONS DE BAREME
--
--  Un "examen" = un bac blanc precis (une matiere, une date, un sujet).
--  Un examen porte 1..n versions de bareme ; une seule est active.
--  La version est une chaine ('1.0', '1.1', '2.0'), unique par examen.
-- =====================================================================

begin;

create table if not exists public.exams (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  matiere               text not null,
  track                 text not null default 'generale',
  exercise_type         text,
  titre                 text not null,
  session               text,
  date_epreuve          date,
  subject_id            text references public.subject_cards (id) on delete set null,
  sujet_url             text,
  sujet_texte           text,
  corrige_url           text,
  corrige_texte         text,
  statut                text not null default 'draft',
  bareme_version_active uuid,
  commentaire           text,
  cree_par              text,
  cree_le               timestamptz not null default now(),
  maj_le                timestamptz not null default now(),
  constraint exams_statut_valide check (statut in (
    'draft', 'calibrating', 'ready_for_validation', 'validated',
    'locked', 'correction_open', 'archived'
  ))
);

comment on table public.exams is
  'Un bac blanc precis. Sa note officielle vient de son bareme propre, pas de la grille generique de la matiere.';

create index if not exists exams_matiere_idx on public.exams (matiere);
create index if not exists exams_subject_idx on public.exams (subject_id);

create table if not exists public.bareme_versions (
  id              uuid primary key default gen_random_uuid(),
  exam_id         uuid not null references public.exams (id) on delete restrict,
  version         text not null,
  matiere         text not null,
  statut          text not null default 'draft',
  total_points    numeric(6,2) not null default 0,
  max_score       numeric(6,2) not null default 20,
  commentaire     text,
  base_sur        uuid references public.bareme_versions (id) on delete set null,
  controles       jsonb,
  valide_par      text,
  valide_le       timestamptz,
  verrouille_par  text,
  verrouille_le   timestamptz,
  cree_par        text,
  cree_le         timestamptz not null default now(),
  maj_le          timestamptz not null default now(),
  constraint bareme_versions_unicite unique (exam_id, version),
  constraint bareme_versions_statut_valide check (statut in (
    'draft', 'calibrating', 'ready_for_validation', 'validated', 'locked', 'archived'
  ))
);

comment on column public.bareme_versions.total_points is
  'Somme des max_points de toutes les questions. Recalculee par trigger, jamais saisie a la main.';
comment on column public.bareme_versions.controles is
  'Dernier resultat de public.bareme_verifier() : la liste des blocages restants.';

create index if not exists bareme_versions_exam_idx on public.bareme_versions (exam_id);

-- Le lien examen -> version active se pose apres, les deux tables se citant.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exams_bareme_version_active_fk'
  ) then
    alter table public.exams
      add constraint exams_bareme_version_active_fk
      foreign key (bareme_version_active)
      references public.bareme_versions (id) on delete set null;
  end if;
end
$$;

commit;


-- =====================================================================
--  BLOC 2 - STRUCTURE DU BAREME : EXERCICES, QUESTIONS, PALIERS DE POINTS
--
--  bareme_questions porte TOUT ce qu'un correcteur doit savoir pour
--  attribuer les points d'une question : attendu, demarche, etapes
--  valorisees, methodes alternatives, tolerances, regles de
--  non-double-sanction et de poursuite apres erreur.
--
--  bareme_awards porte les fractions de points attribuables (0,25 / 0,5
--  ...). Aucun plafond de "cinq niveaux" : autant de paliers que voulu.
-- =====================================================================

begin;

create table if not exists public.bareme_exercices (
  id                 uuid primary key default gen_random_uuid(),
  bareme_version_id  uuid not null references public.bareme_versions (id) on delete cascade,
  code               text not null,
  titre              text,
  ordre              integer not null default 0,
  constraint bareme_exercices_unicite unique (bareme_version_id, code)
);

create table if not exists public.bareme_questions (
  id                        uuid primary key default gen_random_uuid(),
  bareme_version_id         uuid not null references public.bareme_versions (id) on delete cascade,
  exercice_id               uuid references public.bareme_exercices (id) on delete cascade,
  question_key              text not null,
  numero                    text not null,
  libelle                   text not null default '',
  partie                    text,
  ordre                     integer not null default 0,
  max_points                numeric(5,2) not null,
  reponse_attendue          text,
  raisonnement_attendu      text,
  etapes                    jsonb not null default '[]'::jsonb,
  reponses_equivalentes     jsonb not null default '[]'::jsonb,
  methodes_alternatives     jsonb not null default '[]'::jsonb,
  erreurs_frequentes        jsonb not null default '[]'::jsonb,
  unites_attendues          text,
  precision_attendue        text,
  conditions_hypotheses     text,
  calculatrice              text not null default 'indifferent',
  tolerances                text,
  competences               text[] not null default '{}',
  codes_erreurs             text[] not null default '{}',
  depend_de                 text[] not null default '{}',
  regle_non_double_sanction text,
  regle_poursuite           text,
  regle_resultat_sans_justification text,
  regle_raisonnement_juste_calcul_faux text,
  criteres_relecture_humaine text,
  cree_le                   timestamptz not null default now(),
  maj_le                    timestamptz not null default now(),
  constraint bareme_questions_unicite unique (bareme_version_id, question_key),
  constraint bareme_questions_max_positif check (max_points > 0),
  constraint bareme_questions_calculatrice check (calculatrice in ('autorisee', 'interdite', 'indifferent'))
);

comment on column public.bareme_questions.question_key is
  'Identifiant stable de la question (ex1_q1a). Il voyage jusqu''au resultat de correction : ne jamais le renumeroter.';
comment on column public.bareme_questions.depend_de is
  'question_key des questions dont celle-ci reprend le resultat. Sert a la regle de poursuite apres erreur anterieure.';

create index if not exists bareme_questions_version_idx on public.bareme_questions (bareme_version_id, ordre);

create table if not exists public.bareme_awards (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.bareme_questions (id) on delete cascade,
  code         text,
  libelle      text not null,
  points       numeric(5,2) not null,
  nature       text not null default 'etape',
  description  text,
  cumulable    boolean not null default true,
  ordre        integer not null default 0,
  constraint bareme_awards_points_positifs check (points >= 0),
  constraint bareme_awards_nature check (nature in ('resultat', 'methode', 'etape', 'alternative', 'bonus'))
);

comment on table public.bareme_awards is
  'Fractions de points attribuables a une question. cumulable=false pour des paliers exclusifs (0,25 OU 0,5), true pour des points qui s''additionnent.';

create index if not exists bareme_awards_question_idx on public.bareme_awards (question_id, ordre);

commit;


-- =====================================================================
--  BLOC 3 - REFERENTIELS PAR DISCIPLINE
--
--  Les competences et la taxonomie d'erreurs ne sont PAS partagees entre
--  matieres : le referentiel est porte par (matiere, code). Ajouter la
--  physique-chimie, c'est ajouter des lignes, pas du code.
-- =====================================================================

begin;

create table if not exists public.competence_referentiels (
  matiere      text not null,
  code         text not null,
  libelle      text not null,
  description  text,
  ordre        integer not null default 0,
  -- false = competence a n'evaluer que lorsqu'elle est reellement mobilisee
  -- (algorithmique en maths). Elle sort alors en 'non_applicable', jamais a 0.
  toujours_mobilisee boolean not null default true,
  primary key (matiere, code)
);

create table if not exists public.taxonomie_erreurs (
  matiere     text not null,
  code        text not null,
  domaine     text,
  description text not null,
  gravite     text not null default 'moderee',
  -- Separation exigee : une erreur de l'eleve n'est pas un incident de
  -- transcription, qui n'est pas une anomalie du sujet.
  nature      text not null default 'eleve',
  competence  text,
  cree_le     timestamptz not null default now(),
  primary key (matiere, code),
  constraint taxonomie_gravite check (gravite in ('mineure', 'moderee', 'majeure')),
  constraint taxonomie_nature  check (nature in ('eleve', 'transcription', 'reconnaissance', 'sujet'))
);

comment on column public.taxonomie_erreurs.gravite is
  'Gravite PEDAGOGIQUE. Elle ne retire aucun point : seul le bareme de la question determine l''effet sur la note.';

commit;


-- =====================================================================
--  BLOC 4 - COPIES ETALONS ET CALIBRATION
--
--  Une copie etalon est corrigee par un ou plusieurs professeurs, puis
--  par l'IA, avec LA MEME version de bareme. On compare, on ajuste le
--  bareme, on recommence. Aucun rattrapage individuel n'est possible.
-- =====================================================================

begin;

create table if not exists public.etalon_copies (
  id                 uuid primary key default gen_random_uuid(),
  exam_id            uuid not null references public.exams (id) on delete cascade,
  libelle            text not null,
  niveau_cible       text,
  frontiere          boolean not null default false,
  storage_path       text,
  source_url         text,
  correction_id      uuid references public.corrections (id) on delete set null,
  benchmark_card_id  text references public.benchmark_cards (id) on delete set null,
  statut             text not null default 'importee',
  commentaire        text,
  cree_le            timestamptz not null default now(),
  maj_le             timestamptz not null default now(),
  constraint etalon_copies_statut check (statut in (
    'importee', 'corrigee_humain', 'corrigee_ia', 'comparee', 'validee', 'rejetee'
  )),
  constraint etalon_copies_niveau check (niveau_cible is null or niveau_cible in (
    'presque_blanche', 'tres_faible', 'fragile', 'moyen', 'assez_bon', 'tres_bon', 'excellent'
  ))
);

create index if not exists etalon_copies_exam_idx on public.etalon_copies (exam_id);

create table if not exists public.etalon_corrections_humaines (
  id                uuid primary key default gen_random_uuid(),
  etalon_copie_id   uuid not null references public.etalon_copies (id) on delete cascade,
  bareme_version_id uuid not null references public.bareme_versions (id) on delete cascade,
  prof_nom          text not null,
  prof_email        text,
  note_totale       numeric(5,2) not null,
  commentaire       text,
  cree_le           timestamptz not null default now()
);

comment on table public.etalon_corrections_humaines is
  'Une ligne PAR PROFESSEUR. Deux profs qui corrigent la meme copie sont conserves separement : la reference humaine n''est pas presentee comme objective quand ils divergent.';

create index if not exists etalon_ch_copie_idx on public.etalon_corrections_humaines (etalon_copie_id);

create table if not exists public.etalon_correction_humaine_questions (
  id                     uuid primary key default gen_random_uuid(),
  correction_humaine_id  uuid not null references public.etalon_corrections_humaines (id) on delete cascade,
  question_key           text not null,
  points                 numeric(5,2) not null,
  justification          text,
  constraint etalon_chq_unicite unique (correction_humaine_id, question_key)
);

create table if not exists public.etalon_corrections_ia (
  id                uuid primary key default gen_random_uuid(),
  etalon_copie_id   uuid not null references public.etalon_copies (id) on delete cascade,
  bareme_version_id uuid not null references public.bareme_versions (id) on delete cascade,
  correction_id     uuid references public.corrections (id) on delete set null,
  note_brute        numeric(5,2),
  resultat          jsonb,
  cree_le           timestamptz not null default now()
);

create index if not exists etalon_cia_copie_idx on public.etalon_corrections_ia (etalon_copie_id);

create table if not exists public.calibration_runs (
  id                uuid primary key default gen_random_uuid(),
  exam_id           uuid not null references public.exams (id) on delete cascade,
  bareme_version_id uuid not null references public.bareme_versions (id) on delete cascade,
  lance_le          timestamptz not null default now(),
  lance_par         text,
  stats             jsonb,
  ecarts            jsonb,
  commentaire       text
);

create index if not exists calibration_runs_version_idx on public.calibration_runs (bareme_version_id);

commit;


-- =====================================================================
--  BLOC 5 - LA CORRECTION D'UNE COPIE, QUESTION PAR QUESTION
--
--  corrections gagne le lien vers l'examen ET la version exacte de
--  bareme utilisee : deux copies d'un meme lot ne peuvent pas etre
--  corrigees avec deux versions differentes sans que cela se voie.
--
--  moteur distingue nettement l'ancien systeme du nouveau :
--    'grille_generique' = note issue de la grille de competences ;
--    'bareme_sujet'     = note issue du bareme propre au sujet.
-- =====================================================================

begin;

alter table public.corrections
  add column if not exists exam_id               uuid references public.exams (id) on delete set null,
  add column if not exists bareme_version_id     uuid references public.bareme_versions (id) on delete set null,
  add column if not exists moteur                text not null default 'grille_generique',
  add column if not exists score_raw             numeric(5,2),
  add column if not exists score_validated       numeric(5,2),
  add column if not exists max_score             numeric(5,2),
  add column if not exists human_review_required boolean,
  add column if not exists validee_par           text,
  add column if not exists validee_le            timestamptz,
  add column if not exists est_etalon            boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'corrections_moteur_valide') then
    alter table public.corrections
      add constraint corrections_moteur_valide check (moteur in ('grille_generique', 'bareme_sujet'));
  end if;
end
$$;

comment on column public.corrections.moteur is
  'grille_generique = ancienne note issue de la grille de competences ; bareme_sujet = note issue du bareme propre au sujet. Ne jamais comparer les deux sans le dire.';

create index if not exists corrections_exam_idx on public.corrections (exam_id);
create index if not exists corrections_bareme_version_idx on public.corrections (bareme_version_id);

create table if not exists public.correction_questions (
  id                     uuid primary key default gen_random_uuid(),
  correction_id          uuid not null references public.corrections (id) on delete cascade,
  bareme_version_id      uuid not null references public.bareme_versions (id) on delete cascade,
  question_key           text not null,
  points                 numeric(5,2) not null default 0,
  max_points             numeric(5,2) not null,
  elements_observes      jsonb not null default '[]'::jsonb,
  elements_manquants     jsonb not null default '[]'::jsonb,
  erreurs                jsonb not null default '[]'::jsonb,
  preuves                jsonb not null default '[]'::jsonb,
  transcription_incertaine boolean not null default false,
  relecture_humaine      boolean not null default false,
  motifs_relecture       jsonb not null default '[]'::jsonb,
  competences            text[] not null default '{}',
  poursuite_depuis       text,
  methode_alternative    boolean not null default false,
  points_humain          numeric(5,2),
  commentaire_humain     text,
  cree_le                timestamptz not null default now(),
  constraint correction_questions_unicite unique (correction_id, question_key),
  constraint correction_questions_bornes check (points >= 0 and points <= max_points),
  constraint correction_questions_bornes_humain check (
    points_humain is null or (points_humain >= 0 and points_humain <= max_points)
  )
);

create index if not exists correction_questions_correction_idx on public.correction_questions (correction_id);

create table if not exists public.correction_competences (
  id             uuid primary key default gen_random_uuid(),
  correction_id  uuid not null references public.corrections (id) on delete cascade,
  matiere        text not null,
  competence     text not null,
  niveau         text not null,
  commentaire    text,
  constraint correction_competences_unicite unique (correction_id, competence),
  constraint correction_competences_niveau check (niveau in (
    'non_applicable', 'non_observe', 'insufficient', 'fragile', 'satisfactory', 'very_satisfactory'
  ))
);

comment on table public.correction_competences is
  'Couche 2 : diagnostic pedagogique. AUCUN trigger, AUCUNE fonction ne fait remonter ces lignes vers la note. non_applicable = competence absente du sujet ; non_observe = mobilisable mais non evaluable sur cette copie.';

create table if not exists public.relectures_humaines (
  id             uuid primary key default gen_random_uuid(),
  correction_id  uuid not null references public.corrections (id) on delete cascade,
  question_key   text,
  code_motif     text not null,
  motif          text not null,
  statut         text not null default 'ouverte',
  traite_par     text,
  traite_le      timestamptz,
  decision       jsonb,
  cree_le        timestamptz not null default now(),
  constraint relectures_statut check (statut in ('ouverte', 'traitee', 'rejetee'))
);

create index if not exists relectures_correction_idx on public.relectures_humaines (correction_id);
create index if not exists relectures_statut_idx on public.relectures_humaines (statut);

create table if not exists public.bareme_audit (
  id          bigserial primary key,
  table_cible text not null,
  ligne_id    text not null,
  action      text not null,
  auteur      text,
  avant       jsonb,
  apres       jsonb,
  cree_le     timestamptz not null default now()
);

create index if not exists bareme_audit_ligne_idx on public.bareme_audit (table_cible, ligne_id);

commit;


-- =====================================================================
--  BLOC 6 - LES GARDE-FOUS EN BASE
--
--  Ce que le code applicatif ne peut pas garantir seul :
--    a) le total des questions se recalcule tout seul ;
--    b) les paliers cumulables ne depassent pas le maximum d'une question ;
--    c) une version VERROUILLEE ne peut plus etre modifiee, meme par erreur ;
--    d) la note brute d'une copie est toujours la somme de ses questions.
-- =====================================================================

begin;

-- a) total_points = somme des max_points des questions
create or replace function public.bareme_recalcule_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version uuid := coalesce(new.bareme_version_id, old.bareme_version_id);
begin
  update public.bareme_versions v
  set total_points = coalesce((
        select sum(q.max_points) from public.bareme_questions q
        where q.bareme_version_id = v_version
      ), 0),
      maj_le = now()
  where v.id = v_version;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bareme_recalcule_total on public.bareme_questions;
create trigger trg_bareme_recalcule_total
  after insert or update or delete on public.bareme_questions
  for each row execute function public.bareme_recalcule_total();

-- b) somme des paliers cumulables <= maximum de la question
create or replace function public.bareme_awards_dans_le_max()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question uuid := coalesce(new.question_id, old.question_id);
  v_max      numeric;
  v_somme    numeric;
  v_palier   numeric;
begin
  select max_points into v_max from public.bareme_questions where id = v_question;
  if v_max is null then return coalesce(new, old); end if;

  select coalesce(sum(points), 0) into v_somme
  from public.bareme_awards where question_id = v_question and cumulable;

  select coalesce(max(points), 0) into v_palier
  from public.bareme_awards where question_id = v_question and not cumulable;

  if v_somme > v_max + 0.001 then
    raise exception 'Paliers cumulables de la question % : % points pour un maximum de %.',
      v_question, v_somme, v_max;
  end if;
  if v_palier > v_max + 0.001 then
    raise exception 'Un palier exclusif de la question % vaut % points pour un maximum de %.',
      v_question, v_palier, v_max;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bareme_awards_dans_le_max on public.bareme_awards;
create trigger trg_bareme_awards_dans_le_max
  after insert or update or delete on public.bareme_awards
  for each row execute function public.bareme_awards_dans_le_max();

-- c) immuabilite d'une version verrouillee
create or replace function public.bareme_version_verrouillee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version uuid;
  v_statut  text;
begin
  if tg_table_name = 'bareme_awards' then
    select q.bareme_version_id into v_version
    from public.bareme_questions q
    where q.id = coalesce(new.question_id, old.question_id);
  else
    v_version := coalesce(new.bareme_version_id, old.bareme_version_id);
  end if;

  select statut into v_statut from public.bareme_versions where id = v_version;
  if v_statut = 'locked' then
    raise exception 'Version de bareme verrouillee : cree une nouvelle version pour la modifier (table %).', tg_table_name;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_verrou_questions on public.bareme_questions;
create trigger trg_verrou_questions
  before insert or update or delete on public.bareme_questions
  for each row execute function public.bareme_version_verrouillee();

drop trigger if exists trg_verrou_exercices on public.bareme_exercices;
create trigger trg_verrou_exercices
  before insert or update or delete on public.bareme_exercices
  for each row execute function public.bareme_version_verrouillee();

drop trigger if exists trg_verrou_awards on public.bareme_awards;
create trigger trg_verrou_awards
  before insert or update or delete on public.bareme_awards
  for each row execute function public.bareme_version_verrouillee();

-- La ligne de version elle-meme : une fois verrouillee, seuls le statut
-- (vers 'archived'), la trace de validation et les controles bougent.
create or replace function public.bareme_version_ligne_verrouillee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.statut = 'locked' then
    if new.version is distinct from old.version
       or new.exam_id is distinct from old.exam_id
       or new.total_points is distinct from old.total_points
       or new.max_score is distinct from old.max_score
       or (new.statut is distinct from old.statut and new.statut <> 'archived') then
      raise exception 'Version de bareme verrouillee : cree une nouvelle version (bareme_nouvelle_version) au lieu de la modifier.';
    end if;
  end if;
  new.maj_le := now();
  return new;
end;
$$;

drop trigger if exists trg_verrou_version_ligne on public.bareme_versions;
create trigger trg_verrou_version_ligne
  before update on public.bareme_versions
  for each row execute function public.bareme_version_ligne_verrouillee();

-- d) note brute = somme mecanique des points question par question
create or replace function public.correction_recalcule_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correction uuid := coalesce(new.correction_id, old.correction_id);
  v_brut       numeric;
  v_max        numeric;
  v_valide     numeric;
  v_relecture  boolean;
begin
  select coalesce(sum(points), 0),
         coalesce(sum(max_points), 0),
         coalesce(sum(coalesce(points_humain, points)), 0),
         bool_or(relecture_humaine)
    into v_brut, v_max, v_valide, v_relecture
  from public.correction_questions
  where correction_id = v_correction;

  update public.corrections
  set score_raw = v_brut,
      max_score = v_max,
      -- La note validee suit la note brute tant qu'aucun humain n'a
      -- retouche une question ; sinon elle prend la valeur humaine.
      score_validated = v_valide,
      human_review_required = coalesce(v_relecture, false),
      updated_at = now()
  where id = v_correction;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_correction_recalcule_note on public.correction_questions;
create trigger trg_correction_recalcule_note
  after insert or update or delete on public.correction_questions
  for each row execute function public.correction_recalcule_note();

commit;


-- =====================================================================
--  BLOC 7 - CONTROLES BLOQUANTS, VERROUILLAGE, OUVERTURE DES CORRECTIONS
--
--  bareme_verifier() est LA regle. L'API l'appelle pour afficher les
--  blocages, et bareme_verrouiller() la rejoue avant de verrouiller :
--  impossible d'ouvrir les corrections sur un bareme incomplet, meme en
--  contournant l'interface.
-- =====================================================================

begin;

create or replace function public.bareme_verifier(p_version uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version    public.bareme_versions%rowtype;
  v_blocages   jsonb := '[]'::jsonb;
  v_avertis    jsonb := '[]'::jsonb;
  v_total      numeric;
  v_ligne      record;
begin
  select * into v_version from public.bareme_versions where id = p_version;
  if not found then
    return jsonb_build_object('ok', false, 'blocages',
      jsonb_build_array(jsonb_build_object('code', 'version_inconnue',
        'message', 'Version de bareme introuvable.')));
  end if;

  select coalesce(sum(max_points), 0) into v_total
  from public.bareme_questions where bareme_version_id = p_version;

  -- 1. Le total doit valoir exactement le maximum annonce (20).
  if abs(v_total - v_version.max_score) > 0.001 then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'total_incorrect',
      'message', format('Le total du bareme vaut %s points au lieu de %s.', v_total, v_version.max_score));
  end if;

  -- 2. Aucune question : rien a corriger.
  if v_total = 0 then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'aucune_question',
      'message', 'Aucune question n''est rattachee a ce bareme.');
  end if;

  -- 3. Question sans reponse attendue.
  for v_ligne in
    select question_key from public.bareme_questions
    where bareme_version_id = p_version
      and (reponse_attendue is null or btrim(reponse_attendue) = '')
    order by ordre
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'reponse_attendue_manquante',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : aucune reponse attendue.', v_ligne.question_key));
  end loop;

  -- 4. Question sans aucune regle d'attribution des points.
  for v_ligne in
    select q.question_key
    from public.bareme_questions q
    where q.bareme_version_id = p_version
      and not exists (select 1 from public.bareme_awards a where a.question_id = q.id)
      and jsonb_array_length(q.etapes) = 0
    order by q.ordre
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'attribution_manquante',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : aucune regle d''attribution des points (ni palier, ni etape valorisee).', v_ligne.question_key));
  end loop;

  -- 5. Paliers cumulables au-dessus du maximum de la question.
  for v_ligne in
    select q.question_key, q.max_points, sum(a.points) as somme
    from public.bareme_questions q
    join public.bareme_awards a on a.question_id = q.id and a.cumulable
    where q.bareme_version_id = p_version
    group by q.question_key, q.max_points
    having sum(a.points) > q.max_points + 0.001
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'paliers_hors_max',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : les paliers font %s points pour un maximum de %s.',
        v_ligne.question_key, v_ligne.somme, v_ligne.max_points));
  end loop;

  -- 6. Competence attribuee a une question alors qu'elle n'existe pas
  --    dans le referentiel de la discipline.
  for v_ligne in
    select q.question_key, c as competence
    from public.bareme_questions q, unnest(q.competences) as c
    where q.bareme_version_id = p_version
      and not exists (
        select 1 from public.competence_referentiels r
        where r.matiere = v_version.matiere and r.code = c
      )
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'competence_inconnue',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : competence "%s" absente du referentiel %s.',
        v_ligne.question_key, v_ligne.competence, v_version.matiere));
  end loop;

  -- 7. Question sans aucune competence : le diagnostic serait aveugle.
  for v_ligne in
    select question_key from public.bareme_questions
    where bareme_version_id = p_version and cardinality(competences) = 0
    order by ordre
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'competence_manquante',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : aucune competence mobilisee declaree.', v_ligne.question_key));
  end loop;

  -- 8. depend_de qui pointe vers une question inexistante : la regle de
  --    poursuite apres erreur ne pourrait pas s'appliquer.
  for v_ligne in
    select q.question_key, d as cible
    from public.bareme_questions q, unnest(q.depend_de) as d
    where q.bareme_version_id = p_version
      and not exists (
        select 1 from public.bareme_questions q2
        where q2.bareme_version_id = p_version and q2.question_key = d
      )
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'dependance_inconnue',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : depend de "%s", qui n''existe pas dans ce bareme.',
        v_ligne.question_key, v_ligne.cible));
  end loop;

  -- 9. Code d'erreur hors taxonomie de la discipline.
  for v_ligne in
    select q.question_key, e as code
    from public.bareme_questions q, unnest(q.codes_erreurs) as e
    where q.bareme_version_id = p_version
      and not exists (
        select 1 from public.taxonomie_erreurs t
        where t.matiere = v_version.matiere and t.code = e
      )
  loop
    v_avertis := v_avertis || jsonb_build_object(
      'code', 'code_erreur_inconnu',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : code d''erreur "%s" absent de la taxonomie %s.',
        v_ligne.question_key, v_ligne.code, v_version.matiere));
  end loop;

  -- 10. Aucune methode alternative nulle part : possible, mais suspect.
  if not exists (
    select 1 from public.bareme_questions
    where bareme_version_id = p_version and jsonb_array_length(methodes_alternatives) > 0
  ) then
    v_avertis := v_avertis || jsonb_build_object(
      'code', 'aucune_methode_alternative',
      'message', 'Aucune methode alternative prevue : toute demarche non prevue partira en relecture humaine.');
  end if;

  update public.bareme_versions
  set controles = jsonb_build_object(
        'ok', jsonb_array_length(v_blocages) = 0,
        'total_points', v_total,
        'blocages', v_blocages,
        'avertissements', v_avertis,
        'verifie_le', now())
  where id = p_version;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blocages) = 0,
    'version', v_version.version,
    'total_points', v_total,
    'max_score', v_version.max_score,
    'blocages', v_blocages,
    'avertissements', v_avertis
  );
end;
$$;

comment on function public.bareme_verifier(uuid) is
  'Les controles bloquants du bareme. Rejouee par bareme_verrouiller() : on ne peut pas verrouiller un bareme incomplet en contournant l''interface.';


create or replace function public.bareme_verrouiller(p_version uuid, p_auteur text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb;
  v_exam  uuid;
begin
  v_check := public.bareme_verifier(p_version);
  if (v_check ->> 'ok')::boolean is not true then
    raise exception 'Bareme incomplet, verrouillage refuse : %', v_check ->> 'blocages';
  end if;

  select exam_id into v_exam from public.bareme_versions where id = p_version;

  update public.bareme_versions
  set statut = 'locked',
      verrouille_le = now(),
      verrouille_par = p_auteur
  where id = p_version;

  update public.exams
  set bareme_version_active = p_version,
      statut = case when statut in ('draft', 'calibrating', 'ready_for_validation', 'validated')
                    then 'locked' else statut end,
      maj_le = now()
  where id = v_exam;

  insert into public.bareme_audit (table_cible, ligne_id, action, auteur, apres)
  values ('bareme_versions', p_version::text, 'verrouillage', p_auteur, v_check);

  return v_check;
end;
$$;


create or replace function public.exam_ouvrir_correction(p_exam uuid, p_auteur text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam    public.exams%rowtype;
  v_version public.bareme_versions%rowtype;
begin
  select * into v_exam from public.exams where id = p_exam;
  if not found then raise exception 'Examen introuvable.'; end if;

  if v_exam.bareme_version_active is null then
    raise exception 'Aucun bareme actif sur cet examen : impossible d''ouvrir les corrections.';
  end if;

  select * into v_version from public.bareme_versions where id = v_exam.bareme_version_active;
  if v_version.statut <> 'locked' then
    raise exception 'Le bareme % n''est pas verrouille (statut %) : impossible d''ouvrir les corrections.',
      v_version.version, v_version.statut;
  end if;

  update public.exams
  set statut = 'correction_open', maj_le = now()
  where id = p_exam;

  insert into public.bareme_audit (table_cible, ligne_id, action, auteur, apres)
  values ('exams', p_exam::text, 'ouverture_corrections', p_auteur,
          jsonb_build_object('bareme_version_id', v_version.id, 'version', v_version.version));

  return jsonb_build_object('ok', true, 'exam_id', p_exam, 'version', v_version.version);
end;
$$;


-- Nouvelle version d'un bareme : copie COMPLETE (attendus compris).
-- C'est le seul moyen de modifier un bareme verrouille.
create or replace function public.bareme_nouvelle_version(
  p_version uuid, p_nouvelle text, p_auteur text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src  public.bareme_versions%rowtype;
  v_new  uuid;
begin
  select * into v_src from public.bareme_versions where id = p_version;
  if not found then raise exception 'Version source introuvable.'; end if;

  insert into public.bareme_versions
    (exam_id, version, matiere, statut, max_score, commentaire, base_sur, cree_par)
  values
    (v_src.exam_id, p_nouvelle, v_src.matiere, 'draft', v_src.max_score,
     format('Copie de la version %s.', v_src.version), v_src.id, p_auteur)
  returning id into v_new;

  insert into public.bareme_exercices (bareme_version_id, code, titre, ordre)
  select v_new, code, titre, ordre from public.bareme_exercices where bareme_version_id = p_version;

  insert into public.bareme_questions (
    bareme_version_id, exercice_id, question_key, numero, libelle, partie, ordre, max_points,
    reponse_attendue, raisonnement_attendu, etapes, reponses_equivalentes, methodes_alternatives,
    erreurs_frequentes, unites_attendues, precision_attendue, conditions_hypotheses, calculatrice,
    tolerances, competences, codes_erreurs, depend_de, regle_non_double_sanction, regle_poursuite,
    regle_resultat_sans_justification, regle_raisonnement_juste_calcul_faux, criteres_relecture_humaine)
  select
    v_new,
    (select ne.id from public.bareme_exercices ne
      join public.bareme_exercices oe on oe.code = ne.code
      where ne.bareme_version_id = v_new and oe.id = q.exercice_id),
    q.question_key, q.numero, q.libelle, q.partie, q.ordre, q.max_points,
    q.reponse_attendue, q.raisonnement_attendu, q.etapes, q.reponses_equivalentes, q.methodes_alternatives,
    q.erreurs_frequentes, q.unites_attendues, q.precision_attendue, q.conditions_hypotheses, q.calculatrice,
    q.tolerances, q.competences, q.codes_erreurs, q.depend_de, q.regle_non_double_sanction, q.regle_poursuite,
    q.regle_resultat_sans_justification, q.regle_raisonnement_juste_calcul_faux, q.criteres_relecture_humaine
  from public.bareme_questions q where q.bareme_version_id = p_version;

  insert into public.bareme_awards (question_id, code, libelle, points, nature, description, cumulable, ordre)
  select nq.id, a.code, a.libelle, a.points, a.nature, a.description, a.cumulable, a.ordre
  from public.bareme_awards a
  join public.bareme_questions oq on oq.id = a.question_id
  join public.bareme_questions nq on nq.bareme_version_id = v_new and nq.question_key = oq.question_key
  where oq.bareme_version_id = p_version;

  insert into public.bareme_audit (table_cible, ligne_id, action, auteur, apres)
  values ('bareme_versions', v_new::text, 'nouvelle_version', p_auteur,
          jsonb_build_object('base_sur', p_version, 'version', p_nouvelle));

  return v_new;
end;
$$;


-- Duplication vers un AUTRE examen : on garde la charpente (exercices,
-- questions, points, competences, regles) et on efface tout ce qui est
-- propre a l'ancien sujet (attendus, etapes, methodes, erreurs types).
create or replace function public.bareme_dupliquer_vers_examen(
  p_version uuid, p_exam uuid, p_nouvelle text default '1.0', p_auteur text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.bareme_versions%rowtype;
  v_new uuid;
  v_mat text;
begin
  select * into v_src from public.bareme_versions where id = p_version;
  if not found then raise exception 'Version source introuvable.'; end if;
  select matiere into v_mat from public.exams where id = p_exam;
  if v_mat is null then raise exception 'Examen cible introuvable.'; end if;

  insert into public.bareme_versions
    (exam_id, version, matiere, statut, max_score, commentaire, base_sur, cree_par)
  values
    (p_exam, p_nouvelle, v_mat, 'draft', v_src.max_score,
     'Charpente dupliquee : les attendus propres a l''ancien sujet ont ete effaces.', v_src.id, p_auteur)
  returning id into v_new;

  insert into public.bareme_exercices (bareme_version_id, code, titre, ordre)
  select v_new, code, titre, ordre from public.bareme_exercices where bareme_version_id = p_version;

  insert into public.bareme_questions (
    bareme_version_id, exercice_id, question_key, numero, libelle, partie, ordre, max_points,
    calculatrice, competences, codes_erreurs, depend_de, regle_non_double_sanction, regle_poursuite,
    regle_resultat_sans_justification, regle_raisonnement_juste_calcul_faux, criteres_relecture_humaine)
  select
    v_new,
    (select ne.id from public.bareme_exercices ne
      join public.bareme_exercices oe on oe.code = ne.code
      where ne.bareme_version_id = v_new and oe.id = q.exercice_id),
    q.question_key, q.numero, '', q.partie, q.ordre, q.max_points,
    q.calculatrice, q.competences, q.codes_erreurs, q.depend_de, q.regle_non_double_sanction, q.regle_poursuite,
    q.regle_resultat_sans_justification, q.regle_raisonnement_juste_calcul_faux, q.criteres_relecture_humaine
  from public.bareme_questions q where q.bareme_version_id = p_version;

  return v_new;
end;
$$;

commit;


-- =====================================================================
--  BLOC 8 - AIGUILLAGE DU MOTEUR ET DIAGNOSTIC
--
--  Une copie rattachee a un examen dont le bareme est verrouille part
--  vers correct-copy-bareme. Toutes les autres continuent d'emprunter
--  l'ancien chemin : aucune matiere n'est cassee par ce fichier.
-- =====================================================================

begin;

create or replace function public.pipeline_diagnostic(p_correction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_correction public.corrections%rowtype;
  v_exam       public.exams%rowtype;
  v_version    public.bareme_versions%rowtype;
  v_fichier    boolean;
begin
  select * into v_correction from public.corrections where id = p_correction_id;

  if not found then
    return jsonb_build_object('ready', false,
      'blocking_error', 'Aucune ligne corrections avec cet UUID.');
  end if;

  v_fichier := exists (
    select 1 from storage.objects
    where bucket_id = 'student-copies' and name = v_correction.original_storage_path
  );

  -- --- Nouveau moteur : bareme propre au sujet ------------------------
  if v_correction.moteur = 'bareme_sujet' then
    select * into v_exam from public.exams where id = v_correction.exam_id;
    if not found then
      return jsonb_build_object('ready', false, 'moteur', 'bareme_sujet',
        'blocking_error', 'La correction se reclame du bareme par sujet mais n''est reliee a aucun examen.');
    end if;

    select * into v_version from public.bareme_versions
    where id = coalesce(v_correction.bareme_version_id, v_exam.bareme_version_active);

    return jsonb_build_object(
      'ready',
        v_fichier
        and v_version.id is not null
        and v_version.statut = 'locked'
        and (v_exam.statut = 'correction_open' or coalesce(v_correction.est_etalon, false))
        and v_version.total_points = v_version.max_score,
      'moteur', 'bareme_sujet',
      'correction_id', v_correction.id,
      'status', v_correction.status,
      'file_exists', v_fichier,
      'exam_id', v_exam.id,
      'exam_statut', v_exam.statut,
      'bareme_version_id', v_version.id,
      'bareme_version', v_version.version,
      'bareme_statut', v_version.statut,
      'bareme_total', v_version.total_points,
      'bareme_max', v_version.max_score,
      'est_etalon', coalesce(v_correction.est_etalon, false),
      'transcription_exists', exists (
        select 1 from public.copy_transcriptions where correction_id = p_correction_id),
      'result_exists', v_correction.result_json is not null
    );
  end if;

  -- --- Ancien moteur : grille generique (inchange) --------------------
  return jsonb_build_object(
    'ready',
      v_fichier
      and exists (select 1 from public.rubrics where id = v_correction.rubric_id)
      and exists (select 1 from public.subject_cards where id = v_correction.subject_id)
      and (
        select count(*) from public.benchmark_cards
        where track = v_correction.track
          and exercise_type = v_correction.exercise_type
          and subject_id = v_correction.subject_id
          and validation_status in ('candidate', 'validated')
      ) >= 3,
    'moteur', 'grille_generique',
    'correction_id', v_correction.id,
    'status', v_correction.status,
    'processing_error', v_correction.processing_error,
    'storage_path', v_correction.original_storage_path,
    'file_exists', v_fichier,
    'rubric_id', v_correction.rubric_id,
    'rubric_exists', exists (select 1 from public.rubrics where id = v_correction.rubric_id),
    'subject_id', v_correction.subject_id,
    'subject_exists', exists (select 1 from public.subject_cards where id = v_correction.subject_id),
    'linked_benchmarks', (
      select count(*) from public.benchmark_cards
      where track = v_correction.track
        and exercise_type = v_correction.exercise_type
        and subject_id = v_correction.subject_id
        and validation_status in ('candidate', 'validated')),
    'transcription_exists', exists (
      select 1 from public.copy_transcriptions where correction_id = p_correction_id),
    'result_exists', v_correction.result_json is not null
  );
end;
$$;


create or replace function private.auto_launch_french_correction()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_requires_review boolean;
  v_moteur          text;
  v_fonction        text;
begin
  v_requires_review :=
    coalesce((new.transcription_json ->> 'requires_human_review')::boolean, false);

  select moteur into v_moteur from public.corrections where id = new.correction_id;

  if v_requires_review then
    update public.corrections
    set status = 'transcription_review', updated_at = now()
    where id = new.correction_id;
    return new;
  end if;

  update public.corrections
  set status = 'queued_correction', processing_error = null, updated_at = now()
  where id = new.correction_id;

  v_fonction := case when v_moteur = 'bareme_sujet'
                     then 'correct-copy-bareme'
                     else 'correct-french-copy' end;

  perform private.invoke_pipeline_edge(v_fonction, new.correction_id);

  return new;
end;
$$;

commit;


-- =====================================================================
--  BLOC 9 - MIGRATION DE L'ANCIEN SYSTEME (aucune donnee supprimee)
--
--  Les grilles generiques restent, mais elles sont re-etiquetees : elles
--  ne produisent plus la note d'un examen migre, elles produisent le
--  diagnostic de competences. Les anciennes corrections gardent leur
--  note et sont marquees 'grille_generique'.
-- =====================================================================

begin;

alter table public.rubrics
  add column if not exists role text not null default 'diagnostic_competences',
  add column if not exists remplacee_par_bareme boolean not null default false,
  add column if not exists note_officielle boolean not null default true;

comment on column public.rubrics.role is
  'diagnostic_competences : la grille sert au profil pedagogique. note_officielle dit si elle produit encore la note (matieres non migrees).';

-- Les corrections deja en base gardent leur origine, explicitement.
update public.corrections
set moteur = 'grille_generique'
where moteur is null;

-- Note brute retrospective pour les anciennes corrections : on recopie
-- la note du moteur telle quelle, sans la retoucher, pour que les ecrans
-- puissent afficher les deux mondes sans confondre leurs origines.
update public.corrections
set score_raw = (result_json ->> 'note_finale')::numeric,
    score_validated = (result_json ->> 'note_finale')::numeric
where result_json is not null
  and score_raw is null
  and (result_json ->> 'note_finale') ~ '^[0-9]+(\.[0-9]+)?$';

commit;


-- =====================================================================
--  BLOC 10 - VERROUILLAGE DES NOUVELLES TABLES
--
--  RLS activee SANS AUCUNE POLICY = anon et authenticated ne peuvent ni
--  lire ni ecrire. Seuls le serveur de l'application, les Edge Functions
--  (service_role) et le SQL Editor y accedent. Meme regle que le BLOC 3
--  de MIGRATION_pipeline.sql.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'exams', 'bareme_versions', 'bareme_exercices', 'bareme_questions', 'bareme_awards',
    'competence_referentiels', 'taxonomie_erreurs',
    'etalon_copies', 'etalon_corrections_humaines', 'etalon_correction_humaine_questions',
    'etalon_corrections_ia', 'calibration_runs',
    'correction_questions', 'correction_competences', 'relectures_humaines', 'bareme_audit'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

revoke all on function public.bareme_verifier(uuid) from public, anon, authenticated;
revoke all on function public.bareme_verrouiller(uuid, text) from public, anon, authenticated;
revoke all on function public.exam_ouvrir_correction(uuid, text) from public, anon, authenticated;
revoke all on function public.bareme_nouvelle_version(uuid, text, text) from public, anon, authenticated;
revoke all on function public.bareme_dupliquer_vers_examen(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.bareme_verifier(uuid) to service_role;
grant execute on function public.bareme_verrouiller(uuid, text) to service_role;
grant execute on function public.exam_ouvrir_correction(uuid, text) to service_role;
grant execute on function public.bareme_nouvelle_version(uuid, text, text) to service_role;
grant execute on function public.bareme_dupliquer_vers_examen(uuid, uuid, text, text) to service_role;


-- =====================================================================
--  BLOC 11 - VERIFICATION
--  Attendu : 16 lignes "true" (tables presentes + RLS active).
-- =====================================================================

select t.nom as table_attendue,
       (to_regclass('public.' || t.nom) is not null) as existe,
       coalesce((select c.relrowsecurity from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = t.nom), false) as rls_active
from (values
  ('exams'), ('bareme_versions'), ('bareme_exercices'), ('bareme_questions'), ('bareme_awards'),
  ('competence_referentiels'), ('taxonomie_erreurs'),
  ('etalon_copies'), ('etalon_corrections_humaines'), ('etalon_correction_humaine_questions'),
  ('etalon_corrections_ia'), ('calibration_runs'),
  ('correction_questions'), ('correction_competences'), ('relectures_humaines'), ('bareme_audit')
) as t(nom)
order by t.nom;
