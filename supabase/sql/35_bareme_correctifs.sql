-- =====================================================================
--  CORRECTIFS DU BAREME PAR SUJET
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  Prerequis : supabase/sql/33_bareme_par_sujet.sql.
--  Deja applique par API le 2026-08-07. Idempotent.
--
--  1. exams.consignes_correcteur : consignes propres a CET examen, remises
--     au correcteur en plus du bareme (ex. "l'exercice 3 admet la methode
--     matricielle, non vue en cours mais valide").
--  2. pipeline_diagnostic : une copie ETALON doit pouvoir etre corrigee
--     AVANT verrouillage — c'est tout l'objet de la calibration. La regle
--     du verrou ne vaut donc que pour les copies d'eleves.
--  3. Vue de suivi des versions par lot, pour reponder d'un coup d'oeil a
--     "toutes les copies de ce lot ont-elles la meme version ?".
-- =====================================================================

begin;

alter table public.exams
  add column if not exists consignes_correcteur text;

comment on column public.exams.consignes_correcteur is
  'Consignes propres a cet examen, ajoutees au dossier remis au correcteur. Ne remplace jamais le bareme.';

commit;


-- =====================================================================
--  BLOC 2 - DIAGNOSTIC : le verrou ne s'impose qu'aux copies d'eleves
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
--  BLOC 3 - EQUITE ENTRE ELEVES : les versions employees par examen
--
--  Une ligne par (examen, version). Plusieurs lignes pour un meme examen
--  = plusieurs versions dans le meme lot : a regarder de pres.
-- =====================================================================

create or replace view public.vue_versions_par_examen as
select
  e.id           as exam_id,
  e.code         as exam_code,
  e.matiere,
  e.statut       as exam_statut,
  c.bareme_version_id,
  v.version,
  v.statut       as bareme_statut,
  count(*)                                                  as copies,
  count(*) filter (where c.human_review_required)           as en_relecture,
  min(c.created_at)                                         as premiere_copie,
  max(c.created_at)                                         as derniere_copie
from public.corrections c
join public.exams e on e.id = c.exam_id
left join public.bareme_versions v on v.id = c.bareme_version_id
where c.moteur = 'bareme_sujet'
group by e.id, e.code, e.matiere, e.statut, c.bareme_version_id, v.version, v.statut;

revoke all on public.vue_versions_par_examen from anon, authenticated;


-- =====================================================================
--  BLOC 4 - VERIFICATION
-- =====================================================================

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'exams'
  and column_name = 'consignes_correcteur';

select count(*) as vues from information_schema.views
where table_schema = 'public' and table_name = 'vue_versions_par_examen';
