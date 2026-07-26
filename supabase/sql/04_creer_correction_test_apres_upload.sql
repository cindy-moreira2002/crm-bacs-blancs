-- À exécuter seulement APRÈS avoir téléversé une copie à ce chemin :
-- bucket : student-copies
-- chemin : 2027/francais/commentaire/TEST-001/copie_test.pdf

insert into public.corrections (
  pseudonymous_student_id,
  track,
  exercise_type,
  subject_id,
  rubric_id,
  original_storage_path,
  status
)
values (
  'TEST-001',
  'generale',
  'commentaire',
  'FR-COM-2025-ENSORCELEE',
  'fr_commentaire_general_v1',
  '2027/francais/commentaire/TEST-001/copie_test.pdf',
  'uploaded'
)
returning id, status, original_storage_path;
