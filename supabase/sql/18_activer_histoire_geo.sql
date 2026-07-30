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
--  La grille technologique reste en draft : aucun sujet ne s'y rattache.
-- =====================================================================

begin;

update public.rubrics set status = 'active'
where matiere = 'histoire-geo'
  and exercise_type in ('hg_question_problematisee', 'hg_analyse_document', 'hg_croquis');

commit;


-- =====================================================================
--  BLOC B - LES 5 SUJETS
--  Retirer de la liste ceux que les professeurs n'ont pas valides.
-- =====================================================================

begin;

update public.subject_cards set status = 'active'
where matiere = 'histoire-geo'
  and id in ('HG2027_QP_01', 'HG2027_QP_02', 'HG2027_QP_03', 'HG2027_DOC_01', 'HG2027_CROQUIS_01');

commit;


-- =====================================================================
--  BLOC C - LES 3 GABARITS DE DOSSIER ELEVE
--  Sans ce bloc, la correction aboutit mais l'eleve ne recoit rien.
-- =====================================================================

begin;

update public.dossier_templates set status = 'active'
where matiere = 'histoire-geo'
  and exercise_type in ('hg_question_problematisee', 'hg_analyse_document', 'hg_croquis');

commit;


-- =====================================================================
--  BLOC D - VERIFICATION
--  Attendu : 3 grilles actives, 5 sujets actifs, 3 gabarits actifs,
--  et chaque sujet actif doit avoir une grille active de meme
--  track + matiere + exercise_type, sinon le depot restera bloque.
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
