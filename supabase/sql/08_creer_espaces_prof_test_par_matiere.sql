-- =====================================================================
--  CREER DES ESPACES PROF DE TEST PAR MATIERE
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj
--       PAS le projet pipeline xgdaibekjmtffvkwvcge.
--
--  A lancer dans Supabase SQL Editor du CRM pour faire apparaitre les
--  blocs "Bac blanc - [matiere]" dans /espace-prof.
--
--  Important : il n'existe pas encore de table "professeurs" dans
--  l'application. L'espace prof est construit a partir des eleves
--  inscrits, regroupes par matiere. Ce bloc cree donc une inscription
--  de test par matiere, de facon idempotente.
--
--  Attendu :
--  - 5 lignes de test au total
--  - une ligne par matiere : Francais, Philosophie, Mathematiques,
--    Histoire-Geo, SES
-- =====================================================================

do $$
begin
  if to_regclass('public.inscriptions') is null then
    raise exception 'STOP: table public.inscriptions absente. Tu es probablement dans le projet pipeline. Ouvre le projet CRM orpbfnmdlvxmkvyrpvtj, puis relance ce bloc.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inscriptions'
      and column_name = 'date_epreuve'
  ) then
    insert into public.inscriptions
      (nom, email, email_parent, telephone, matiere, date_epreuve)
    select v.nom, v.email, v.email_parent, v.telephone, v.matiere, v.date_epreuve
    from (
      values
        (
          'Eleve Test Francais',
          'test-francais-espace-prof@matineesdubac.local',
          'parent-test-francais@matineesdubac.local',
          '0600000001',
          convert_from(decode('4672616ec3a7616973', 'hex'), 'UTF8'),
          date '2026-09-06'
        ),
        (
          'Eleve Test Mathematiques',
          'test-mathematiques-espace-prof@matineesdubac.local',
          'parent-test-mathematiques@matineesdubac.local',
          '0600000002',
          convert_from(decode('4d617468c3a96d61746971756573', 'hex'), 'UTF8'),
          date '2026-09-13'
        ),
        (
          'Eleve Test Philosophie',
          'test-philosophie-espace-prof@matineesdubac.local',
          'parent-test-philosophie@matineesdubac.local',
          '0600000003',
          'Philosophie',
          date '2026-09-20'
        ),
        (
          'Eleve Test Histoire Geo',
          'test-histoire-geo-espace-prof@matineesdubac.local',
          'parent-test-histoire-geo@matineesdubac.local',
          '0600000004',
          convert_from(decode('486973746f6972652d47c3a96f', 'hex'), 'UTF8'),
          date '2026-09-27'
        ),
        (
          'Eleve Test SES',
          'test-ses-espace-prof@matineesdubac.local',
          'parent-test-ses@matineesdubac.local',
          '0600000005',
          'SES',
          date '2026-10-04'
        )
    ) as v(nom, email, email_parent, telephone, matiere, date_epreuve)
    where not exists (
      select 1
      from public.inscriptions i
      where i.email = v.email
        and i.matiere = v.matiere
    );
  else
    insert into public.inscriptions
      (nom, email, email_parent, telephone, matiere)
    select v.nom, v.email, v.email_parent, v.telephone, v.matiere
    from (
      values
        (
          'Eleve Test Francais',
          'test-francais-espace-prof@matineesdubac.local',
          'parent-test-francais@matineesdubac.local',
          '0600000001',
          convert_from(decode('4672616ec3a7616973', 'hex'), 'UTF8')
        ),
        (
          'Eleve Test Mathematiques',
          'test-mathematiques-espace-prof@matineesdubac.local',
          'parent-test-mathematiques@matineesdubac.local',
          '0600000002',
          convert_from(decode('4d617468c3a96d61746971756573', 'hex'), 'UTF8')
        ),
        (
          'Eleve Test Philosophie',
          'test-philosophie-espace-prof@matineesdubac.local',
          'parent-test-philosophie@matineesdubac.local',
          '0600000003',
          'Philosophie'
        ),
        (
          'Eleve Test Histoire Geo',
          'test-histoire-geo-espace-prof@matineesdubac.local',
          'parent-test-histoire-geo@matineesdubac.local',
          '0600000004',
          convert_from(decode('486973746f6972652d47c3a96f', 'hex'), 'UTF8')
        ),
        (
          'Eleve Test SES',
          'test-ses-espace-prof@matineesdubac.local',
          'parent-test-ses@matineesdubac.local',
          '0600000005',
          'SES'
        )
    ) as v(nom, email, email_parent, telephone, matiere)
    where not exists (
      select 1
      from public.inscriptions i
      where i.email = v.email
        and i.matiere = v.matiere
    );
  end if;
end $$;

select matiere, count(*) as inscriptions_test
from public.inscriptions
where email in (
  'test-francais-espace-prof@matineesdubac.local',
  'test-mathematiques-espace-prof@matineesdubac.local',
  'test-philosophie-espace-prof@matineesdubac.local',
  'test-histoire-geo-espace-prof@matineesdubac.local',
  'test-ses-espace-prof@matineesdubac.local'
)
group by matiere
order by matiere;
