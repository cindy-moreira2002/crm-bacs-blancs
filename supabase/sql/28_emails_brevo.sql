-- =====================================================================
--  E-MAILS AUTOMATIQUES (Brevo) — SCHEMA
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj
--       PAS le projet pipeline xgdaibekjmtffvkwvcge.
--
--  A coller dans le SQL Editor du projet CRM. Idempotent : on peut le
--  relancer autant de fois qu'on veut sans rien casser et sans perdre
--  la moindre donnee existante (aucun DROP, aucun DELETE).
--
--  Ce que ce script cree :
--   1. emails             — file d'attente ET journal des envois
--   2. email_contacts     — consentement marketing, desinscription, bounces
--   3. email_reglages     — tous les delais, en un seul endroit
--   4. preinscriptions    — demandes venues de la vitrine (avant paiement)
--   5. colonnes paiement + presence sur inscriptions
--
--  Attendu a la fin : le bloc de verification affiche 4 tables creees,
--  les reglages par defaut, et la date d'activation du systeme.
-- =====================================================================

-- Garde-fou : on doit etre dans le projet CRM.
do $$
begin
  if to_regclass('public.inscriptions') is null then
    raise exception 'STOP: table public.inscriptions absente. Tu es probablement dans le projet pipeline. Ouvre le projet CRM orpbfnmdlvxmkvyrpvtj, puis relance ce bloc.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. EMAILS — la file d'attente et l'historique, dans la meme table.
--
--    Une ligne = un message pour UNE personne. Elle nait en 'pending' ou
--    'scheduled', passe par 'processing' (verrouillee), puis 'sent'.
--    Les webhooks Brevo la font ensuite evoluer en 'delivered' / 'failed'.
--
--    cle_idempotence est la protection anti-doublon : elle est UNIQUE, donc
--    deux insertions concurrentes du meme message ne peuvent pas coexister.
--    Format : "<type>:<cible>:<id>[:<discriminant>]".
-- ---------------------------------------------------------------------
create table if not exists public.emails (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null,
  categorie          text not null default 'transactional',
  destinataire_email text not null,
  destinataire_nom   text,
  destinataire_role  text not null default 'eleve',
  inscription_id     uuid,
  session_id         uuid,
  professeur_id      uuid,
  copie_id           uuid,
  preinscription_id  uuid,
  cle_idempotence    text not null unique,
  planifie_le        timestamptz not null default now(),
  envoye_le          timestamptz,
  statut             text not null default 'pending',
  brevo_message_id   text,
  tentatives         int  not null default 0,
  derniere_erreur    text,
  raison_blocage     text,
  variables          jsonb not null default '{}'::jsonb,
  sujet              text,
  ouvert_le          timestamptz,
  clique_le          timestamptz,
  verrou_le          timestamptz,
  test               boolean not null default false,
  declenche_par      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Colonnes ajoutees apres coup (si la table existait deja d'une version anterieure).
alter table public.emails add column if not exists preinscription_id uuid;
alter table public.emails add column if not exists declenche_par     text;
alter table public.emails add column if not exists ouvert_le         timestamptz;
alter table public.emails add column if not exists clique_le         timestamptz;
alter table public.emails add column if not exists verrou_le         timestamptz;

-- categorie : transactional (indispensable a une inscription) | marketing (relances, annonces)
-- statut    : pending | scheduled | processing | sent | delivered | failed | cancelled | bloque
-- role      : eleve | parent | prof | admin | prospect
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'emails_categorie_check') then
    alter table public.emails add constraint emails_categorie_check
      check (categorie in ('transactional', 'marketing'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emails_statut_check') then
    alter table public.emails add constraint emails_statut_check
      check (statut in ('pending', 'scheduled', 'processing', 'sent', 'delivered', 'failed', 'cancelled', 'bloque'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emails_role_check') then
    alter table public.emails add constraint emails_role_check
      check (destinataire_role in ('eleve', 'parent', 'prof', 'admin', 'prospect'));
  end if;
end $$;

-- Liens vers le metier. ON DELETE SET NULL : supprimer une inscription ne doit
-- jamais effacer la trace d'un envoi (c'est un journal).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'emails_inscription_fkey') then
    alter table public.emails add constraint emails_inscription_fkey
      foreign key (inscription_id) references public.inscriptions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emails_session_fkey') then
    alter table public.emails add constraint emails_session_fkey
      foreign key (session_id) references public.sessions_bacs_blancs(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emails_professeur_fkey') then
    alter table public.emails add constraint emails_professeur_fkey
      foreign key (professeur_id) references public.professeurs(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emails_copie_fkey') then
    alter table public.emails add constraint emails_copie_fkey
      foreign key (copie_id) references public.copies(id) on delete set null;
  end if;
end $$;

-- Index de travail du moteur d'envoi : "qu'est-ce qui est du maintenant ?"
create index if not exists emails_a_envoyer_idx on public.emails (statut, planifie_le)
  where statut in ('pending', 'scheduled', 'processing');
create index if not exists emails_envoye_le_idx     on public.emails (envoye_le);
create index if not exists emails_inscription_idx   on public.emails (inscription_id);
create index if not exists emails_professeur_idx    on public.emails (professeur_id);
create index if not exists emails_type_idx          on public.emails (type);
create index if not exists emails_destinataire_idx  on public.emails (lower(destinataire_email));
create index if not exists emails_brevo_id_idx      on public.emails (brevo_message_id);

-- updated_at automatique.
create or replace function public.emails_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists emails_touch on public.emails;
create trigger emails_touch before update on public.emails
  for each row execute function public.emails_touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. EMAIL_CONTACTS — l'etat d'une adresse, independamment des messages.
--
--    C'est ici que vit la conformite RGPD : consentement marketing, source
--    du contact, desinscription, adresses rejetees definitivement.
--    Le moteur refuse tout envoi 'marketing' a un contact desinscrit, et
--    tout envoi (meme transactionnel) a une adresse en hard bounce.
-- ---------------------------------------------------------------------
create table if not exists public.email_contacts (
  email                  text primary key,
  nom                    text,
  role                   text not null default 'eleve',
  consentement_marketing boolean not null default false,
  consentement_le        timestamptz,
  consentement_source    text,
  desinscrit             boolean not null default false,
  desinscrit_le          timestamptz,
  bounce                 boolean not null default false,
  bounce_le              timestamptz,
  bounce_raison          text,
  plainte                boolean not null default false,
  plainte_le             timestamptz,
  derniere_activite      timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists email_contacts_marketing_idx on public.email_contacts (consentement_marketing, desinscrit);

drop trigger if exists email_contacts_touch on public.email_contacts;
create trigger email_contacts_touch before update on public.email_contacts
  for each row execute function public.emails_touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. EMAIL_REGLAGES — tous les delais au meme endroit, modifiables depuis
--    /admin/emails sans toucher au code.
--    Le code embarque les memes valeurs par defaut : si la table est vide,
--    rien ne casse.
-- ---------------------------------------------------------------------
create table if not exists public.email_reglages (
  cle        text primary key,
  valeur     text not null,
  libelle    text,
  updated_at timestamptz not null default now()
);

drop trigger if exists email_reglages_touch on public.email_reglages;
create trigger email_reglages_touch before update on public.email_reglages
  for each row execute function public.emails_touch_updated_at();

insert into public.email_reglages (cle, valeur, libelle) values
  ('infos_pratiques_jours_avant',   '5',   'Informations pratiques : X jours avant la session'),
  ('lien_visio_jours_avant',        '2',   'Envoi du lien de visioconference : X jours avant'),
  ('rappel_veille_heure',           '18',  'Rappel la veille : a quelle heure (0-23, heure de Paris)'),
  ('dernier_rappel_minutes_avant',  '60',  'Dernier rappel : X minutes avant le debut'),
  ('relance_paiement_heures_apres', '48',  'Relance paiement manquant : X heures apres l''inscription'),
  ('relance_paiement_max',          '2',   'Nombre maximum de relances de paiement'),
  ('demande_avis_jours_apres',      '3',   'Demande d''avis : X jours apres la mise a disposition de la correction'),
  ('prof_infos_jours_avant',        '5',   'Informations pratiques prof : X jours avant'),
  ('prof_rappel_heures_avant',      '24',  'Rappel prof : X heures avant la session'),
  ('prof_echeance_correction_jours','7',   'Echeance de correction : X jours apres la session'),
  ('relance_interet_jours_apres',   '3',   'Relance des preinscrits non inscrits : X jours apres'),
  ('quota_quotidien',               '300', 'Limite d''envois par jour (offre Brevo)'),
  ('quota_marge',                   '30',  'Marge de securite reservee aux e-mails indispensables'),
  ('lien_avis_url',                 '',    'Adresse du questionnaire de satisfaction (laisser vide pour masquer le bouton)'),
  ('paiement_instructions',         '',    'Instructions de virement affichees dans les e-mails de paiement (IBAN, reference...)'),
  ('paiement_montant_defaut',       '29',  'Montant par defaut d''un bac blanc, en euros'),
  ('envoi_actif',                   'oui', 'Envoi reel actif ? oui = les e-mails partent, non = mode test (rien ne part)')
on conflict (cle) do nothing;

-- Date d'activation : le planificateur ignore tout ce qui est anterieur.
-- Empeche les 16 inscriptions deja en base de recevoir des rappels retroactifs.
insert into public.email_reglages (cle, valeur, libelle)
values ('actif_depuis', now()::text, 'Rien d''anterieur a cette date ne declenche d''e-mail')
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------
-- 4. PREINSCRIPTIONS — les demandes venues du site vitrine, avant toute
--    inscription ferme. Table separee : une preinscription n'est pas une
--    inscription, et on ne veut pas polluer public.inscriptions.
-- ---------------------------------------------------------------------
create table if not exists public.preinscriptions (
  id             uuid primary key default gen_random_uuid(),
  prenom         text not null,
  nom            text,
  email          text not null,
  telephone      text,
  classe         text,
  matiere        text,
  session_libelle text,
  session_id     uuid references public.sessions_bacs_blancs(id) on delete set null,
  source         text not null default 'vitrine',
  consentement_marketing boolean not null default false,
  statut         text not null default 'nouvelle',
  inscription_id uuid references public.inscriptions(id) on delete set null,
  relance_envoyee boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- statut : nouvelle | relancee | convertie | abandonnee
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'preinscriptions_statut_check') then
    alter table public.preinscriptions add constraint preinscriptions_statut_check
      check (statut in ('nouvelle', 'relancee', 'convertie', 'abandonnee'));
  end if;
end $$;

create index if not exists preinscriptions_email_idx  on public.preinscriptions (lower(email));
create index if not exists preinscriptions_statut_idx on public.preinscriptions (statut);

drop trigger if exists preinscriptions_touch on public.preinscriptions;
create trigger preinscriptions_touch before update on public.preinscriptions
  for each row execute function public.emails_touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. INSCRIPTIONS — paiement et presence.
--
--    Les bacs blancs sont regles par virement : aucun prestataire de
--    paiement ne peut confirmer a notre place. Le statut est donc pose
--    cote serveur par l'administratrice depuis /admin/emails, jamais par
--    un parametre d'URL.
-- ---------------------------------------------------------------------
alter table public.inscriptions add column if not exists paiement_statut      text not null default 'en_attente';
alter table public.inscriptions add column if not exists paiement_montant     numeric(8,2);
alter table public.inscriptions add column if not exists paiement_reference   text;
alter table public.inscriptions add column if not exists paiement_confirme_le timestamptz;
alter table public.inscriptions add column if not exists presence             text not null default 'inconnu';
alter table public.inscriptions add column if not exists copie_recue          boolean not null default false;
alter table public.inscriptions add column if not exists correction_publiee_le timestamptz;
alter table public.inscriptions add column if not exists annulee_le           timestamptz;
alter table public.inscriptions add column if not exists source               text;

-- paiement_statut : en_attente | paye | offert | rembourse | annule
-- presence        : inconnu | present | absent
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inscriptions_paiement_statut_check') then
    alter table public.inscriptions add constraint inscriptions_paiement_statut_check
      check (paiement_statut in ('en_attente', 'paye', 'offert', 'rembourse', 'annule'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inscriptions_presence_check') then
    alter table public.inscriptions add constraint inscriptions_presence_check
      check (presence in ('inconnu', 'present', 'absent'));
  end if;
end $$;

create index if not exists inscriptions_paiement_idx on public.inscriptions (paiement_statut);

-- ---------------------------------------------------------------------
-- 6. SESSIONS — memoire du dernier etat notifie, pour detecter un
--    changement important (date ou horaire) et prevenir les eleves.
-- ---------------------------------------------------------------------
alter table public.sessions_bacs_blancs add column if not exists derniere_notif_empreinte text;
alter table public.sessions_bacs_blancs add column if not exists annulee_le               timestamptz;

-- ---------------------------------------------------------------------
-- 7. RLS — tout passe par nos routes /api en service_role.
--    RLS actif SANS policy publique : la cle anon du navigateur ne peut
--    ni lire ni ecrire ces tables. Un eleve ne peut donc pas voir
--    l'adresse, le lien ou l'historique d'un autre eleve.
-- ---------------------------------------------------------------------
alter table public.emails          enable row level security;
alter table public.email_contacts  enable row level security;
alter table public.email_reglages  enable row level security;
alter table public.preinscriptions enable row level security;

-- ---------------------------------------------------------------------
-- VERIFICATION
-- ---------------------------------------------------------------------
select 'tables creees' as controle,
       string_agg(table_name, ', ' order by table_name) as resultat
from information_schema.tables
where table_schema = 'public'
  and table_name in ('emails', 'email_contacts', 'email_reglages', 'preinscriptions')
union all
select 'reglages', count(*)::text from public.email_reglages
union all
select 'actif depuis', valeur from public.email_reglages where cle = 'actif_depuis'
union all
select 'inscriptions en attente de paiement', count(*)::text
from public.inscriptions where paiement_statut = 'en_attente'
union all
select 'RLS actif partout',
       case when bool_and(c.relrowsecurity) then 'oui' else 'NON — a corriger' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('emails', 'email_contacts', 'email_reglages', 'preinscriptions');
