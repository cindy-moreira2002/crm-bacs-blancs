-- =====================================================================
--  UNE COPIE CORRIGEE PAR BAREME N'A PAS BESOIN D'UNE GRILLE GENERIQUE
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  Prerequis : 33_bareme_par_sujet.sql, 35_bareme_correctifs.sql.
--  Deja applique par API le 2026-08-07. Idempotent.
--
--  corrections.subject_id et corrections.rubric_id etaient NOT NULL :
--  c'etait juste, tant que la note venait d'une grille generique posee sur
--  une fiche sujet. Avec le bareme propre au sujet, la note vient de
--  exams + bareme_versions, et la grille generique ne sert plus qu'au
--  contexte disciplinaire.
--
--  On ne supprime donc PAS la contrainte : on la rend conditionnelle.
--    moteur = 'grille_generique' -> subject_id ET rubric_id obligatoires
--                                   (l'ancien monde ne bouge pas d'un pouce) ;
--    moteur = 'bareme_sujet'     -> exam_id obligatoire a la place.
-- =====================================================================

begin;

alter table public.corrections alter column subject_id drop not null;
alter table public.corrections alter column rubric_id  drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'corrections_coherence_moteur') then
    alter table public.corrections
      add constraint corrections_coherence_moteur check (
        (moteur = 'grille_generique' and subject_id is not null and rubric_id is not null)
        or
        (moteur = 'bareme_sujet' and exam_id is not null)
      );
  end if;
end
$$;

comment on constraint corrections_coherence_moteur on public.corrections is
  'Chaque moteur exige ce dont il a besoin, et rien de plus : la grille generique sa fiche sujet et sa grille, le bareme par sujet son examen.';

commit;


-- =====================================================================
--  VERIFICATION
--  Attendu : les 16 corrections existantes passent toutes la contrainte
--  (elles sont en 'grille_generique' et ont bien subject_id + rubric_id).
-- =====================================================================

select moteur,
       count(*) as copies,
       count(*) filter (where subject_id is null) as sans_sujet,
       count(*) filter (where rubric_id is null)  as sans_grille,
       count(*) filter (where exam_id is null)    as sans_examen
from public.corrections
group by moteur
order by moteur;
