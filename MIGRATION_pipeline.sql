-- =====================================================================
--  BRANCHEMENT DU PIPELINE DE CORRECTION SUR L'INTERFACE MATINEES DU BAC
--
--  OU  : Supabase, projet "matineesdubac"  ->  xgdaibekjmtffvkwvcge
--        (PAS le projet du CRM orpbfnmdlvxmkvyrpvtj)
--  QUOI: SQL Editor  >  New query  >  coller UN BLOC  >  Run
--
--  A JOUER BLOC PAR BLOC, DANS L'ORDRE. Chaque bloc est rejouable
--  sans risque (idempotent). Apres chaque bloc, lire le resultat.
--
--  100% ASCII VOLONTAIRE : l'editeur SQL de Supabase abime les accents
--  colles depuis un Mac. Aucun accent ici, donc aucun risque.
-- =====================================================================


-- =====================================================================
--  BLOC 0 - DIAGNOSTIC (ne modifie rien, on regarde seulement)
--  Attendu : 2 lignes dans le 1er tableau (launch_french_pipeline et
--  invoke_pipeline_edge), et 8 lignes "true" dans le 2e (tables presentes).
--  Si le 1er tableau est vide ou incomplet -> STOP, previens-moi.
-- =====================================================================

select
  n.nspname   as schema,
  p.proname   as fonction,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('launch_french_pipeline', 'invoke_pipeline_edge',
                    'crm_lancer_correction', 'crm_generer_dossier')
order by n.nspname, p.proname;

select t.nom as table_attendue,
       (to_regclass('public.' || t.nom) is not null) as existe
from (values
  ('corrections'), ('copy_transcriptions'), ('dossiers'),
  ('subject_cards'), ('benchmark_cards'), ('rubrics'),
  ('dossier_templates'), ('error_taxonomy')
) as t(nom)
order by t.nom;


-- =====================================================================
--  BLOC 1 - IDENTITE DE L'ELEVE PORTEE PAR LA CORRECTION
--
--  Pourquoi : generate-dossier lit deja correction.student_name pour
--  tutoyer l'eleve. teacher_email sert a prevenir le prof, matiere
--  sert a choisir le bon modele de dossier, source dit d'ou vient la copie.
--  Attendu : "Success. No rows returned", puis 5 lignes de verification.
-- =====================================================================

begin;

alter table public.corrections
  add column if not exists student_name  text,
  add column if not exists student_email text,
  add column if not exists teacher_email text,
  add column if not exists matiere       text,
  add column if not exists source        text;

create index if not exists corrections_student_email_idx
  on public.corrections (student_email);

create index if not exists corrections_teacher_email_idx
  on public.corrections (teacher_email);

commit;

-- verification du BLOC 1 : doit renvoyer 5 lignes
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name  = 'corrections'
  and column_name in ('student_name','student_email','teacher_email','matiere','source')
order by column_name;


-- =====================================================================
--  BLOC 2 - LES DEUX POINTS D'ENTREE DE L'APPLICATION
--
--  Pourquoi : l'app appelle ces deux noms exacts, et rien d'autre.
--  Ils delegent au moteur deja prouve. Si un jour le moteur change de
--  nom, on ne modifie que ces deux fonctions, pas l'application.
--
--  security definer + droits reserves a service_role : meme si
--  quelqu'un recuperait la cle publique du navigateur, il ne pourrait
--  pas declencher une correction.
--  Attendu : "Success. No rows returned", puis 2 lignes de verification.
-- =====================================================================

begin;

-- 1) lance la chaine complete : transcription puis correction
create or replace function public.crm_lancer_correction(p_correction_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
begin
  perform public.launch_french_pipeline(p_correction_id);
end;
$$;

-- 2) fabrique le dossier de l'eleve (la copie doit deja etre corrigee)
create or replace function public.crm_generer_dossier(p_correction_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
begin
  perform private.invoke_pipeline_edge('generate-dossier', p_correction_id);
end;
$$;

-- personne d'autre que le serveur de l'app ne peut les appeler
revoke all on function public.crm_lancer_correction(uuid) from public;
revoke all on function public.crm_generer_dossier(uuid)  from public;
revoke all on function public.crm_lancer_correction(uuid) from anon, authenticated;
revoke all on function public.crm_generer_dossier(uuid)  from anon, authenticated;

grant execute on function public.crm_lancer_correction(uuid) to service_role;
grant execute on function public.crm_generer_dossier(uuid)  to service_role;

commit;

-- verification du BLOC 2 : doit renvoyer exactement 2 lignes
select p.proname as fonction,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('crm_lancer_correction','crm_generer_dossier')
order by p.proname;


-- =====================================================================
--  BLOC 3 - VERROUILLAGE DES TABLES (le point important)
--
--  RLS activee SANS AUCUNE POLICY = anon et authenticated ne peuvent
--  ni lire ni ecrire ces tables. Autrement dit : meme en bidouillant
--  la console du navigateur, un prof ne peut rien toucher.
--
--  Ce qui continue de marcher :
--    - le serveur de l'application (cle service_role) : passe outre RLS
--    - les 3 Edge Functions (elles utilisent aussi service_role)
--    - les triggers internes de la base
--    - toi, dans le SQL Editor
--
--  La boucle ne verrouille que les tables qui existent vraiment.
--  Attendu : "Success. No rows returned", puis 8 lignes rls_active = true.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'corrections', 'copy_transcriptions', 'dossiers',
    'subject_cards', 'benchmark_cards', 'rubrics',
    'dossier_templates', 'error_taxonomy'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      raise notice 'RLS activee sur %', t;
    else
      raise notice 'table % absente, ignoree', t;
    end if;
  end loop;
end
$$;

-- verification du BLOC 3 : rls_active doit valoir true partout
select c.relname as nom_table, c.relrowsecurity as rls_active
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('corrections','copy_transcriptions','dossiers',
                    'subject_cards','benchmark_cards','rubrics',
                    'dossier_templates','error_taxonomy')
order by c.relname;


-- =====================================================================
--  BLOC 4 - TEST A BLANC DES POINTS D'ENTREE (optionnel mais conseille)
--
--  On refabrique le dossier d'une copie DEJA corrigee. Si ca marche,
--  le cablage app -> base -> moteur est bon, sans deposer de copie.
--
--  4a) trouver une copie deja corrigee : copie son id (colonne id)
-- =====================================================================

select id, status, subject_id, created_at
from public.corrections
where result_json is not null
order by created_at desc
limit 5;

--  4b) coller l'id a la place de METS_L_ID_ICI, puis Run.
--      Attendu : "Success. No rows returned" (l'appel est asynchrone).
--
-- select public.crm_generer_dossier('METS_L_ID_ICI'::uuid);

--  4c) 30 a 60 secondes plus tard, verifier qu'un dossier de plus existe.
--      Attendu : une ligne dont created_at est d'il y a moins d'une minute.
--
-- select id, correction_id, created_at, length(content) as taille
-- from public.dossiers
-- where correction_id = 'METS_L_ID_ICI'::uuid
-- order by created_at desc;
