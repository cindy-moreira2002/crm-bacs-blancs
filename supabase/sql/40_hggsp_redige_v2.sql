-- =====================================================================
--  HGGSP SESSION 2026 : CORRECTION ANALYTIQUE DES EPREUVES REDIGEES
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Ce fichier ne pose que la STRUCTURE. Les grilles, les descripteurs, la
--  taxonomie et les etalons sont ecrits par
--    node scripts/apply-hggsp.mjs --apply
--  qui lit le noyau supabase/functions/_shared/hggsp-noyau.ts : une seule
--  ecriture des regles, donc aucun risque que le SQL decrive un bareme
--  different de celui que le moteur applique.
--
--  CE QUE CE FICHIER CHANGE
--  ------------------------
--  Avant : HGGSP etait corrige par la grille generique
--  (rubrics + correct-french-copy), une note unique sur 20 par exercice,
--  une taxonomie d'erreurs commune aux deux exercices, et le "prelevement"
--  d'une etude critique noye dans le critere "critique du document".
--
--  Apres : deux grilles REELLEMENT distinctes, versionnees et verrouillables,
--  une echelle analytique interne sur 20 par exercice, la note OFFICIELLE
--  sur 10 (note de service MENE2521923N), la note finale d'un bac blanc
--  complet = somme des deux notes officielles, une taxonomie separee par
--  exercice avec des regles d'impact explicites, et des garde-fous contre
--  la double sanction.
--
--  RIEN N'EST SUPPRIME.
--    - Les tables rubrics / subject_cards / benchmark_cards / corrections
--      restent en place et continuent de servir les 8 autres matieres.
--    - Les anciennes grilles HGGSP_*_V1 sont conservees et passees en
--      'archived' par le script d'installation : elles restent lisibles,
--      elles ne corrigent plus.
--    - Les corrections deja enregistrees gardent leur result_json, leur
--      note et leur moteur 'grille_generique'. Aucune n'est recalculee.
--
--  100% ASCII VOLONTAIRE : l'editeur SQL de Supabase abime les accents
--  colles depuis un Mac. Les textes accentues sont poses par le script.
--  Idempotent : chaque bloc peut etre rejoue.
-- =====================================================================


-- =====================================================================
--  BLOC 1 - FORMAT DE L'EPREUVE
--
--  Un bac blanc complet n'est pas un entrainement a un seul exercice :
--  la note finale ne se calcule pas de la meme facon.
-- =====================================================================

begin;

alter table public.exams
  add column if not exists exam_format text not null default 'full_exam';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exams_format_valide') then
    alter table public.exams
      add constraint exams_format_valide check (exam_format in (
        'full_exam', 'dissertation_only', 'document_study_only'
      ));
  end if;
end
$$;

comment on column public.exams.exam_format is
  'full_exam = dissertation /10 + etude critique /10 = /20. dissertation_only et document_study_only = entrainement : note pedagogique sur 20, equivalent officiel sur 10 affiche a cote.';

commit;


-- =====================================================================
--  BLOC 2 - GRILLES REDIGEES, CRITERES, DESCRIPTEURS
--
--  Une grille = un exercice + une version. Les descripteurs sont des
--  LIGNES, pas un blob JSON : un professeur peut en corriger un seul sans
--  toucher au reste, et la base sait refuser la modification d'une
--  version verrouillee.
-- =====================================================================

begin;

create table if not exists public.grilles_redigees (
  id              text primary key,
  matiere         text not null,
  exercise_type   text not null,
  version         text not null,
  libelle         text not null,
  principe        text not null default '',
  system_prompt   text not null default '',
  max_analytique  numeric(5,2) not null default 20,
  max_officiel    numeric(5,2) not null default 10,
  statut          text not null default 'draft',
  base_sur        text references public.grilles_redigees (id) on delete set null,
  garde_fous      jsonb not null default '[]'::jsonb,
  commentaire     text,
  valide_par      text,
  valide_le       timestamptz,
  verrouille_par  text,
  verrouille_le   timestamptz,
  cree_par        text,
  cree_le         timestamptz not null default now(),
  maj_le          timestamptz not null default now(),
  constraint grilles_redigees_unicite unique (matiere, exercise_type, version),
  constraint grilles_redigees_statut check (statut in (
    'draft', 'calibrating', 'ready_for_validation', 'validated',
    'locked', 'in_use', 'archived'
  )),
  constraint grilles_redigees_echelles check (max_analytique > 0 and max_officiel > 0)
);

comment on table public.grilles_redigees is
  'Grille analytique d''une epreuve redigee. max_analytique = echelle interne de travail (20) ; max_officiel = echelle du BO (10 par exercice). La note officielle est toujours analytique * max_officiel / max_analytique.';

create index if not exists grilles_redigees_matiere_idx
  on public.grilles_redigees (matiere, exercise_type, statut);

create table if not exists public.grille_criteres (
  id          text primary key,
  grille_id   text not null references public.grilles_redigees (id) on delete cascade,
  code        text not null,
  libelle     text not null,
  evaluer     jsonb not null default '[]'::jsonb,
  max_points  numeric(5,2) not null,
  ordre       integer not null default 0,
  constraint grille_criteres_unicite unique (grille_id, code),
  constraint grille_criteres_max_positif check (max_points > 0)
);

comment on column public.grille_criteres.evaluer is
  'Ce que le correcteur doit regarder, point par point. Sert au prompt ET a la page de relecture prof : les deux disent exactement la meme chose.';

create index if not exists grille_criteres_grille_idx on public.grille_criteres (grille_id, ordre);

create table if not exists public.grille_descripteurs (
  id           text primary key,
  critere_id   text not null references public.grille_criteres (id) on delete cascade,
  points       numeric(5,2) not null,
  niveau       text not null,
  description  text not null,
  constraint grille_descripteurs_unicite unique (critere_id, points),
  constraint grille_descripteurs_niveau check (niveau in (
    'nul', 'insuffisant', 'fragile', 'moyen', 'satisfaisant', 'tres_satisfaisant'
  )),
  constraint grille_descripteurs_points check (points >= 0)
);

comment on table public.grille_descripteurs is
  'Paliers de notation. Le score reel se place AU QUART DE POINT a l''interieur du palier : les descripteurs ancrent, ils n''enferment pas.';

commit;


-- =====================================================================
--  BLOC 3 - TAXONOMIE DES ERREURS ET REGLES D'IMPACT
--
--  Une erreur type ne porte plus seulement une gravite : elle porte ce
--  qu'elle FAIT a la note (type_impact) et la regle qui interdit de la
--  compter deux fois.
-- =====================================================================

begin;

create table if not exists public.taxonomie_redigee (
  id                        text primary key,
  matiere                   text not null default 'hggsp',
  code                      text not null,
  version                   text not null default '2.0',
  libelle                   text not null,
  portee                    text not null,
  description               text not null,
  critere_principal         jsonb not null default '{}'::jsonb,
  criteres_secondaires      jsonb not null default '{}'::jsonb,
  gravite                   text not null default 'moderee',
  type_impact               text not null,
  impact_min                numeric(5,2),
  impact_max                numeric(5,2),
  plafond_score             numeric(5,2),
  plafond_niveau            text,
  conditions                text not null default '',
  regle_non_double_sanction text not null default '',
  message_pedagogique       text not null default '',
  relecture_humaine         boolean not null default false,
  cree_le                   timestamptz not null default now(),
  constraint taxonomie_redigee_unicite unique (matiere, code, version),
  constraint taxonomie_redigee_portee check (portee in (
    'transversale', 'dissertation', 'etude_critique'
  )),
  constraint taxonomie_redigee_gravite check (gravite in ('mineure', 'moderee', 'majeure')),
  constraint taxonomie_redigee_impact check (type_impact in (
    'informational_only', 'evidence_not_rewarded', 'contextual_range',
    'criterion_level_cap', 'criterion_score_cap', 'human_review_required'
  )),
  -- Un plafond sans valeur ne plafonne rien : la base refuse la ligne.
  constraint taxonomie_redigee_plafond_score check (
    type_impact <> 'criterion_score_cap' or plafond_score is not null
  ),
  constraint taxonomie_redigee_plafond_niveau check (
    type_impact <> 'criterion_level_cap' or plafond_niveau is not null
  ),
  constraint taxonomie_redigee_fourchette check (
    type_impact <> 'contextual_range' or impact_max is not null
  )
);

comment on column public.taxonomie_redigee.critere_principal is
  'Critere ou la faiblesse est comptee, PAR exercice : {"hggsp_dissertation":"CONNAISSANCES","hggsp_etude_critique":"EXPLICATION_CONNAISSANCES"}. Le meme code ne vise pas le meme critere dans les deux exercices.';
comment on column public.taxonomie_redigee.type_impact is
  'Seuls criterion_score_cap et criterion_level_cap agissent mecaniquement sur la note. Les autres expliquent pourquoi des points n''ont pas ete donnes : on ne part jamais de 20 pour retrancher.';

create index if not exists taxonomie_redigee_portee_idx
  on public.taxonomie_redigee (matiere, portee, version);

commit;


-- =====================================================================
--  BLOC 4 - EXERCICES D'UN EXAMEN
--
--  Un bac blanc complet porte DEUX exercices, chacun avec sa grille et
--  son sujet. C'est ce qui permet de calculer une note finale sur 20 sans
--  jamais additionner deux notes sur 20.
-- =====================================================================

begin;

create table if not exists public.exam_exercices (
  id             uuid primary key default gen_random_uuid(),
  exam_id        uuid not null references public.exams (id) on delete cascade,
  exercise_type  text not null,
  grille_id      text references public.grilles_redigees (id) on delete set null,
  subject_id     text references public.subject_cards (id) on delete set null,
  ordre          integer not null default 0,
  max_officiel   numeric(5,2) not null default 10,
  cree_le        timestamptz not null default now(),
  constraint exam_exercices_unicite unique (exam_id, exercise_type)
);

create index if not exists exam_exercices_exam_idx on public.exam_exercices (exam_id, ordre);

commit;


-- =====================================================================
--  BLOC 5 - LA CORRECTION D'UNE COPIE REDIGEE
--
--  corrections gagne l'echelle analytique ET l'echelle officielle. Les
--  deux sont stockees : afficher l'une pour l'autre est la premiere facon
--  de se tromper de note.
-- =====================================================================

begin;

alter table public.corrections
  add column if not exists exam_format      text,
  add column if not exists grille_id        text references public.grilles_redigees (id) on delete set null,
  add column if not exists score_analytique numeric(5,2),
  add column if not exists max_analytique   numeric(5,2),
  add column if not exists score_officiel   numeric(5,2),
  add column if not exists max_officiel     numeric(5,2),
  add column if not exists groupe_copie_id  uuid;

comment on column public.corrections.groupe_copie_id is
  'Relie les deux exercices d''un meme candidat sur un bac blanc complet. La note finale sur 20 est la somme des score_officiel du groupe.';

create index if not exists corrections_groupe_idx on public.corrections (groupe_copie_id);
create index if not exists corrections_grille_idx on public.corrections (grille_id);

-- Le moteur 'criteres_rediges' rejoint les deux precedents.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'corrections_moteur_valide') then
    alter table public.corrections drop constraint corrections_moteur_valide;
  end if;
  alter table public.corrections
    add constraint corrections_moteur_valide check (moteur in (
      'grille_generique', 'bareme_sujet', 'criteres_rediges'
    ));
end
$$;

-- La coherence "moteur <-> colonnes obligatoires" (posee par le SQL 35)
-- apprend le troisieme moteur : une copie redigee doit porter son sujet, sa
-- grille de depot et la grille analytique qui produit sa note.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'corrections_coherence_moteur') then
    alter table public.corrections drop constraint corrections_coherence_moteur;
  end if;
  alter table public.corrections
    add constraint corrections_coherence_moteur check (
      (moteur = 'grille_generique' and subject_id is not null and rubric_id is not null)
      or (moteur = 'bareme_sujet' and exam_id is not null)
      or (moteur = 'criteres_rediges' and subject_id is not null and rubric_id is not null
          and grille_id is not null)
    );
end
$$;

-- Les grilles savent desormais quel moteur elles appellent, et vers quelle
-- grille analytique elles pointent. Le depot n'a rien a savoir de tout ca.
alter table public.rubrics
  add column if not exists moteur    text not null default 'grille_generique',
  add column if not exists grille_id text references public.grilles_redigees (id) on delete set null;

create table if not exists public.correction_criteres (
  id                  uuid primary key default gen_random_uuid(),
  correction_id       uuid not null references public.corrections (id) on delete cascade,
  grille_id           text not null references public.grilles_redigees (id),
  critere_code        text not null,
  score               numeric(5,2) not null default 0,
  max_points          numeric(5,2) not null,
  niveau              text not null default 'nul',
  score_avant_plafond numeric(5,2),
  plafonne_par        text[] not null default '{}',
  forces              jsonb not null default '[]'::jsonb,
  faiblesses          jsonb not null default '[]'::jsonb,
  preuves             jsonb not null default '[]'::jsonb,
  feedback            text not null default '',
  relecture_humaine   boolean not null default false,
  points_humain       numeric(5,2),
  commentaire_humain  text,
  cree_le             timestamptz not null default now(),
  constraint correction_criteres_unicite unique (correction_id, critere_code),
  constraint correction_criteres_bornes check (score >= 0 and score <= max_points),
  constraint correction_criteres_bornes_humain check (
    points_humain is null or (points_humain >= 0 and points_humain <= max_points)
  ),
  -- Le pas de notation d'HGGSP : 0,25 point. Un score a 0,1 est un bug.
  constraint correction_criteres_pas check (
    (score * 4) = round(score * 4)
  )
);

create index if not exists correction_criteres_correction_idx
  on public.correction_criteres (correction_id);

create table if not exists public.correction_erreurs (
  id                  uuid primary key default gen_random_uuid(),
  correction_id       uuid not null references public.corrections (id) on delete cascade,
  taxonomy_code       text not null,
  libelle             text not null default '',
  critere_code        text,
  type_impact         text not null,
  impact_description  text not null default '',
  score_effect        numeric(5,2),
  criterion_cap       numeric(5,2),
  criterion_level_cap text,
  fourchette          jsonb,
  preuves             jsonb not null default '[]'::jsonb,
  certitude           numeric(4,3),
  source_error_id     text,
  is_consequence      boolean not null default false,
  scored_in_criterion text,
  already_counted     boolean not null default true,
  scoring_effect      text not null default '',
  relecture_humaine   boolean not null default false,
  cree_le             timestamptz not null default now(),
  constraint correction_erreurs_impact check (type_impact in (
    'informational_only', 'evidence_not_rewarded', 'contextual_range',
    'criterion_level_cap', 'criterion_score_cap', 'human_review_required'
  ))
);

comment on column public.correction_erreurs.score_effect is
  'Toujours NULL par construction : aucune erreur ne retranche de points directement. La colonne existe pour tracer une eventuelle proposition du modele, refusee par le moteur.';

create index if not exists correction_erreurs_correction_idx
  on public.correction_erreurs (correction_id);

create table if not exists public.correction_controles (
  correction_id      uuid primary key references public.corrections (id) on delete cascade,
  score_sum_valid    boolean not null default false,
  conversion_valid   boolean not null default false,
  step_valid         boolean not null default false,
  no_double_penalty  boolean not null default false,
  evidence_verified  boolean not null default false,
  feedback_consistent boolean not null default false,
  taxonomy_valid     boolean not null default false,
  details            jsonb not null default '[]'::jsonb,
  cree_le            timestamptz not null default now()
);

comment on table public.correction_controles is
  'Les controles du paragraphe 15 : somme = note, conversion correcte, pas de double sanction, citations reellement presentes, appreciation coherente. Un controle faux = relecture humaine.';

commit;


-- =====================================================================
--  BLOC 6 - COPIES ETALONS DES EPREUVES REDIGEES
--
--  Les tables d'etalons existent depuis le bareme par sujet (SQL 33) :
--  on les OUVRE aux grilles redigees plutot que d'en creer un jeu
--  parallele. Aucune colonne n'est supprimee, deux contraintes NOT NULL
--  sont seulement relachees.
-- =====================================================================

begin;

alter table public.etalon_copies
  add column if not exists grille_id     text references public.grilles_redigees (id) on delete set null,
  add column if not exists exercise_type text,
  add column if not exists matiere       text;

alter table public.etalon_copies alter column exam_id drop not null;

alter table public.etalon_corrections_humaines
  add column if not exists grille_id text references public.grilles_redigees (id) on delete set null,
  add column if not exists score_analytique numeric(5,2),
  add column if not exists score_officiel   numeric(5,2);

alter table public.etalon_corrections_humaines alter column bareme_version_id drop not null;

create table if not exists public.etalon_correction_humaine_criteres (
  id                    uuid primary key default gen_random_uuid(),
  correction_humaine_id uuid not null references public.etalon_corrections_humaines (id) on delete cascade,
  critere_code          text not null,
  points                numeric(5,2) not null,
  justification         text,
  constraint etalon_chc_unicite unique (correction_humaine_id, critere_code)
);

comment on table public.etalon_correction_humaine_criteres is
  'Detail critere par critere de la correction humaine d''une copie etalon. Une ligne PAR PROFESSEUR et par critere : deux profs qui divergent restent visibles separement.';

alter table public.etalon_corrections_ia
  add column if not exists grille_id text references public.grilles_redigees (id) on delete set null;

alter table public.etalon_corrections_ia alter column bareme_version_id drop not null;

alter table public.calibration_runs
  add column if not exists grille_id text references public.grilles_redigees (id) on delete set null;

alter table public.calibration_runs alter column bareme_version_id drop not null;
alter table public.calibration_runs alter column exam_id drop not null;

commit;


-- =====================================================================
--  BLOC 7 - LES GARDE-FOUS EN BASE
--
--  Ce que le code applicatif ne peut pas garantir seul :
--    a) une grille verrouillee ne se modifie plus, meme par erreur ;
--    b) ni ses criteres, ni ses descripteurs ;
--    c) la note d'une copie redigee est toujours la somme de ses criteres,
--       et la note officielle toujours sa conversion exacte ;
--    d) le moteur d'une copie vient de sa grille, pas de l'appelant ;
--    e) tout changement de statut de grille est trace.
-- =====================================================================

begin;

-- a) verrouillage d'une grille
create or replace function public.grille_verrouillee()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut in ('locked', 'in_use', 'archived') then
      raise exception 'Grille % : statut %, suppression interdite. Cree une nouvelle version.', old.id, old.statut;
    end if;
    return old;
  end if;

  if old.statut in ('locked', 'in_use', 'archived') then
    if new.libelle is distinct from old.libelle
       or new.principe is distinct from old.principe
       or new.system_prompt is distinct from old.system_prompt
       or new.max_analytique is distinct from old.max_analytique
       or new.max_officiel is distinct from old.max_officiel
       or new.garde_fous is distinct from old.garde_fous
       or new.version is distinct from old.version
       or new.exercise_type is distinct from old.exercise_type then
      raise exception 'Grille % : version verrouillee (%). Cree une nouvelle version au lieu de la modifier.', old.id, old.statut;
    end if;
  end if;

  new.maj_le := now();
  return new;
end;
$$;

drop trigger if exists grilles_redigees_verrou on public.grilles_redigees;
create trigger grilles_redigees_verrou
  before update or delete on public.grilles_redigees
  for each row execute function public.grille_verrouillee();

-- b) verrouillage des criteres et descripteurs d'une grille verrouillee
create or replace function public.grille_ligne_verrouillee()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_grille text;
  v_statut text;
begin
  if tg_table_name = 'grille_criteres' then
    v_grille := coalesce(new.grille_id, old.grille_id);
  else
    select c.grille_id into v_grille
    from public.grille_criteres c
    where c.id = coalesce(new.critere_id, old.critere_id);
  end if;

  select statut into v_statut from public.grilles_redigees where id = v_grille;

  if v_statut in ('locked', 'in_use', 'archived') then
    raise exception 'Grille % : version verrouillee (%). Ses criteres et descripteurs ne sont plus modifiables.', v_grille, v_statut;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists grille_criteres_verrou on public.grille_criteres;
create trigger grille_criteres_verrou
  before insert or update or delete on public.grille_criteres
  for each row execute function public.grille_ligne_verrouillee();

drop trigger if exists grille_descripteurs_verrou on public.grille_descripteurs;
create trigger grille_descripteurs_verrou
  before insert or update or delete on public.grille_descripteurs
  for each row execute function public.grille_ligne_verrouillee();

-- c) la note d'une copie redigee = somme des criteres, convertie ensuite
create or replace function public.correction_redigee_recalcule()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_correction uuid;
  v_somme      numeric(6,2);
  v_max        numeric(6,2);
  v_grille     text;
  v_analytique numeric(6,2);
  v_officiel   numeric(6,2);
begin
  v_correction := coalesce(new.correction_id, old.correction_id);

  select coalesce(sum(score), 0), coalesce(sum(max_points), 0), min(grille_id)
    into v_somme, v_max, v_grille
  from public.correction_criteres
  where correction_id = v_correction;

  select max_analytique, max_officiel into v_analytique, v_officiel
  from public.grilles_redigees where id = v_grille;

  update public.corrections
  set score_raw        = v_somme,
      -- Une note deja validee par un humain n'est jamais ecrasee par le calcul.
      score_validated  = case when validee_le is null then v_somme else score_validated end,
      score_analytique = v_somme,
      max_analytique   = coalesce(v_analytique, v_max),
      score_officiel   = round(v_somme * coalesce(v_officiel, 10) / nullif(coalesce(v_analytique, v_max), 0), 2),
      max_officiel     = coalesce(v_officiel, 10),
      max_score        = coalesce(v_analytique, v_max),
      updated_at       = now()
  where id = v_correction;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists correction_criteres_recalcule on public.correction_criteres;
create trigger correction_criteres_recalcule
  after insert or update or delete on public.correction_criteres
  for each row execute function public.correction_redigee_recalcule();

-- d) le moteur d'une copie vient de sa grille
create or replace function public.correction_moteur_depuis_grille()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_moteur text;
  v_grille text;
begin
  if new.rubric_id is not null then
    select moteur, grille_id into v_moteur, v_grille
    from public.rubrics where id = new.rubric_id;

    if v_moteur is not null and (new.moteur is null or new.moteur = 'grille_generique') then
      new.moteur := v_moteur;
    end if;
    if new.grille_id is null then
      new.grille_id := v_grille;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists corrections_moteur_grille on public.corrections;
create trigger corrections_moteur_grille
  before insert on public.corrections
  for each row execute function public.correction_moteur_depuis_grille();

-- e) trace de tout changement de statut d'une grille
create or replace function public.grille_audit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' and new.statut is not distinct from old.statut then
    return new;
  end if;
  insert into public.bareme_audit (table_cible, ligne_id, action, auteur, avant, apres)
  values (
    'grilles_redigees',
    coalesce(new.id, old.id),
    tg_op,
    coalesce(new.verrouille_par, new.valide_par, new.cree_par),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists grilles_redigees_audit on public.grilles_redigees;
create trigger grilles_redigees_audit
  after insert or update or delete on public.grilles_redigees
  for each row execute function public.grille_audit();

commit;


-- =====================================================================
--  BLOC 8 - VERROUILLAGE ET OUVERTURE D'UN LOT DE CORRECTIONS
--
--  Verrouiller une grille = figer la version pour tout un lot. Une
--  modification ulterieure cree une NOUVELLE version ; les corrections
--  deja faites gardent la leur, et restent lisibles telles quelles.
-- =====================================================================

begin;

create or replace function public.grille_verifier(p_grille text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_grille  public.grilles_redigees;
  v_total   numeric(6,2);
  v_blocages jsonb := '[]'::jsonb;
  v_ligne   record;
begin
  select * into v_grille from public.grilles_redigees where id = p_grille;
  if not found then
    return jsonb_build_object('ok', false, 'blocages',
      jsonb_build_array(jsonb_build_object('code', 'grille_inconnue', 'message', 'Grille introuvable.')));
  end if;

  select coalesce(sum(max_points), 0) into v_total
  from public.grille_criteres where grille_id = p_grille;

  if v_total <> v_grille.max_analytique then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'total_incorrect',
      'message', format('Les criteres totalisent %s points au lieu de %s.', v_total, v_grille.max_analytique));
  end if;

  if not exists (select 1 from public.grille_criteres where grille_id = p_grille) then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'aucun_critere', 'message', 'Aucun critere rattache a cette grille.');
  end if;

  -- Chaque critere doit porter des descripteurs, dont un au maximum exact.
  for v_ligne in
    select c.id, c.code, c.max_points,
           count(d.id) as n,
           coalesce(max(d.points), -1) as plus_haut
    from public.grille_criteres c
    left join public.grille_descripteurs d on d.critere_id = c.id
    where c.grille_id = p_grille
    group by c.id, c.code, c.max_points
  loop
    if v_ligne.n = 0 then
      v_blocages := v_blocages || jsonb_build_object(
        'code', 'descripteurs_manquants',
        'message', format('Critere %s : aucun descripteur de niveau.', v_ligne.code));
    elsif v_ligne.plus_haut <> v_ligne.max_points then
      v_blocages := v_blocages || jsonb_build_object(
        'code', 'descripteur_max_absent',
        'message', format('Critere %s : le descripteur le plus haut vaut %s au lieu de %s.',
                          v_ligne.code, v_ligne.plus_haut, v_ligne.max_points));
    end if;
  end loop;

  -- Un code de taxonomie qui vise un critere absent de cette grille enverrait
  -- le correcteur sur un critere qui n'existe pas dans le bareme applique.
  for v_ligne in
    select t.code, t.critere_principal ->> v_grille.exercise_type as critere
    from public.taxonomie_redigee t
    where t.matiere = v_grille.matiere
      and t.critere_principal ? v_grille.exercise_type
  loop
    if not exists (
      select 1 from public.grille_criteres c
      where c.grille_id = p_grille and c.code = v_ligne.critere
    ) then
      v_blocages := v_blocages || jsonb_build_object(
        'code', 'critere_taxonomie_inconnu',
        'message', format('Le code %s vise le critere %s, absent de cette grille.', v_ligne.code, v_ligne.critere));
    end if;
  end loop;

  if v_grille.system_prompt is null or length(trim(v_grille.system_prompt)) < 50 then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'consigne_manquante',
      'message', 'La consigne systeme est vide ou trop courte : le correcteur refuserait de corriger.');
  end if;

  return jsonb_build_object('ok', jsonb_array_length(v_blocages) = 0,
                            'total', v_total, 'blocages', v_blocages);
end;
$$;

create or replace function public.grille_verrouiller(p_grille text, p_auteur text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_controles jsonb;
begin
  v_controles := public.grille_verifier(p_grille);
  if not (v_controles ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'raison', 'Controles non passes', 'controles', v_controles);
  end if;

  update public.grilles_redigees
  set statut = 'locked', verrouille_par = p_auteur, verrouille_le = now()
  where id = p_grille and statut in ('validated', 'ready_for_validation', 'calibrating', 'draft');

  return jsonb_build_object('ok', true, 'controles', v_controles);
end;
$$;

create or replace function public.grille_nouvelle_version(
  p_grille text, p_version text, p_auteur text default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_source public.grilles_redigees;
  v_nouvelle text;
  v_critere record;
  v_nouveau_critere text;
begin
  select * into v_source from public.grilles_redigees where id = p_grille;
  if not found then raise exception 'Grille % introuvable.', p_grille; end if;

  v_nouvelle := upper(replace(v_source.exercise_type, 'hggsp_', 'HGGSP_')) || '_V' || replace(p_version, '.', '_');

  insert into public.grilles_redigees (
    id, matiere, exercise_type, version, libelle, principe, system_prompt,
    max_analytique, max_officiel, statut, base_sur, garde_fous, cree_par
  )
  values (
    v_nouvelle, v_source.matiere, v_source.exercise_type, p_version, v_source.libelle,
    v_source.principe, v_source.system_prompt, v_source.max_analytique, v_source.max_officiel,
    'draft', v_source.id, v_source.garde_fous, p_auteur
  )
  on conflict (id) do nothing;

  for v_critere in select * from public.grille_criteres where grille_id = p_grille order by ordre loop
    v_nouveau_critere := v_nouvelle || '::' || v_critere.code;
    insert into public.grille_criteres (id, grille_id, code, libelle, evaluer, max_points, ordre)
    values (v_nouveau_critere, v_nouvelle, v_critere.code, v_critere.libelle,
            v_critere.evaluer, v_critere.max_points, v_critere.ordre)
    on conflict (id) do nothing;

    insert into public.grille_descripteurs (id, critere_id, points, niveau, description)
    select v_nouveau_critere || '::' || d.points, v_nouveau_critere, d.points, d.niveau, d.description
    from public.grille_descripteurs d
    where d.critere_id = v_critere.id
    on conflict (id) do nothing;
  end loop;

  return v_nouvelle;
end;
$$;

-- Les copies deja corrigees avec une version donnee : a relancer de facon
-- controlee si la grille change. Aucune correction n'est jamais ecrasee.
create or replace function public.grille_copies_concernees(p_grille text)
returns table (correction_id uuid, statut text, score_analytique numeric, corrigee_le timestamptz)
language sql
security definer
set search_path to ''
as $$
  select c.id, c.status, c.score_analytique, c.updated_at
  from public.corrections c
  where c.grille_id = p_grille
  order by c.updated_at desc;
$$;

commit;


-- =====================================================================
--  BLOC 9 - ROUTAGE VERS LE MOTEUR REDIGE
--
--  Le trigger de lancement automatique connait desormais trois moteurs.
--  Les deux premiers ne changent pas d'un iota.
-- =====================================================================

begin;

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

  v_fonction := case
                  when v_moteur = 'bareme_sujet'     then 'correct-copy-bareme'
                  when v_moteur = 'criteres_rediges' then 'correct-copy-redigee'
                  else 'correct-french-copy'
                end;

  perform private.invoke_pipeline_edge(v_fonction, new.correction_id);

  return new;
end;
$$;

commit;


-- =====================================================================
--  BLOC 10 - NOTE FINALE D'UN BAC BLANC COMPLET
--
--  Une vue, pas une colonne : la note finale est toujours recalculee a
--  partir des notes officielles des deux exercices. Impossible qu'elle
--  derive du detail.
-- =====================================================================

begin;

create or replace view public.v_notes_examen_redige as
select
  c.groupe_copie_id,
  min(c.student_name)                                as eleve,
  min(c.exam_format)                                 as exam_format,
  count(*)                                           as exercices,
  jsonb_object_agg(c.exercise_type, c.score_officiel) as detail_officiel,
  jsonb_object_agg(c.exercise_type, c.score_analytique) as detail_analytique,
  round(sum(c.score_officiel), 2)                    as note_finale,
  round(sum(c.max_officiel), 2)                      as note_finale_max,
  bool_or(c.human_review_required)                   as relecture_humaine
from public.corrections c
where c.moteur = 'criteres_rediges' and c.groupe_copie_id is not null
group by c.groupe_copie_id;

comment on view public.v_notes_examen_redige is
  'Note finale d''un bac blanc complet = SOMME DES NOTES OFFICIELLES (sur 10 chacune). Deux notes analytiques sur 20 ne sont jamais additionnees.';

commit;


-- =====================================================================
--  BLOC 11 - VERROUILLAGE DES NOUVELLES TABLES
--
--  RLS activee SANS AUCUNE POLICY = anon et authenticated ne peuvent ni
--  lire ni ecrire. Seuls le serveur de l'application, les Edge Functions
--  (service_role) et le SQL Editor y accedent. Meme regle que le BLOC 10
--  du SQL 33.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'grilles_redigees', 'grille_criteres', 'grille_descripteurs',
    'taxonomie_redigee', 'exam_exercices',
    'correction_criteres', 'correction_erreurs', 'correction_controles',
    'etalon_correction_humaine_criteres'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

revoke all on function public.grille_verifier(text) from public, anon, authenticated;
revoke all on function public.grille_verrouiller(text, text) from public, anon, authenticated;
revoke all on function public.grille_nouvelle_version(text, text, text) from public, anon, authenticated;
revoke all on function public.grille_copies_concernees(text) from public, anon, authenticated;

grant execute on function public.grille_verifier(text) to service_role;
grant execute on function public.grille_verrouiller(text, text) to service_role;
grant execute on function public.grille_nouvelle_version(text, text, text) to service_role;
grant execute on function public.grille_copies_concernees(text) to service_role;

revoke all on public.v_notes_examen_redige from anon, authenticated;


-- =====================================================================
--  BLOC 12 - VERIFICATION
--  Attendu : 9 lignes "true, true".
-- =====================================================================

select t.nom as table_attendue,
       (to_regclass('public.' || t.nom) is not null) as existe,
       coalesce((select c.relrowsecurity from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = t.nom), false) as rls_active
from (values
  ('grilles_redigees'), ('grille_criteres'), ('grille_descripteurs'),
  ('taxonomie_redigee'), ('exam_exercices'),
  ('correction_criteres'), ('correction_erreurs'), ('correction_controles'),
  ('etalon_correction_humaine_criteres')
) as t(nom)
order by t.nom;
