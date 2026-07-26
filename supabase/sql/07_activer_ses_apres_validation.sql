-- =====================================================================
--  ACTIVER SES APRES VALIDATION PEDAGOGIQUE
--
--  A lancer uniquement quand les grilles, sujets, etalons et gabarits SES
--  ont ete relus et valides. L'application ne liste que les sujets et
--  grilles avec status='active'.
--
--  Attendu apres execution :
--  - 36 subject_cards SES actifs
--  - 4 rubrics SES actives
--  - 4 dossier_templates SES actifs
--  - 180 benchmark_cards SES utilisables via validation_status='candidate'
-- =====================================================================

begin;

update public.rubrics
set status = 'active'
where matiere = 'ses'
  and id in (
    'SES_DISSERTATION_V1',
    'SES_EC1_V1',
    'SES_EC2_V1',
    'SES_EC3_V1'
  );

update public.subject_cards
set status = 'active'
where matiere = 'ses';

update public.dossier_templates
set status = 'active'
where matiere = 'ses'
  and audience = 'eleve';

commit;

select 'rubrics' as table_name, count(*) as active_count
from public.rubrics
where matiere = 'ses' and status = 'active'
union all
select 'subject_cards', count(*)
from public.subject_cards
where matiere = 'ses' and status = 'active'
union all
select 'dossier_templates', count(*)
from public.dossier_templates
where matiere = 'ses' and audience = 'eleve' and status = 'active'
union all
select 'usable_benchmarks', count(*)
from public.benchmark_cards bc
join public.subject_cards sc on sc.id = bc.subject_id
where sc.matiere = 'ses'
  and bc.validation_status in ('validated', 'candidate');

