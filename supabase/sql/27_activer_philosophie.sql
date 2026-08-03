-- =====================================================================
--  ACTIVER PHILOSOPHIE (a ne jouer QU'APRES validation prof)
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
--  BLOC A - VOIE GENERALE : 2 grille(s), 6 sujet(s), 2 gabarit(s)
--  Retirer de la liste des sujets ceux que les professeurs n'ont pas valides.
-- =====================================================================

begin;

update public.rubrics set status = 'active'
where matiere = 'philosophie' and track = 'generale'
  and exercise_type in ('philo_dissertation', 'philo_explication_texte');

update public.subject_cards set status = 'active'
where matiere = 'philosophie' and track = 'generale'
  and id in ('PHI2027_DISS_01', 'PHI2027_DISS_02', 'PHI2027_DISS_03', 'PHI2027_EXPL_01', 'PHI2027_EXPL_02', 'PHI2027_EXPL_03');

update public.dossier_templates set status = 'active'
where matiere = 'philosophie' and track = 'generale'
  and exercise_type in ('philo_dissertation', 'philo_explication_texte');

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
where s.matiere = 'philosophie'
order by s.id;


-- =====================================================================
--  POUR REVENIR EN ARRIERE
-- =====================================================================
-- update public.rubrics           set status = 'draft' where matiere = 'philosophie';
-- update public.subject_cards     set status = 'draft' where matiere = 'philosophie';
-- update public.dossier_templates set status = 'draft' where matiere = 'philosophie';
