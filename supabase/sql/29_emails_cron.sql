-- =====================================================================
--  E-MAILS AUTOMATIQUES — LE PLANIFICATEUR (pg_cron + pg_net)
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj (SQL Editor).
--  QUAND : apres 28_emails_brevo.sql, et apres avoir pose les variables
--          d'environnement sur Vercel (sinon la route repond 503).
--
--  Ce script fait tourner le moteur d'envoi toutes les 5 minutes, cote
--  serveur, sans dependre de personne : ni d'un navigateur ouvert, ni
--  d'un compte Google, ni d'une conversation Claude.
--
--  ⚠️  DEUX VALEURS A REMPLACER AVANT DE COLLER (voir ci-dessous) :
--        __URL_DU_SITE__   et   __SECRET_CRON__
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LES DEUX EXTENSIONS
--    pg_cron = l'horloge.  pg_net = le telephone (appels HTTP sortants).
--    Si une erreur de droits apparait ici, active-les en deux clics :
--    Supabase > Database > Extensions > chercher "pg_cron" puis "pg_net".
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 2. LA TACHE — toutes les 5 minutes
--
--    Remplace :
--      __URL_DU_SITE__  par  https://espaces.matineesdubac.fr
--      __SECRET_CRON__  par  la valeur EXACTE que tu as mise dans la
--                            variable Vercel EMAILS_CRON_SECRET
--
--    Le secret reste dans TA base (il n'est jamais dans le code ni sur
--    GitHub). La route refuse tout appel qui ne le presente pas.
-- ---------------------------------------------------------------------
select cron.unschedule('emails-moteur')
where exists (select 1 from cron.job where jobname = 'emails-moteur');

select cron.schedule(
  'emails-moteur',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url     := '__URL_DU_SITE__/api/emails/cron',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-emails-cron-secret', '__SECRET_CRON__'
               ),
    body    := jsonb_build_object('origine', 'pg_cron'),
    timeout_milliseconds := 60000
  );
  $job$
);

-- ---------------------------------------------------------------------
-- VERIFICATION
-- ---------------------------------------------------------------------
select jobid, jobname, schedule, active from cron.job where jobname = 'emails-moteur';

-- Apres 5 a 10 minutes, pour voir si l'appel passe :
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'emails-moteur')
--   order by start_time desc limit 5;
--
-- Et la reponse HTTP recue (200 = tout va bien) :
--   select id, status_code, content::text
--   from net._http_response order by created desc limit 5;

-- ---------------------------------------------------------------------
-- POUR ARRETER LE SYSTEME (si besoin un jour)
--   select cron.unschedule('emails-moteur');
-- Aucune donnee n'est perdue : les e-mails restent simplement en attente.
-- ---------------------------------------------------------------------
