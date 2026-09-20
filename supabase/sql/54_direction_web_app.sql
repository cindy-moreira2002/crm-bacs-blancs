-- 54 — L'espace Direction devient une application de téléphone
--
-- Deux besoins nouveaux, et deux tables :
--
--   1. l'espace direction n'est plus la deuxième vue de l'espace prof de
--      Cindy : c'est un espace à part (/direction), que PLUSIEURS personnes
--      partagent, chacune avec son propre compte. Ce script ne crée donc
--      aucune notion nouvelle de droits — il réutilise `professeurs.role` :
--      `role = 'admin'` = membre de la direction. Ce qu'il faut faire pour
--      Maël est écrit tout en bas ;
--
--   2. l'application installée sur le téléphone doit pouvoir sonner quand un
--      e-mail attend une validation. D'où :
--        • `direction_abonnements_push` — un téléphone (ou un ordinateur)
--          abonné aux notifications, rattaché à la personne qui l'a activé ;
--        • `direction_veille` — le repère de la dernière visite du cron. Sans
--          lui, chaque passage (toutes les 5 minutes) renverrait la même
--          notification à l'infini.
--
-- Rejouable sans risque : rien n'est effacé, tout est `if not exists`.

-- --- Garde-fou : on doit être dans le projet CRM ----------------------

do $$
begin
  if to_regclass('public.professeurs') is null then
    raise exception 'STOP: table public.professeurs absente. Tu es probablement dans le projet pipeline. Ouvre le projet CRM (celui des inscriptions), puis relance ce script.';
  end if;
end $$;

-- --- 1. Les appareils abonnés aux notifications -----------------------
--
-- `endpoint` est l'adresse que fournit Apple ou Google pour CE navigateur-là.
-- Elle est unique : réinstaller l'application remplace la ligne au lieu d'en
-- créer une deuxième, sinon la même personne recevrait la notification deux
-- fois sur le même téléphone.
--
-- La suppression suit le compte : retirer quelqu'un de la direction, c'est
-- supprimer sa ligne dans `professeurs`, et ses téléphones cessent de sonner.

create table if not exists public.direction_abonnements_push (
  id            uuid primary key default gen_random_uuid(),
  professeur_id uuid not null references public.professeurs(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  appareil      text,
  vu_le         timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_abonnements_push_prof
  on public.direction_abonnements_push (professeur_id);

-- --- 2. Le repère de la veille ----------------------------------------
--
-- Une seule ligne (`cle = 'compteurs'`), qui contient les chiffres du dernier
-- passage. On ne notifie que ce qui a AUGMENTÉ depuis.

create table if not exists public.direction_veille (
  cle           text primary key,
  valeur        jsonb not null default '{}'::jsonb,
  mis_a_jour_le timestamptz not null default now()
);

-- --- 3. Fermé à double tour -------------------------------------------
--
-- RLS actif SANS policy : la clé anon (celle du navigateur) ne peut rien lire
-- ni écrire. Tout passe par les routes serveur, en service_role. C'est la
-- règle de tout le projet — voir professeurs, session_coachs, revenus_prof.

alter table public.direction_abonnements_push enable row level security;
alter table public.direction_veille          enable row level security;

-- --- 4. À FAIRE À LA MAIN : ouvrir la direction à Maël -----------------
--
-- Le compte de Maël doit d'abord EXISTER (console Profs & accès →
-- « Ajouter un professeur », ou le formulaire de candidature). Une fois qu'il
-- est créé, retirer les deux tirets de la ligne ci-dessous, remplacer
-- l'adresse par la sienne, et exécuter :
--
-- update public.professeurs set role = 'admin' where lower(email) = lower('adresse-de-mael@exemple.fr');
--
-- Pour vérifier qui a accès à la direction, à tout moment :
--
--   select prenom, nom, email, role from public.professeurs where role = 'admin';
