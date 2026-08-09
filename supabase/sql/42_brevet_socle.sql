-- =====================================================================
--  SOCLE DU BREVET (DNB) : DEUX MATIERES SEPAREES
--  brevet_francais  et  brevet_mathematiques
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run, dans l'ordre.
--
--  100% ASCII VOLONTAIRE : l'editeur SQL de Supabase abime les accents
--  colles depuis un Mac. Meme regle que 33_bareme_par_sujet.sql.
--
--  CE QUE CE FICHIER FAIT
--  ----------------------
--  Il ajoute le niveau d'examen DNB au dispositif existant, et les tables
--  propres aux deux epreuves du brevet. Il REUTILISE le socle du bareme par
--  sujet (exams / bareme_versions / bareme_exercices / bareme_questions /
--  bareme_awards / etalon_* / calibration_runs / correction_questions /
--  relectures_humaines / bareme_audit) parce que ce socle est generique :
--  un examen, des versions immuables, une note qui est une somme mecanique
--  faite par un trigger.
--
--  Il AJOUTE, en revanche, tout ce que le bac ne sait pas faire :
--    - des blocs de bareme a maximum propre (50 / 10 / 40 et 6 / 14) ;
--    - la dictee, sa configuration et ses regles de retrait PAR SUJET ;
--    - la reecriture, forme par forme ;
--    - les DEUX grilles de redaction (imagination et reflexion) ;
--    - les automatismes de mathematiques ;
--    - les 2 points de qualite redactionnelle, COMPRIS dans les 14 ;
--    - les erreurs en cascade, explicites ;
--    - la provenance de chaque decision ;
--    - la qualite documentaire ;
--    - l'audit des retouches humaines ;
--    - la trace des sources officielles.
--
--  CE QUE CE FICHIER NE FAIT PAS
--  -----------------------------
--  Il ne supprime AUCUNE table, AUCUNE colonne, AUCUNE ligne. Il ne modifie
--  aucun fichier de migration deja joue. Les deux seules contraintes
--  existantes touchees sont ELARGIES, jamais retrecies :
--    - corrections_moteur_valide gagne deux valeurs ;
--    - etalon_copies_niveau gagne les niveaux du brevet.
--  Les corrections du baccalaureat continuent d'emprunter exactement le meme
--  chemin qu'avant.
--
--  RETOUR ARRIERE
--  --------------
--  Le bloc 12, en commentaire, defait ce fichier dans l'ordre inverse. Il ne
--  touche a rien de ce qui existait avant. A jouer uniquement si aucun examen
--  DNB n'a encore de correction : sinon, archiver plutot que supprimer.
-- =====================================================================


-- =====================================================================
--  BLOC 1 - NIVEAU D'EXAMEN : LE BREVET ENTRE DANS LE DISPOSITIF
--
--  exams ne connaissait que le baccalaureat. Trois colonnes suffisent a
--  distinguer les deux mondes SANS dupliquer la table, et une contrainte
--  rend impossible ce que le cahier des charges interdit : qu'une copie de
--  brevet soit corrigee avec une grille de bac.
-- =====================================================================

begin;

alter table public.exams
  add column if not exists examen text not null default 'BAC',
  add column if not exists niveau text,
  add column if not exists serie  text not null default 'generale';

comment on column public.exams.examen is
  'BAC ou DNB. Aucun moteur du brevet n''accepte un examen BAC, aucun moteur du bac ne voit un examen DNB.';
comment on column public.exams.niveau is
  'Classe de reference : terminale, premiere, troisieme. Sert a l''affichage et aux statistiques.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exams_examen_valide') then
    alter table public.exams
      add constraint exams_examen_valide check (examen in ('BAC', 'DNB'));
  end if;

  -- Le garde-fou central : matiere du brevet <=> examen DNB. Les deux sens.
  if not exists (select 1 from pg_constraint where conname = 'exams_brevet_coherence') then
    alter table public.exams
      add constraint exams_brevet_coherence check (
        (matiere in ('brevet_francais', 'brevet_mathematiques') and examen = 'DNB')
        or
        (matiere not in ('brevet_francais', 'brevet_mathematiques') and examen = 'BAC')
      );
  end if;
end
$$;

create index if not exists exams_examen_idx on public.exams (examen, matiere);

commit;


-- =====================================================================
--  BLOC 2 - AIGUILLAGE : DEUX MOTEURS DE PLUS
--
--  corrections.moteur ne connaissait que 'grille_generique' et
--  'bareme_sujet'. On ELARGIT la contrainte : les deux anciennes valeurs
--  restent valides, rien n'est reecrit.
-- =====================================================================

begin;

-- La contrainte est reconstruite a partir de ce qui EXISTE DEJA en base,
-- jamais a partir d'une liste ecrite a la main : le SQL 33 en autorisait deux
-- valeurs, le SQL 40 (HGGSP v2) en a ajoute une troisieme ('criteres_rediges'),
-- et une liste figee ici invaliderait les corrections deja rendues.
-- On prend donc l'union : valeurs presentes dans la table + valeurs connues.
do $$
declare
  v_valeurs text[];
  v_liste   text;
begin
  select coalesce(array_agg(distinct moteur), '{}')
    into v_valeurs
  from public.corrections
  where moteur is not null;

  v_valeurs := array(
    select distinct v from unnest(
      v_valeurs || array[
        'grille_generique',      -- SQL 33
        'bareme_sujet',          -- SQL 33
        'criteres_rediges',      -- SQL 40, HGGSP v2
        'brevet_francais',       -- ce fichier
        'brevet_mathematiques'   -- ce fichier
      ]
    ) as v order by v
  );

  select string_agg(quote_literal(v), ', ' order by v)
    into v_liste
  from unnest(v_valeurs) as v;

  if exists (select 1 from pg_constraint where conname = 'corrections_moteur_valide') then
    alter table public.corrections drop constraint corrections_moteur_valide;
  end if;

  execute format(
    'alter table public.corrections add constraint corrections_moteur_valide check (moteur in (%s))',
    v_liste);

  raise notice 'corrections_moteur_valide : % valeur(s) autorisees -> %',
    cardinality(v_valeurs), v_liste;
end
$$;

comment on column public.corrections.moteur is
  'grille_generique / bareme_sujet / criteres_rediges = baccalaureat. brevet_francais / brevet_mathematiques = DNB. Ne jamais comparer deux mondes sans le dire.';


-- La contrainte de COHERENCE apprend elle aussi les deux moteurs du brevet.
-- Sans cela, aucune copie de brevet ne pourrait etre inseree : elle porte un
-- exam_id mais ni subject_id ni rubric_id, ce qu'aucune branche n'autorisait.
-- Les trois branches du baccalaureat sont reprises MOT POUR MOT du SQL 40.
do $$
declare
  v_inconnus text;
begin
  select string_agg(distinct moteur, ', ') into v_inconnus
  from public.corrections
  where moteur not in (
    'grille_generique', 'bareme_sujet', 'criteres_rediges',
    'brevet_francais', 'brevet_mathematiques'
  );

  if v_inconnus is not null then
    raise exception
      'Moteur(s) inconnu(s) en base : %. Ajoute leur regle de coherence dans ce bloc avant de le rejouer, plutot que de retirer la contrainte.',
      v_inconnus;
  end if;

  if exists (select 1 from pg_constraint where conname = 'corrections_coherence_moteur') then
    alter table public.corrections drop constraint corrections_coherence_moteur;
  end if;

  alter table public.corrections
    add constraint corrections_coherence_moteur check (
      (moteur = 'grille_generique' and subject_id is not null and rubric_id is not null)
      or (moteur = 'bareme_sujet' and exam_id is not null)
      or (moteur = 'criteres_rediges' and subject_id is not null and rubric_id is not null
          and grille_id is not null)
      or (moteur in ('brevet_francais', 'brevet_mathematiques') and exam_id is not null)
    );
end
$$;

comment on constraint corrections_coherence_moteur on public.corrections is
  'Chaque moteur exige ce dont il a besoin, et rien de plus : la grille generique sa fiche sujet et sa grille, le bareme par sujet son examen, les criteres rediges leur grille analytique, le brevet son examen.';

-- Amenagements eventuels du candidat (tiers-temps, secretaire, agrandissement).
-- Ils sont transmis au correcteur pour qu'il en tienne compte, et traces dans
-- le resultat. Aucune correction du bac n'est modifiee : la colonne nait NULL.
alter table public.corrections
  add column if not exists amenagements text[] not null default '{}';

comment on column public.corrections.amenagements is
  'Amenagements du candidat, remontes dans les metadonnees de la correction. Vide par defaut : aucune copie existante n''est modifiee.';

-- Colonnes propres au brevet sur le detail par question. Elles restent NULL
-- pour toutes les corrections du bac : rien ne change pour elles.
alter table public.correction_questions
  add column if not exists bloc              text,
  add column if not exists partie            text,
  add column if not exists statut_reponse    text,
  add column if not exists source_regle      text,
  add column if not exists nature_decision   text,
  add column if not exists certitude         numeric(4,3),
  add column if not exists depends_on_question text,
  add column if not exists inherited_value   text,
  add column if not exists cascade_error     boolean not null default false,
  add column if not exists method_valid_from_student_value boolean not null default false,
  add column if not exists cascade_penalty_applied boolean not null default false;

comment on column public.correction_questions.source_regle is
  'Provenance de la decision : subject_bareme > official_correction > admin_instruction > official_exam_rule > default_rubric, ou human_override.';
comment on column public.correction_questions.cascade_error is
  'true quand l''eleve a reutilise correctement un resultat faux obtenu plus haut. Les points de methode sont alors conserves.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'correction_questions_source_valide') then
    alter table public.correction_questions
      add constraint correction_questions_source_valide check (
        source_regle is null or source_regle in (
          'subject_bareme', 'official_correction', 'admin_instruction',
          'official_exam_rule', 'default_rubric', 'human_override'
        )
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_questions_nature_valide') then
    alter table public.correction_questions
      add constraint correction_questions_nature_valide check (
        nature_decision is null or nature_decision in (
          'prevue_par_bareme', 'interpretation_raisonnable', 'a_valider'
        )
      );
  end if;
  -- Une cascade sans question source serait une cascade inventee : la regle
  -- de non-double-sanction ne pourrait pas s'appliquer.
  if not exists (select 1 from pg_constraint where conname = 'correction_questions_cascade_coherente') then
    alter table public.correction_questions
      add constraint correction_questions_cascade_coherente check (
        (not cascade_error) or depends_on_question is not null
      );
  end if;
end
$$;

-- Le degre de validation humaine : information / recommandee / bloquante.
alter table public.relectures_humaines
  add column if not exists degre text not null default 'recommandee';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'relectures_degre_valide') then
    alter table public.relectures_humaines
      add constraint relectures_degre_valide check (degre in ('information', 'recommandee', 'bloquante'));
  end if;
end
$$;

-- Les copies etalons du brevet ont leurs propres niveaux. On ELARGIT la
-- contrainte : les sept niveaux du bac restent acceptes tels quels.
alter table public.etalon_copies drop constraint if exists etalon_copies_niveau;
alter table public.etalon_copies
  add constraint etalon_copies_niveau check (niveau_cible is null or niveau_cible in (
    'presque_blanche', 'tres_faible', 'fragile', 'moyen', 'assez_bon', 'tres_bon', 'excellent',
    'satisfaisant', 'atypique', 'incomplete', 'difficile_a_lire'
  ));

commit;


-- =====================================================================
--  BLOC 3 - BLOCS DE BAREME A MAXIMUM PROPRE
--
--  Le bac n'a qu'un maximum, celui de la version. Le brevet en a trois en
--  francais (50 / 10 / 40) et deux en mathematiques (6 / 14). Une table
--  dediee, et un trigger qui recalcule ce que chaque bloc pese vraiment.
-- =====================================================================

begin;

create table if not exists public.brevet_parties (
  id                uuid primary key default gen_random_uuid(),
  bareme_version_id uuid not null references public.bareme_versions (id) on delete cascade,
  code              text not null,
  libelle           text not null,
  max_points        numeric(6,2) not null,
  points_saisis     numeric(6,2) not null default 0,
  ordre             integer not null default 0,
  commentaire       text,
  constraint brevet_parties_unicite unique (bareme_version_id, code),
  constraint brevet_parties_max_positif check (max_points > 0)
);

comment on table public.brevet_parties is
  'Blocs de bareme a maximum propre. Francais : texte 50 (reecriture comprise), dictee 10, redaction 40. Mathematiques : automatismes 6, raisonnement 14 dont 2 de redaction.';
comment on column public.brevet_parties.points_saisis is
  'Somme reelle des points saisis dans ce bloc. Recalculee par trigger, jamais a la main.';

create index if not exists brevet_parties_version_idx on public.brevet_parties (bareme_version_id, ordre);

-- Colonnes propres au brevet sur les questions de bareme. Elles restent NULL
-- pour tous les baremes du bac deja en base.
alter table public.bareme_questions
  add column if not exists sous_numero          text,
  add column if not exists type_reponse         text,
  add column if not exists elements_attendus    jsonb not null default '[]'::jsonb,
  add column if not exists citations_attendues  jsonb not null default '[]'::jsonb,
  add column if not exists degre_justification  text,
  add column if not exists domaines             text[] not null default '{}',
  add column if not exists connaissances        text[] not null default '{}',
  add column if not exists justification_attendue text,
  add column if not exists regle_cascade        text,
  add column if not exists etapes_geometrie     text[] not null default '{}',
  add column if not exists regles_points_partiels jsonb not null default '[]'::jsonb;

comment on column public.bareme_questions.elements_attendus is
  'Elements attendus, un par entree. Un tableau vide = question sans corrige : brevet_verifier() bloque.';
comment on column public.bareme_questions.etapes_geometrie is
  'Etapes de demonstration reellement exigees : hypotheses, propriete, remplacement_numerique, calcul, unite, conclusion. Vide = question non geometrique.';

create or replace function public.brevet_recalcule_parties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version uuid := coalesce(new.bareme_version_id, old.bareme_version_id);
begin
  update public.brevet_parties p
  set points_saisis = coalesce((
        select sum(q.max_points)
        from public.bareme_questions q
        where q.bareme_version_id = v_version
          and q.partie = p.code
      ), 0)
  where p.bareme_version_id = v_version;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_brevet_recalcule_parties on public.bareme_questions;
create trigger trg_brevet_recalcule_parties
  after insert or update or delete on public.bareme_questions
  for each row execute function public.brevet_recalcule_parties();

commit;


-- =====================================================================
--  BLOC 4 - FRANCAIS : REECRITURE, DICTEE, REDACTION
--
--  Trois moteurs que le baccalaureat n'a pas. Chacun porte SON bareme,
--  propre au sujet. Le point capital : aucune valeur par defaut n'est
--  ecrite en dur pour la dictee. Sans regles saisies, le moteur refuse de
--  noter plutot que d'inventer un bareme national qui n'existe pas.
-- =====================================================================

begin;

-- --- Reecriture ------------------------------------------------------

create table if not exists public.brevet_reecriture_config (
  bareme_version_id      uuid primary key references public.bareme_versions (id) on delete cascade,
  max_points             numeric(5,2) not null,
  -- Le "bareme specifique" aux erreurs de pure copie, prevu par la note de
  -- service. NULL = non renseigne : AUCUNE penalite n'est appliquee.
  penalite_erreur_copie  numeric(5,2),
  plafond_erreurs_copie  numeric(5,2),
  consigne               text,
  bareme_du_sujet_fourni boolean not null default false,
  maj_le                 timestamptz not null default now()
);

comment on column public.brevet_reecriture_config.penalite_erreur_copie is
  'Note de service : "Les erreurs de pure copie ne portant pas sur les formes a modifier sont prises en compte dans l''evaluation selon un bareme specifique." Ce bareme est propre au sujet : NULL = rien n''est retire.';

create table if not exists public.brevet_reecriture_items (
  id                uuid primary key default gen_random_uuid(),
  bareme_version_id uuid not null references public.bareme_versions (id) on delete cascade,
  cle               text not null,
  ordre             integer not null default 0,
  forme_originale   text not null,
  forme_attendue    text not null,
  transformation    text not null,
  points            numeric(5,2) not null,
  variantes_admises jsonb not null default '[]'::jsonb,
  commentaire       text,
  constraint brevet_reecriture_unicite unique (bareme_version_id, cle),
  constraint brevet_reecriture_points check (points >= 0)
);

-- --- Dictee ----------------------------------------------------------

create table if not exists public.brevet_dictee_config (
  bareme_version_id uuid primary key references public.bareme_versions (id) on delete cascade,
  max_points        numeric(5,2) not null default 10,
  texte_attendu     text not null default '',
  -- 600 signes environ en serie generale (note de service).
  longueur_signes   integer,
  plancher          numeric(5,2) not null default 0,
  graphies_admises  jsonb not null default '[]'::jsonb,
  -- D'ou vient le bareme de retrait. NULL = il n'y en a pas : on ne note pas.
  source_bareme     text,
  consigne          text,
  maj_le            timestamptz not null default now(),
  constraint brevet_dictee_source check (source_bareme is null or source_bareme in (
    'subject_bareme', 'official_correction', 'admin_instruction'
  ))
);

comment on table public.brevet_dictee_config is
  'Configuration de la dictee, PAR SUJET. Aucun bareme national de dictee n''existe : sans regles saisies, correct-brevet-francais refuse de noter ce bloc et demande une validation humaine.';

create table if not exists public.brevet_dictee_regles (
  id                uuid primary key default gen_random_uuid(),
  bareme_version_id uuid not null references public.bareme_versions (id) on delete cascade,
  categorie         text not null,
  sous_categorie    text,
  penalite          numeric(5,2) not null,
  plafond           numeric(5,2),
  cumul_repetitions boolean not null default false,
  regle             text not null,
  ordre             integer not null default 0,
  constraint brevet_dictee_regles_unicite unique (bareme_version_id, categorie, sous_categorie),
  constraint brevet_dictee_regles_penalite check (penalite >= 0),
  constraint brevet_dictee_regles_categorie check (categorie in (
    'mot_oublie', 'mot_ajoute', 'substitution', 'accord', 'grammaire', 'lexique',
    'conjugaison', 'homophone', 'accent', 'majuscule', 'ponctuation', 'trait_union',
    'apostrophe', 'segmentation', 'graphie_rectifiee', 'reconnaissance_ocr'
  ))
);

comment on column public.brevet_dictee_regles.cumul_repetitions is
  'false = une meme erreur repetee n''est comptee qu''une fois. C''est le defaut, et c''est ce que fait le moteur.';

-- --- Redaction : DEUX grilles, jamais fusionnees ----------------------

create table if not exists public.brevet_redaction_grilles (
  id                uuid primary key default gen_random_uuid(),
  bareme_version_id uuid not null references public.bareme_versions (id) on delete cascade,
  type_sujet        text not null,
  intitule          text not null default '',
  max_points        numeric(5,2) not null default 40,
  longueur_minimale integer,
  issue_du_sujet    boolean not null default false,
  consigne          text,
  constraint brevet_redaction_grilles_unicite unique (bareme_version_id, type_sujet),
  constraint brevet_redaction_grilles_type check (type_sujet in ('imagination', 'reflexion'))
);

comment on column public.brevet_redaction_grilles.issue_du_sujet is
  'false = grille par defaut. La correction porte alors source_regle = default_rubric et part en validation humaine.';

create table if not exists public.brevet_redaction_criteres (
  id           uuid primary key default gen_random_uuid(),
  grille_id    uuid not null references public.brevet_redaction_grilles (id) on delete cascade,
  code         text not null,
  libelle      text not null,
  max_points   numeric(5,2) not null,
  descripteurs jsonb not null default '[]'::jsonb,
  famille      text,
  -- true seulement si le bareme du sujet autorise explicitement le cumul avec
  -- les autres criteres de la meme famille (non-double-penalisation).
  cumul_famille_autorise boolean not null default false,
  actif        boolean not null default true,
  ordre        integer not null default 0,
  constraint brevet_redaction_criteres_unicite unique (grille_id, code),
  constraint brevet_redaction_criteres_points check (max_points >= 0)
);

commit;


-- =====================================================================
--  BLOC 5 - MATHEMATIQUES : AUTOMATISMES ET QUALITE DE LA REDACTION
--
--  Les questions de la partie 2 vivent dans bareme_questions (partie =
--  'raisonnement'). Les automatismes ont leur table propre : ils ne se
--  corrigent pas comme un probleme, et la calculatrice y est interdite.
-- =====================================================================

begin;

create table if not exists public.brevet_automatismes (
  id                  uuid primary key default gen_random_uuid(),
  bareme_version_id   uuid not null references public.bareme_versions (id) on delete cascade,
  item_key            text not null,
  numero              text not null,
  ordre               integer not null default 0,
  notion              text not null,
  theme               text not null,
  competence          text not null,
  reponse_attendue    text not null,
  variantes_acceptees jsonb not null default '[]'::jsonb,
  unite_attendue      text,
  tolerance           numeric(10,5),
  forme_exigee        text,
  points              numeric(5,2) not null,
  codes_erreurs       text[] not null default '{}',
  commentaire         text,
  constraint brevet_automatismes_unicite unique (bareme_version_id, item_key),
  constraint brevet_automatismes_points check (points > 0),
  constraint brevet_automatismes_theme check (theme in (
    'nombres_et_calculs', 'espace_et_geometrie',
    'organisation_gestion_donnees_probabilites',
    'proportionnalite_fonctions', 'algorithmique_et_programmation'
  )),
  constraint brevet_automatismes_competence check (competence in (
    'chercher', 'modeliser', 'representer', 'raisonner', 'calculer', 'communiquer'
  ))
);

comment on table public.brevet_automatismes is
  'Partie 1, 6 points, 20 minutes, SANS calculatrice. Les themes reprennent la liste indicative d''automatismes publiee par le ministere en octobre 2025.';

create table if not exists public.brevet_qualite_redaction_criteres (
  id                uuid primary key default gen_random_uuid(),
  bareme_version_id uuid not null references public.bareme_versions (id) on delete cascade,
  code              text not null,
  libelle           text not null,
  max_points        numeric(5,2) not null,
  descripteurs      jsonb not null default '[]'::jsonb,
  actif             boolean not null default true,
  ordre             integer not null default 0,
  constraint brevet_qualite_unicite unique (bareme_version_id, code),
  constraint brevet_qualite_points check (max_points >= 0)
);

comment on table public.brevet_qualite_redaction_criteres is
  'Les 2 points de qualite de la redaction mathematique. Ils sont COMPRIS dans les 14 de la partie 2 : brevet_verifier() refuse un bareme qui les ajouterait au-dessus.';

commit;


-- =====================================================================
--  BLOC 6 - LE DETAIL D'UNE CORRECTION DE BREVET
--
--  correction_questions porte deja les questions (bac comme brevet), et
--  son trigger fait la somme. Ces tables-ci portent ce qu'aucune question
--  ne sait porter : les formes de reecriture, les erreurs de dictee, les
--  criteres de redaction, les items d'automatismes.
-- =====================================================================

begin;

create table if not exists public.correction_automatismes (
  id             uuid primary key default gen_random_uuid(),
  correction_id  uuid not null references public.corrections (id) on delete cascade,
  item_key       text not null,
  numero         text not null,
  notion         text,
  competence     text,
  reponse_attendue text,
  reponse_eleve  text,
  statut         text not null,
  points         numeric(5,2) not null default 0,
  max_points     numeric(5,2) not null,
  justification  text,
  certitude      numeric(4,3),
  points_humain  numeric(5,2),
  commentaire_humain text,
  cree_le        timestamptz not null default now(),
  constraint correction_automatismes_unicite unique (correction_id, item_key),
  constraint correction_automatismes_bornes check (points >= 0 and points <= max_points)
);

create index if not exists correction_automatismes_idx on public.correction_automatismes (correction_id);

create table if not exists public.correction_reecriture_formes (
  id              uuid primary key default gen_random_uuid(),
  correction_id   uuid not null references public.corrections (id) on delete cascade,
  cle             text not null,
  forme_originale text not null,
  forme_attendue  text not null,
  forme_produite  text not null default '',
  transformation  text not null default '',
  statut          text not null,
  points          numeric(5,2) not null default 0,
  max_points      numeric(5,2) not null,
  type_erreur     text,
  justification   text,
  ambigu          boolean not null default false,
  points_humain   numeric(5,2),
  cree_le         timestamptz not null default now(),
  constraint correction_reecriture_unicite unique (correction_id, cle),
  constraint correction_reecriture_statut check (statut in (
    'exacte', 'variante_admise', 'transformation_manquee', 'transformation_partielle',
    'erreur_de_copie_seule', 'absente', 'illisible'
  ))
);

create index if not exists correction_reecriture_idx on public.correction_reecriture_formes (correction_id);

create table if not exists public.correction_dictee_erreurs (
  id                 uuid primary key default gen_random_uuid(),
  correction_id      uuid not null references public.corrections (id) on delete cascade,
  rang               integer not null,
  segment_attendu    text not null default '',
  segment_produit    text not null default '',
  categorie          text not null,
  sous_categorie     text,
  regle              text,
  penalite_prevue    numeric(5,2) not null default 0,
  penalite_appliquee numeric(5,2) not null default 0,
  explication        text,
  certitude          numeric(4,3),
  repetition_de      integer,
  retenue_par_humain boolean,
  cree_le            timestamptz not null default now(),
  constraint correction_dictee_unicite unique (correction_id, rang)
);

create index if not exists correction_dictee_idx on public.correction_dictee_erreurs (correction_id);

comment on column public.correction_dictee_erreurs.penalite_appliquee is
  'Peut valoir 0 alors que penalite_prevue ne l''est pas : repetition non cumulee, plafond de categorie atteint, ou decalage de transcription suspecte.';

create table if not exists public.correction_redaction (
  correction_id      uuid primary key references public.corrections (id) on delete cascade,
  sujet_choisi       text not null,
  grille_appliquee   text,
  grille_issue_du_sujet boolean not null default false,
  indices_du_choix   jsonb not null default '[]'::jsonb,
  longueur_estimee   integer,
  longueur_minimale  integer,
  score              numeric(5,2),
  max_points         numeric(5,2) not null default 40,
  cree_le            timestamptz not null default now(),
  constraint correction_redaction_sujet check (sujet_choisi in (
    'imagination', 'reflexion', 'incertain', 'les_deux', 'non_identifiable'
  ))
);

comment on column public.correction_redaction.score is
  'NULL quand le sujet traite n''a pas pu etre identifie : on ne note pas a la place d''un humain, et on ne met pas zero.';

create table if not exists public.correction_redaction_criteres (
  id             uuid primary key default gen_random_uuid(),
  correction_id  uuid not null references public.corrections (id) on delete cascade,
  code           text not null,
  libelle        text not null,
  score          numeric(5,2) not null default 0,
  max_points     numeric(5,2) not null,
  niveau         text,
  preuves        jsonb not null default '[]'::jsonb,
  points_forts   jsonb not null default '[]'::jsonb,
  insuffisances  jsonb not null default '[]'::jsonb,
  erreurs        jsonb not null default '[]'::jsonb,
  conseil        text,
  certitude      numeric(4,3),
  points_humain  numeric(5,2),
  commentaire_humain text,
  cree_le        timestamptz not null default now(),
  constraint correction_redaction_criteres_unicite unique (correction_id, code),
  constraint correction_redaction_criteres_bornes check (score >= 0 and score <= max_points)
);

create index if not exists correction_redaction_criteres_idx on public.correction_redaction_criteres (correction_id);

create table if not exists public.correction_qualite_redaction (
  id             uuid primary key default gen_random_uuid(),
  correction_id  uuid not null references public.corrections (id) on delete cascade,
  code           text not null,
  libelle        text not null,
  score          numeric(5,2) not null default 0,
  max_points     numeric(5,2) not null,
  observation    text,
  preuves        jsonb not null default '[]'::jsonb,
  neutralise     boolean not null default false,
  cree_le        timestamptz not null default now(),
  constraint correction_qualite_unicite unique (correction_id, code),
  constraint correction_qualite_bornes check (score >= 0 and score <= max_points)
);

comment on column public.correction_qualite_redaction.neutralise is
  'true quand le critere a ete neutralise pour eviter une double penalisation avec ce qui a deja ete retire question par question.';

create table if not exists public.correction_document_qualite (
  correction_id   uuid primary key references public.corrections (id) on delete cascade,
  statut          text not null default 'readable',
  missing_pages   integer[] not null default '{}',
  duplicate_pages integer[] not null default '{}',
  uncertain_zones jsonb not null default '[]'::jsonb,
  anomalies       jsonb not null default '[]'::jsonb,
  requires_human_review boolean not null default false,
  cree_le         timestamptz not null default now(),
  constraint correction_document_statut check (statut in ('readable', 'partially_readable', 'unreadable'))
);

comment on table public.correction_document_qualite is
  'Anomalies documentaires. Une zone illisible n''est JAMAIS enregistree comme une absence de reponse : ce sont deux codes distincts, et l''illisible declenche une validation humaine.';

commit;


-- =====================================================================
--  BLOC 7 - RETOUCHES HUMAINES : RIEN NE SE PERD
--
--  Toute correction manuelle conserve la valeur proposee par l'IA, la
--  nouvelle valeur, le correcteur, la date, le motif, le commentaire et
--  l'impact sur la note. La table est en APPEND ONLY : un trigger refuse
--  toute modification ou suppression d'une ligne deja ecrite.
-- =====================================================================

begin;

create table if not exists public.correction_modifications_humaines (
  id              bigserial primary key,
  correction_id   uuid not null references public.corrections (id) on delete cascade,
  cible_type      text not null,
  cible_cle       text not null,
  valeur_ia       numeric(6,2),
  valeur_humaine  numeric(6,2) not null,
  max_points      numeric(6,2),
  correcteur      text not null,
  motif           text not null,
  commentaire     text,
  impact_note     numeric(6,2) not null default 0,
  note_avant      numeric(6,2),
  note_apres      numeric(6,2),
  cree_le         timestamptz not null default now(),
  constraint modifications_cible_type check (cible_type in (
    'question', 'automatisme', 'reecriture', 'dictee', 'redaction_critere',
    'qualite_redaction', 'note_globale'
  ))
);

create index if not exists modifications_correction_idx
  on public.correction_modifications_humaines (correction_id, cree_le);

create or replace function public.modifications_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'L''historique des retouches humaines est en ecriture seule : on n''efface pas une decision, on en ajoute une nouvelle.';
end;
$$;

drop trigger if exists trg_modifications_append_only on public.correction_modifications_humaines;
create trigger trg_modifications_append_only
  before update or delete on public.correction_modifications_humaines
  for each row execute function public.modifications_append_only();

commit;


-- =====================================================================
--  BLOC 8 - SOURCES OFFICIELLES ET REGLES REGLEMENTAIRES
--
--  Aucune regle n'est presentee comme officielle sans sa trace. Le statut
--  distingue ce qui est ecrit dans un texte officiel, ce qui s'en deduit,
--  et ce qui reste a confirmer.
-- =====================================================================

begin;

create table if not exists public.sources_officielles (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  titre            text not null,
  organisme        text not null,
  url              text not null,
  date_publication date,
  date_maj         date,
  date_consultation date not null,
  session_concernee text,
  statut           text not null default 'officiel',
  resume           text,
  cree_le          timestamptz not null default now(),
  constraint sources_statut check (statut in ('officiel', 'complementaire', 'a_confirmer'))
);

create table if not exists public.brevet_regles_officielles (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  matiere      text not null,
  libelle      text not null,
  valeur       text,
  valeur_num   numeric(8,3),
  statut       text not null,
  source_code  text references public.sources_officielles (code) on delete set null,
  citation     text,
  session      text,
  maj_le       timestamptz not null default now(),
  constraint brevet_regles_unicite unique (code, matiere),
  constraint brevet_regles_statut check (statut in (
    'officiel', 'officiel_par_deduction', 'complementaire', 'a_confirmer'
  )),
  constraint brevet_regles_matiere check (matiere in (
    'brevet_francais', 'brevet_mathematiques', 'commun'
  ))
);

comment on table public.brevet_regles_officielles is
  'Les regles chiffrees appliquees par les moteurs, avec leur statut. Une regle a_confirmer n''a AUCUN effet sur la note : elle documente ce qui reste a verifier.';

-- Parametres d'exploitation par matiere : seuils de note declenchant une
-- relecture, tolerances, plafonds. Aucune valeur pedagogique ici.
create table if not exists public.brevet_parametres (
  matiere    text not null,
  cle        text not null,
  valeur     jsonb not null,
  commentaire text,
  maj_le     timestamptz not null default now(),
  primary key (matiere, cle),
  constraint brevet_parametres_matiere check (matiere in (
    'brevet_francais', 'brevet_mathematiques', 'commun'
  ))
);

commit;


-- =====================================================================
--  BLOC 9 - LES CONTROLES BLOQUANTS DU BREVET
--
--  brevet_verifier() est LA regle en base. L'interface l'appelle pour
--  afficher les blocages, et bareme_verrouiller() ne peut pas etre
--  contournee : un bareme de brevet incomplet ne se verrouille pas.
-- =====================================================================

begin;

create or replace function public.brevet_verifier(p_version uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version  public.bareme_versions%rowtype;
  v_exam     public.exams%rowtype;
  v_blocages jsonb := '[]'::jsonb;
  v_avertis  jsonb := '[]'::jsonb;
  v_ligne    record;
  v_texte    numeric;
  v_reecr    numeric;
  v_dictee   numeric;
  v_redac    numeric;
  v_auto     numeric;
  v_raison   numeric;
  v_qualite  numeric;
  v_total    numeric;
  v_nb_regles integer;
  v_nb_grilles integer;
begin
  select * into v_version from public.bareme_versions where id = p_version;
  if not found then
    return jsonb_build_object('ok', false, 'blocages',
      jsonb_build_array(jsonb_build_object('code', 'version_inconnue',
        'message', 'Version de bareme introuvable.')));
  end if;

  select * into v_exam from public.exams where id = v_version.exam_id;
  if v_exam.examen <> 'DNB' then
    return jsonb_build_object('ok', false, 'blocages',
      jsonb_build_array(jsonb_build_object('code', 'pas_un_brevet',
        'message', 'Cet examen n''est pas un DNB : utiliser bareme_verifier() pour le baccalaureat.')));
  end if;

  -- ----- FRANCAIS ----------------------------------------------------
  if v_exam.matiere = 'brevet_francais' then
    -- Le bloc "texte" additionne ses trois parties possibles : la partie
    -- generique, et les deux sous-parties que les sujets reels nomment
    -- ("Comprehension et competences d'interpretation" 32 points,
    --  "Grammaire et competences linguistiques" 18 points, reecriture comprise).
    select coalesce(sum(max_points), 0) into v_texte
      from public.bareme_questions
      where bareme_version_id = p_version
        and partie in ('texte', 'comprehension', 'grammaire');
    select coalesce(max_points, 0) into v_reecr
      from public.brevet_reecriture_config where bareme_version_id = p_version;
    v_reecr := coalesce(v_reecr, 0);
    select coalesce(max_points, 0) into v_dictee
      from public.brevet_dictee_config where bareme_version_id = p_version;
    v_dictee := coalesce(v_dictee, 0);
    select coalesce(max(max_points), 0) into v_redac
      from public.brevet_redaction_grilles where bareme_version_id = p_version;

    if abs((v_texte + v_reecr) - 50) > 0.001 then
      v_blocages := v_blocages || jsonb_build_object('code', 'bloc_texte_incorrect',
        'message', format('Le travail sur le texte (reecriture comprise) totalise %s points au lieu de 50.', v_texte + v_reecr));
    end if;
    if abs(v_dictee - 10) > 0.001 then
      v_blocages := v_blocages || jsonb_build_object('code', 'bloc_dictee_incorrect',
        'message', format('La dictee est baremee sur %s au lieu de 10.', v_dictee));
    end if;
    if abs(v_redac - 40) > 0.001 then
      v_blocages := v_blocages || jsonb_build_object('code', 'bloc_redaction_incorrect',
        'message', format('La redaction est baremee sur %s au lieu de 40.', v_redac));
    end if;

    v_total := v_texte + v_reecr + v_dictee + v_redac;
    if abs(v_total - 100) > 0.001 then
      v_blocages := v_blocages || jsonb_build_object('code', 'total_incorrect',
        'message', format('Le bareme totalise %s points au lieu de 100.', v_total));
    end if;

    -- Sans regles de retrait, le moteur refuse de noter la dictee.
    select count(*) into v_nb_regles
      from public.brevet_dictee_regles where bareme_version_id = p_version;
    if v_nb_regles = 0 then
      v_blocages := v_blocages || jsonb_build_object('code', 'dictee_sans_regles',
        'message', 'Aucune regle de retrait pour la dictee : le moteur refusera de la noter plutot que d''inventer un bareme.');
    end if;
    if not exists (select 1 from public.brevet_dictee_config
                   where bareme_version_id = p_version and btrim(texte_attendu) <> '') then
      v_blocages := v_blocages || jsonb_build_object('code', 'dictee_sans_texte',
        'message', 'Le texte attendu de la dictee n''est pas saisi : aucune comparaison n''est possible.');
    end if;

    -- Les DEUX grilles de redaction sont obligatoires : la note de service
    -- impose deux sujets au choix.
    select count(distinct type_sujet) into v_nb_grilles
      from public.brevet_redaction_grilles where bareme_version_id = p_version;
    if v_nb_grilles < 2 then
      v_blocages := v_blocages || jsonb_build_object('code', 'grilles_redaction_incompletes',
        'message', 'Les deux grilles de redaction (imagination ET reflexion) sont obligatoires.');
    end if;

    for v_ligne in
      select g.type_sujet, coalesce(sum(c.max_points), 0) as somme, g.max_points
      from public.brevet_redaction_grilles g
      left join public.brevet_redaction_criteres c on c.grille_id = g.id and c.actif
      where g.bareme_version_id = p_version
      group by g.type_sujet, g.max_points
      having abs(coalesce(sum(c.max_points), 0) - g.max_points) > 0.001
    loop
      v_blocages := v_blocages || jsonb_build_object('code', 'grille_redaction_incoherente',
        'message', format('Grille "%s" : les criteres totalisent %s points au lieu de %s.',
          v_ligne.type_sujet, v_ligne.somme, v_ligne.max_points));
    end loop;

    for v_ligne in
      select question_key, numero from public.bareme_questions
      where bareme_version_id = p_version and jsonb_array_length(elements_attendus) = 0
      order by ordre
    loop
      v_blocages := v_blocages || jsonb_build_object('code', 'corrige_manquant',
        'question_key', v_ligne.question_key,
        'message', format('Question %s : aucun element attendu (question sans corrige).', v_ligne.numero));
    end loop;

    for v_ligne in
      select question_key, numero from public.bareme_questions
      where bareme_version_id = p_version and jsonb_array_length(regles_points_partiels) = 0
      order by ordre
    loop
      v_avertis := v_avertis || jsonb_build_object('code', 'points_partiels_manquants',
        'question_key', v_ligne.question_key,
        'message', format('Question %s : aucune regle de points partiels, tout se jouera en tout ou rien.', v_ligne.numero));
    end loop;

    if not exists (select 1 from public.brevet_reecriture_items where bareme_version_id = p_version) then
      v_avertis := v_avertis || jsonb_build_object('code', 'reecriture_absente',
        'message', 'Aucune forme de reecriture saisie : verifier que le sujet n''en comporte reellement pas.');
    end if;
    if exists (select 1 from public.brevet_reecriture_config
               where bareme_version_id = p_version and penalite_erreur_copie is null) then
      v_avertis := v_avertis || jsonb_build_object('code', 'bareme_copie_absent',
        'message', 'Le bareme specifique aux erreurs de pure copie n''est pas renseigne : aucune penalite ne sera appliquee.');
    end if;

  -- ----- MATHEMATIQUES -----------------------------------------------
  elsif v_exam.matiere = 'brevet_mathematiques' then
    select coalesce(sum(points), 0) into v_auto
      from public.brevet_automatismes where bareme_version_id = p_version;
    select coalesce(sum(max_points), 0) into v_raison
      from public.bareme_questions where bareme_version_id = p_version and partie = 'raisonnement';
    select coalesce(sum(max_points), 0) into v_qualite
      from public.brevet_qualite_redaction_criteres where bareme_version_id = p_version and actif;

    if abs(v_auto - 6) > 0.001 then
      v_blocages := v_blocages || jsonb_build_object('code', 'automatismes_incorrect',
        'message', format('Les automatismes totalisent %s points au lieu de 6.', v_auto));
    end if;
    if abs((v_raison + v_qualite) - 14) > 0.001 then
      v_blocages := v_blocages || jsonb_build_object('code', 'partie2_incorrecte',
        'message', format('La partie 2 totalise %s points (dont %s de qualite redactionnelle) au lieu de 14.',
          v_raison + v_qualite, v_qualite));
    end if;
    -- Le cas explicitement vise par le cahier des charges : 14 + 2 = 16.
    if abs(v_raison - 14) < 0.001 and v_qualite > 0.001 then
      v_blocages := v_blocages || jsonb_build_object('code', 'redaction_ajoutee_au_dessus',
        'message', format('Les %s points de qualite redactionnelle sont AJOUTES au-dessus des 14 : ils doivent y etre compris.', v_qualite));
    end if;
    if abs(v_qualite - 2) > 0.001 then
      v_avertis := v_avertis || jsonb_build_object('code', 'qualite_redaction_inhabituelle',
        'message', format('La qualite de la redaction vaut %s points ; la note de service annonce 2.', v_qualite));
    end if;

    v_total := v_auto + v_raison + v_qualite;
    if abs(v_total - 20) > 0.001 then
      v_blocages := v_blocages || jsonb_build_object('code', 'total_incorrect',
        'message', format('Le bareme totalise %s points au lieu de 20.', v_total));
    end if;

    for v_ligne in
      select item_key, numero from public.brevet_automatismes
      where bareme_version_id = p_version and btrim(reponse_attendue) = ''
      order by ordre
    loop
      v_blocages := v_blocages || jsonb_build_object('code', 'corrige_manquant',
        'question_key', v_ligne.item_key,
        'message', format('Automatisme %s : aucune reponse attendue.', v_ligne.numero));
    end loop;

    for v_ligne in
      select question_key, numero from public.bareme_questions
      where bareme_version_id = p_version and partie = 'raisonnement'
        and (reponse_attendue is null or btrim(reponse_attendue) = '')
      order by ordre
    loop
      v_blocages := v_blocages || jsonb_build_object('code', 'corrige_manquant',
        'question_key', v_ligne.question_key,
        'message', format('Question %s : aucun resultat attendu.', v_ligne.numero));
    end loop;

    -- Sans etape valorisable, les demarches non abouties ne pourraient pas
    -- etre prises en compte, ce que la note de service impose.
    for v_ligne in
      select question_key, numero from public.bareme_questions
      where bareme_version_id = p_version and partie = 'raisonnement'
        and jsonb_array_length(etapes) = 0
      order by ordre
    loop
      v_blocages := v_blocages || jsonb_build_object('code', 'etapes_manquantes',
        'question_key', v_ligne.question_key,
        'message', format('Question %s : aucune etape valorisable. Les essais et demarches engagees ne pourraient pas etre pris en compte.', v_ligne.numero));
    end loop;

    for v_ligne in
      select question_key, numero from public.bareme_questions
      where bareme_version_id = p_version and cardinality(depend_de) > 0 and regle_cascade is null
      order by ordre
    loop
      v_avertis := v_avertis || jsonb_build_object('code', 'regle_cascade_manquante',
        'question_key', v_ligne.question_key,
        'message', format('Question %s : dependance declaree sans regle de cascade.', v_ligne.numero));
    end loop;
  end if;

  -- ----- Communs aux deux matieres ------------------------------------
  for v_ligne in
    select question_key, numero from public.bareme_questions
    where bareme_version_id = p_version and cardinality(competences) = 0
    order by ordre
  loop
    v_blocages := v_blocages || jsonb_build_object('code', 'competence_manquante',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : aucune competence mobilisee declaree.', v_ligne.numero));
  end loop;

  for v_ligne in
    select q.question_key, q.numero, c as competence
    from public.bareme_questions q, unnest(q.competences) as c
    where q.bareme_version_id = p_version
      and not exists (select 1 from public.competence_referentiels r
                      where r.matiere = v_exam.matiere and r.code = c)
  loop
    v_blocages := v_blocages || jsonb_build_object('code', 'competence_inconnue',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : competence "%s" absente du referentiel %s.',
        v_ligne.numero, v_ligne.competence, v_exam.matiere));
  end loop;

  for v_ligne in
    select q.question_key, q.numero, d as cible
    from public.bareme_questions q, unnest(q.depend_de) as d
    where q.bareme_version_id = p_version
      and not exists (select 1 from public.bareme_questions q2
                      where q2.bareme_version_id = p_version and q2.question_key = d)
  loop
    v_blocages := v_blocages || jsonb_build_object('code', 'dependance_inconnue',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : depend de "%s", qui n''existe pas dans ce bareme.',
        v_ligne.numero, v_ligne.cible));
  end loop;

  for v_ligne in
    select q.question_key, q.numero, e as code
    from public.bareme_questions q, unnest(q.codes_erreurs) as e
    where q.bareme_version_id = p_version
      and not exists (select 1 from public.taxonomie_erreurs t
                      where t.matiere = v_exam.matiere and t.code = e)
  loop
    v_avertis := v_avertis || jsonb_build_object('code', 'code_erreur_inconnu',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : code d''erreur "%s" absent de la taxonomie %s.',
        v_ligne.numero, v_ligne.code, v_exam.matiere));
  end loop;

  if v_exam.corrige_texte is null or btrim(v_exam.corrige_texte) = '' then
    v_avertis := v_avertis || jsonb_build_object('code', 'corrige_examen_absent',
      'message', 'Aucun corrige n''est colle sur l''examen : le moteur s''appuiera davantage sur les regles generales.');
  end if;

  update public.bareme_versions
  set controles = jsonb_build_object(
        'ok', jsonb_array_length(v_blocages) = 0,
        'total_points', coalesce(v_total, 0),
        'blocages', v_blocages,
        'avertissements', v_avertis,
        'moteur', v_exam.matiere,
        'verifie_le', now())
  where id = p_version;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blocages) = 0,
    'version', v_version.version,
    'matiere', v_exam.matiere,
    'total_points', coalesce(v_total, 0),
    'max_score', v_version.max_score,
    'blocages', v_blocages,
    'avertissements', v_avertis
  );
end;
$$;

comment on function public.brevet_verifier(uuid) is
  'Controles bloquants d''un bareme de brevet. Refuse un total faux, une question sans corrige, une dictee sans regles, une seule grille de redaction, et les 2 points de redaction mathematique ajoutes au-dessus des 14.';


-- Le verrouillage d'un bareme de brevet rejoue brevet_verifier(), pas
-- bareme_verifier() : les controles ne sont pas les memes.
create or replace function public.brevet_verrouiller(p_version uuid, p_auteur text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb;
  v_exam  uuid;
begin
  v_check := public.brevet_verifier(p_version);
  if (v_check ->> 'ok')::boolean is not true then
    raise exception 'Bareme de brevet incomplet, verrouillage refuse : %', v_check ->> 'blocages';
  end if;

  select exam_id into v_exam from public.bareme_versions where id = p_version;

  update public.bareme_versions
  set statut = 'locked', verrouille_le = now(), verrouille_par = p_auteur
  where id = p_version;

  update public.exams
  set bareme_version_active = p_version,
      statut = case when statut in ('draft', 'calibrating', 'ready_for_validation', 'validated')
                    then 'locked' else statut end,
      maj_le = now()
  where id = v_exam;

  insert into public.bareme_audit (table_cible, ligne_id, action, auteur, apres)
  values ('bareme_versions', p_version::text, 'verrouillage_brevet', p_auteur, v_check);

  return v_check;
end;
$$;

commit;


-- =====================================================================
--  BLOC 10 - AIGUILLAGE DU MOTEUR
--
--  Une copie de brevet part vers SON moteur. Les copies du bac empruntent
--  exactement le meme chemin qu'avant : les deux branches existantes sont
--  reprises telles quelles.
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

  -- Les trois branches du baccalaureat sont reprises MOT POUR MOT du SQL 40 ;
  -- les deux du brevet s'ajoutent devant. Aucune copie du bac ne change de
  -- chemin.
  v_fonction := case
                  when v_moteur = 'brevet_francais'      then 'correct-brevet-francais'
                  when v_moteur = 'brevet_mathematiques' then 'correct-brevet-maths'
                  when v_moteur = 'bareme_sujet'         then 'correct-copy-bareme'
                  when v_moteur = 'criteres_rediges'     then 'correct-copy-redigee'
                  else 'correct-french-copy'
                end;

  perform private.invoke_pipeline_edge(v_fonction, new.correction_id);

  return new;
end;
$$;


-- Diagnostic : la branche du brevet s'ajoute AVANT celle du bareme par
-- sujet ; les deux branches du baccalaureat sont reprises MOT POUR MOT du
-- SQL 35, y compris la regle qui permet de corriger une copie ETALON avant
-- verrouillage.
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
  v_etalon     boolean;
  v_pret       boolean;
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

  -- --- Moteurs du BREVET (ajoutes par le SQL 42) ----------------------
  if v_correction.moteur in ('brevet_francais', 'brevet_mathematiques') then
    select * into v_exam from public.exams where id = v_correction.exam_id;
    if not found then
      return jsonb_build_object('ready', false, 'moteur', v_correction.moteur,
        'blocking_error', 'La copie se reclame d''un moteur du brevet mais n''est reliee a aucun examen.');
    end if;

    -- Le garde-fou : jamais une copie de brevet avec une grille de bac,
    -- jamais une matiere avec le moteur de l'autre.
    if v_exam.examen is distinct from 'DNB' then
      return jsonb_build_object('ready', false, 'moteur', v_correction.moteur,
        'blocking_error', format('L''examen rattache est de niveau %s, pas DNB.', v_exam.examen));
    end if;
    if v_exam.matiere <> v_correction.moteur then
      return jsonb_build_object('ready', false, 'moteur', v_correction.moteur,
        'blocking_error', format('L''examen porte la matiere %s alors que la copie se reclame du moteur %s.',
          v_exam.matiere, v_correction.moteur));
    end if;

    select * into v_version from public.bareme_versions
    where id = coalesce(v_correction.bareme_version_id, v_exam.bareme_version_active);

    v_etalon := coalesce(v_correction.est_etalon, false);

    -- Meme regle que pour le bac : une copie etalon sert a tester le bareme
    -- AVANT verrouillage, une copie d'eleve exige verrou + corrections ouvertes.
    v_pret :=
      v_fichier
      and v_version.id is not null
      and coalesce((v_version.controles ->> 'ok')::boolean, false)
      and (
        case when v_etalon
             then v_version.statut in ('draft', 'calibrating', 'ready_for_validation', 'validated', 'locked')
             else v_version.statut = 'locked' and v_exam.statut = 'correction_open'
        end
      );

    return jsonb_build_object(
      'ready', v_pret,
      'moteur', v_correction.moteur,
      'examen', v_exam.examen,
      'serie', v_exam.serie,
      'session', v_exam.session,
      'correction_id', v_correction.id,
      'status', v_correction.status,
      'processing_error', v_correction.processing_error,
      'file_exists', v_fichier,
      'exam_id', v_exam.id,
      'exam_statut', v_exam.statut,
      'bareme_version_id', v_version.id,
      'bareme_version', v_version.version,
      'bareme_statut', v_version.statut,
      'bareme_controles_ok', coalesce((v_version.controles ->> 'ok')::boolean, false),
      'est_etalon', v_etalon,
      'transcription_exists', exists (
        select 1 from public.copy_transcriptions where correction_id = p_correction_id),
      'result_exists', v_correction.result_json is not null
    );
  end if;

  -- --- Nouveau moteur : bareme propre au sujet ------------------------
  if v_correction.moteur = 'bareme_sujet' then
    select * into v_exam from public.exams where id = v_correction.exam_id;
    if not found then
      return jsonb_build_object('ready', false, 'moteur', 'bareme_sujet',
        'blocking_error', 'La correction se reclame du bareme par sujet mais n''est reliee a aucun examen.');
    end if;

    select * into v_version from public.bareme_versions
    where id = coalesce(v_correction.bareme_version_id, v_exam.bareme_version_active);

    v_etalon := coalesce(v_correction.est_etalon, false);

    -- Une copie etalon sert justement a tester le bareme AVANT verrouillage :
    -- exiger le verrou rendrait la calibration impossible. Une copie d'eleve,
    -- elle, exige verrou + corrections ouvertes, sans exception.
    v_pret :=
      v_fichier
      and v_version.id is not null
      and v_version.total_points = v_version.max_score
      and coalesce((v_version.controles ->> 'ok')::boolean, false)
      and (
        case when v_etalon
             then v_version.statut in ('draft', 'calibrating', 'ready_for_validation', 'validated', 'locked')
             else v_version.statut = 'locked' and v_exam.statut = 'correction_open'
        end
      );

    return jsonb_build_object(
      'ready', v_pret,
      'moteur', 'bareme_sujet',
      'correction_id', v_correction.id,
      'status', v_correction.status,
      'processing_error', v_correction.processing_error,
      'file_exists', v_fichier,
      'exam_id', v_exam.id,
      'exam_statut', v_exam.statut,
      'bareme_version_id', v_version.id,
      'bareme_version', v_version.version,
      'bareme_statut', v_version.statut,
      'bareme_total', v_version.total_points,
      'bareme_max', v_version.max_score,
      'bareme_controles_ok', coalesce((v_version.controles ->> 'ok')::boolean, false),
      'est_etalon', v_etalon,
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
commit;


-- =====================================================================
--  BLOC 11 - VERROUILLAGE DES NOUVELLES TABLES
--
--  RLS activee SANS AUCUNE POLICY = anon et authenticated ne peuvent ni
--  lire ni ecrire. Seuls le serveur de l'application et les Edge Functions
--  (service_role) y accedent. Aucune cle Claude ou Supabase ne descend
--  jamais cote client : les ecrans passent par /api/admin/brevet/*.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'brevet_parties',
    'brevet_reecriture_config', 'brevet_reecriture_items',
    'brevet_dictee_config', 'brevet_dictee_regles',
    'brevet_redaction_grilles', 'brevet_redaction_criteres',
    'brevet_automatismes', 'brevet_qualite_redaction_criteres',
    'correction_automatismes', 'correction_reecriture_formes',
    'correction_dictee_erreurs', 'correction_redaction',
    'correction_redaction_criteres', 'correction_qualite_redaction',
    'correction_document_qualite', 'correction_modifications_humaines',
    'sources_officielles', 'brevet_regles_officielles', 'brevet_parametres'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

revoke all on function public.brevet_verifier(uuid) from public, anon, authenticated;
revoke all on function public.brevet_verrouiller(uuid, text) from public, anon, authenticated;
grant execute on function public.brevet_verifier(uuid) to service_role;
grant execute on function public.brevet_verrouiller(uuid, text) to service_role;


-- =====================================================================
--  BLOC 12 - RETOUR ARRIERE (a decommenter seulement si necessaire)
--
--  A jouer uniquement tant qu'aucun examen DNB n'a de correction. Sinon,
--  passer les examens en statut 'archived' plutot que supprimer : le
--  principe du dispositif est qu'aucune donnee ne disparait.
-- =====================================================================
--
-- begin;
-- -- 1. Retablir l'aiguillage d'avant (deux moteurs).
-- create or replace function private.auto_launch_french_correction()
-- returns trigger language plpgsql security definer set search_path to '' as $rb$
-- declare v_requires_review boolean; v_moteur text; v_fonction text;
-- begin
--   v_requires_review := coalesce((new.transcription_json ->> 'requires_human_review')::boolean, false);
--   select moteur into v_moteur from public.corrections where id = new.correction_id;
--   if v_requires_review then
--     update public.corrections set status = 'transcription_review', updated_at = now()
--     where id = new.correction_id; return new;
--   end if;
--   update public.corrections set status = 'queued_correction', processing_error = null, updated_at = now()
--   where id = new.correction_id;
--   v_fonction := case when v_moteur = 'bareme_sujet' then 'correct-copy-bareme' else 'correct-french-copy' end;
--   perform private.invoke_pipeline_edge(v_fonction, new.correction_id);
--   return new;
-- end; $rb$;
--
-- -- 2. Supprimer les tables du brevet (aucune n'est partagee avec le bac).
-- drop table if exists public.correction_modifications_humaines cascade;
-- drop table if exists public.correction_document_qualite cascade;
-- drop table if exists public.correction_qualite_redaction cascade;
-- drop table if exists public.correction_redaction_criteres cascade;
-- drop table if exists public.correction_redaction cascade;
-- drop table if exists public.correction_dictee_erreurs cascade;
-- drop table if exists public.correction_reecriture_formes cascade;
-- drop table if exists public.correction_automatismes cascade;
-- drop table if exists public.brevet_qualite_redaction_criteres cascade;
-- drop table if exists public.brevet_automatismes cascade;
-- drop table if exists public.brevet_redaction_criteres cascade;
-- drop table if exists public.brevet_redaction_grilles cascade;
-- drop table if exists public.brevet_dictee_regles cascade;
-- drop table if exists public.brevet_dictee_config cascade;
-- drop table if exists public.brevet_reecriture_items cascade;
-- drop table if exists public.brevet_reecriture_config cascade;
-- drop table if exists public.brevet_parties cascade;
-- drop table if exists public.brevet_parametres cascade;
-- drop table if exists public.brevet_regles_officielles cascade;
-- drop table if exists public.sources_officielles cascade;
-- drop function if exists public.brevet_verrouiller(uuid, text);
-- drop function if exists public.brevet_verifier(uuid);
-- drop function if exists public.brevet_recalcule_parties() cascade;
-- drop function if exists public.modifications_append_only() cascade;
--
-- -- 3. Retrecir la contrainte de moteur (echoue s'il reste des copies DNB :
-- --    c'est voulu, on ne supprime pas de correction pour faire place nette).
-- alter table public.corrections drop constraint if exists corrections_moteur_valide;
-- alter table public.corrections add constraint corrections_moteur_valide
--   check (moteur in ('grille_generique', 'bareme_sujet', 'criteres_rediges'));
-- alter table public.corrections drop constraint if exists corrections_coherence_moteur;
-- alter table public.corrections add constraint corrections_coherence_moteur check (
--   (moteur = 'grille_generique' and subject_id is not null and rubric_id is not null)
--   or (moteur = 'bareme_sujet' and exam_id is not null)
--   or (moteur = 'criteres_rediges' and subject_id is not null and rubric_id is not null
--       and grille_id is not null));
-- commit;


-- =====================================================================
--  BLOC 13 - VERIFICATION
--  Attendu : 20 lignes "true / true".
-- =====================================================================

select t.nom as table_attendue,
       (to_regclass('public.' || t.nom) is not null) as existe,
       coalesce((select c.relrowsecurity from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = t.nom), false) as rls_active
from (values
  ('brevet_parties'), ('brevet_reecriture_config'), ('brevet_reecriture_items'),
  ('brevet_dictee_config'), ('brevet_dictee_regles'),
  ('brevet_redaction_grilles'), ('brevet_redaction_criteres'),
  ('brevet_automatismes'), ('brevet_qualite_redaction_criteres'),
  ('correction_automatismes'), ('correction_reecriture_formes'),
  ('correction_dictee_erreurs'), ('correction_redaction'),
  ('correction_redaction_criteres'), ('correction_qualite_redaction'),
  ('correction_document_qualite'), ('correction_modifications_humaines'),
  ('sources_officielles'), ('brevet_regles_officielles'), ('brevet_parametres')
) as t(nom)
order by t.nom;
