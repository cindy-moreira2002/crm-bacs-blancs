-- =====================================================================
--  ACTIVER L'HISTOIRE-GEOGRAPHIE (a ne jouer QU'APRES validation prof)
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Ce fichier n'a PAS ete joue. Il attend la relecture des baremes par des
--  professeurs d'histoire-geographie (dossier /relecture/histoire-geo).
--
--  Tant que tout est en 'draft' :
--    - les sujets n'apparaissent pas dans le menu "Deposer une copie"
--      (/api/pipeline/sujets ne liste que status='active') ;
--    - generate-dossier refuse de produire le dossier eleve
--      ("Aucun template de dossier actif ne correspond") car il exige
--      dossier_templates.status='active'.
--  Les corrections elles-memes, en revanche, ne regardent pas le statut :
--  une correction lancee a la main sur un sujet en draft fonctionne.
--
--  Idempotent, 100% ASCII.
-- =====================================================================


-- =====================================================================
--  BLOC A - LES 3 GRILLES DE LA VOIE GENERALE
-- =====================================================================

begin;

update public.rubrics set status = 'active'
where matiere = 'histoire-geo'
  and exercise_type in ('hg_question_problematisee', 'hg_analyse_document', 'hg_croquis');

commit;


-- =====================================================================
--  BLOC B - LES 5 SUJETS DE LA VOIE GENERALE
--  Retirer de la liste ceux que les professeurs n'ont pas valides.
-- =====================================================================

begin;

update public.subject_cards set status = 'active'
where matiere = 'histoire-geo'
  and id in ('HG2027_QP_01', 'HG2027_QP_02', 'HG2027_QP_03', 'HG2027_DOC_01', 'HG2027_CROQUIS_01');

commit;


-- =====================================================================
--  BLOC C - LES 3 GABARITS DE DOSSIER ELEVE, VOIE GENERALE
--  Sans ce bloc, la correction aboutit mais l'eleve ne recoit rien.
-- =====================================================================

begin;

update public.dossier_templates set status = 'active'
where matiere = 'histoire-geo'
  and exercise_type in ('hg_question_problematisee', 'hg_analyse_document', 'hg_croquis');

commit;


-- =====================================================================
--  BLOC C bis - LA VOIE TECHNOLOGIQUE (grille + 2 sujets + gabarit)
--
--  A JOUER SEULEMENT si un professeur de la voie technologique a valide
--  les themes et les questions : le dossier source ne contenait aucun
--  sujet technologique, les deux fiches ont ete ecrites par Les Matinees
--  du Bac. C'est la partie la moins etayee de la matiere.
-- =====================================================================

begin;

update public.rubrics set status = 'active'
where matiere = 'histoire-geo' and exercise_type = 'hg_tech_questions';

update public.subject_cards set status = 'active'
where matiere = 'histoire-geo' and id in ('HG2027_TECHQ_01', 'HG2027_TECHQ_02');

update public.dossier_templates set status = 'active'
where matiere = 'histoire-geo' and exercise_type = 'hg_tech_questions';

commit;


-- =====================================================================
--  BLOC D - VERIFICATION
--  Attendu : chaque sujet actif doit avoir une grille active ET un gabarit
--  actif de meme track + matiere + exercise_type. Un sujet actif sans grille
--  active reste bloque au depot ; sans gabarit actif, l'eleve ne recoit rien.
-- =====================================================================

select s.id as sujet, s.status as statut_sujet, r.id as grille, r.status as statut_grille,
       t.id as gabarit, t.status as statut_gabarit
from public.subject_cards s
left join public.rubrics r
  on r.matiere = s.matiere and r.track = s.track and r.exercise_type = s.exercise_type
left join public.dossier_templates t
  on t.matiere = s.matiere and t.track = s.track and t.exercise_type = s.exercise_type
 and t.audience = 'eleve'
where s.matiere = 'histoire-geo'
order by s.id;


-- =====================================================================
--  POUR REVENIR EN ARRIERE
-- =====================================================================
-- update public.rubrics           set status = 'draft' where matiere = 'histoire-geo';
-- update public.subject_cards     set status = 'draft' where matiere = 'histoire-geo';
-- update public.dossier_templates set status = 'draft' where matiere = 'histoire-geo';
