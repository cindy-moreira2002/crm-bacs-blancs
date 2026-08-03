-- =====================================================================
--  ACTIVER MATHS (a ne jouer QU'APRES validation prof)
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Genere par scripts/activer-matiere.mjs a partir de ce qui est
--  reellement en base. Tant que tout est en draft :
--    - les sujets n'apparaissent pas dans le menu "Deposer une copie" ;
--    - generate-dossier refuse de produire le dossier eleve.
--
--  Les etalons de cette matiere sont SYNTHETIQUES tant qu'un professeur
--  n'a pas fourni de vraies copies notees : la note reste approximative.
--
--  Idempotent, 100% ASCII.
-- =====================================================================


-- =====================================================================
--  BLOC A - VOIE GENERALE : 4 grille(s), 9 sujet(s), 4 gabarit(s)
--  Retirer de la liste des sujets ceux que les professeurs n'ont pas valides.
-- =====================================================================

begin;

update public.rubrics set status = 'active'
where matiere = 'maths' and track = 'generale'
  and exercise_type in ('maths_analyse', 'maths_probabilites', 'maths_geometrie_espace', 'maths_qcm_justifie');

update public.subject_cards set status = 'active'
where matiere = 'maths' and track = 'generale'
  and id in ('MA2027_ANA_01', 'MA2027_ANA_02', 'MA2027_ANA_03', 'MA2027_GEO_01', 'MA2027_GEO_02', 'MA2027_PROBA_01', 'MA2027_PROBA_02', 'MA2027_QCM_01', 'MA2027_QCM_02');

update public.dossier_templates set status = 'active'
where matiere = 'maths' and track = 'generale'
  and exercise_type in ('maths_analyse', 'maths_probabilites', 'maths_geometrie_espace', 'maths_qcm_justifie');

commit;


-- =====================================================================
--  BLOC B - VERIFICATION
--  Attendu : chaque sujet actif a une grille active ET un gabarit eleve
--  actif de meme matiere + track + exercise_type. Sinon le sujet reste
--  bloque au depot, ou l'eleve ne recoit aucun dossier.
-- =====================================================================

select s.id as sujet, s.status as statut_sujet, r.id as grille, r.status as statut_grille,
       t.id as gabarit, t.status as statut_gabarit
from public.subject_cards s
left join public.rubrics r
  on r.matiere = s.matiere and r.track = s.track and r.exercise_type = s.exercise_type
left join public.dossier_templates t
  on t.matiere = s.matiere and t.track = s.track and t.exercise_type = s.exercise_type
 and t.audience = 'eleve'
where s.matiere = 'maths'
order by s.id;


-- =====================================================================
--  POUR REVENIR EN ARRIERE
-- =====================================================================
-- update public.rubrics           set status = 'draft' where matiere = 'maths';
-- update public.subject_cards     set status = 'draft' where matiere = 'maths';
-- update public.dossier_templates set status = 'draft' where matiere = 'maths';
