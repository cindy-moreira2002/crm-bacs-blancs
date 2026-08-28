-- 51 — La console du prof le jour J
--
-- Trois manques, tous constatés en préparant un vrai bac blanc :
--
--   1. l'élève qui bloque n'avait aucun moyen d'appeler son prof autrement
--      qu'en parlant dans le vide de sa salle vocale — si le prof était dans
--      une autre salle, personne ne l'entendait ;
--   2. les copies des élèves vivent dans des documents (Google Docs, dossier
--      Drive) dont l'adresse n'était écrite nulle part : le prof les cherchait
--      dans ses mails ;
--   3. l'espace prof affichait un LIEN DE DÉMONSTRATION en guise de grille de
--      correction, parce que la colonne prévue pour lui était vide sur toutes
--      les sessions. Le vrai classeur (celui de la matière) existait déjà, il
--      n'était simplement branché nulle part.
--
-- Ce script pose la table des appels et les trois colonnes qui manquaient.
-- Rejouable sans risque : rien n'est effacé, les colonnes naissent vides.

-- --- Garde-fou : on doit être dans le projet CRM ----------------------

do $$
begin
  if to_regclass('public.inscriptions') is null then
    raise exception 'STOP: table public.inscriptions absente. Tu es probablement dans le projet pipeline. Ouvre le projet CRM, puis relance ce script.';
  end if;
end $$;

-- --- 1. Les appels à l'aide -------------------------------------------
--
-- Une ligne par main levée. On ne supprime jamais : un appel traité garde sa
-- trace, ce qui permet de dire après coup « combien de fois a-t-on été appelé,
-- et en combien de temps a-t-on répondu ».

create table if not exists public.appels_aide (
  id             uuid primary key default gen_random_uuid(),
  inscription_id uuid not null references public.inscriptions(id) on delete cascade,
  session_id     uuid references public.sessions_bacs_blancs(id) on delete set null,
  -- 'aide' = question sur l'épreuve · 'technique' = ça ne marche pas
  motif          text not null default 'aide',
  -- D'où vient l'appel : 'espace' (bouton dans l'espace élève) ou 'discord'
  -- (bouton posé dans sa salle). Sert à savoir quel canal les élèves utilisent.
  source         text not null default 'espace',
  cree_le        timestamptz not null default now(),
  -- Traité = le prof a cliqué « c'est réglé », ou l'élève a rebaissé la main.
  traite_le      timestamptz,
  traite_par     uuid references public.professeurs(id) on delete set null,
  -- Rempli quand c'est l'élève lui-même qui annule : on ne compte pas ça comme
  -- une intervention du prof.
  annule_le      timestamptz
);

comment on table public.appels_aide is
  'Mains levées des élèves pendant une épreuve. Une ligne ouverte (traite_le et annule_le vides) = un élève qui attend.';

-- Un seul appel ouvert par élève : lever la main deux fois ne fait pas deux
-- lignes rouges sur la console du prof. L'index partiel le garantit en base,
-- pas seulement dans le code.
create unique index if not exists appels_aide_un_seul_ouvert
  on public.appels_aide (inscription_id)
  where traite_le is null and annule_le is null;

-- La console du prof lit « les appels de cette session » toutes les 10 s.
create index if not exists appels_aide_session_idx
  on public.appels_aide (session_id, cree_le desc);

alter table public.appels_aide enable row level security;

-- Aucune politique : la table n'est lue et écrite que par le serveur, avec la
-- clé service_role. Le navigateur d'un élève ne parle jamais à Supabase
-- directement — il appelle /api/eleve/appel, qui vérifie son cookie signé.
drop policy if exists appels_aide_service on public.appels_aide;

-- --- 2. Où sont les copies des élèves ---------------------------------

alter table public.sessions_bacs_blancs
  add column if not exists drive_copies_url text;

comment on column public.sessions_bacs_blancs.drive_copies_url is
  'Adresse du dossier (Drive ou autre) qui contient les copies de CE bac blanc. Le prof l''ouvre depuis sa console. Vide = on retombe sur le dossier général, réglage « drive_copies_url ».';

alter table public.inscriptions
  add column if not exists copie_doc_url text;

comment on column public.inscriptions.copie_doc_url is
  'Adresse du document de la copie de CET élève (Google Doc le plus souvent). Le prof peut le coller lui-même depuis sa console, sur la ligne de l''élève.';

-- Le bouton « ✋ Appeler le prof » posé dans la salle Discord de l'élève.
-- On note la date ici plutôt que de relire l'historique du salon : relire
-- exigerait une permission Discord de plus (« Voir les anciens messages ») pour
-- une information qu'on connaît déjà. Vide = le bouton reste à poser, et
-- « Préparer les salles » le posera à son prochain passage.
alter table public.inscriptions
  add column if not exists discord_bouton_pose_le timestamptz;

comment on column public.inscriptions.discord_bouton_pose_le is
  'Quand le message « ✋ Appeler le prof » a été posté dans la salle de cet élève. Vide = pas encore posé.';

-- --- 3. Deux adresses de dépannage ------------------------------------
--
-- Rangées dans la table clé/valeur qui existe déjà (email_reglages).
--
-- ⚠️ La grille de correction NORMALE n'est pas ici : c'est le classeur de la
-- MATIÈRE (les « guidelines », lib/guidelines.ts), et depuis le script 52 la
-- copie de ce classeur créée pour chaque bac blanc. Le réglage ci-dessous n'est
-- qu'un filet, pour une matière dont le classeur n'existe pas encore.

insert into public.email_reglages (cle, valeur, libelle)
values
  ('sheet_correction_url', '', 'Grille de correction — classeur de secours, si la matière n''a pas le sien'),
  ('drive_copies_url',     '', 'Dossier des copies des élèves — dossier général')
on conflict (cle) do nothing;

-- --- Vérification -----------------------------------------------------
-- Doit afficher : la table appels_aide, les 2 colonnes, et les 2 réglages.

select 'table' as quoi, 'appels_aide' as nom,
       (select count(*)::text from information_schema.tables
         where table_name = 'appels_aide') as present
union all
select 'colonne', 'sessions_bacs_blancs.drive_copies_url',
       (select count(*)::text from information_schema.columns
         where table_name = 'sessions_bacs_blancs' and column_name = 'drive_copies_url')
union all
select 'colonne', 'inscriptions.copie_doc_url',
       (select count(*)::text from information_schema.columns
         where table_name = 'inscriptions' and column_name = 'copie_doc_url')
union all
select 'reglage', 'sheet_correction_url',
       (select count(*)::text from public.email_reglages where cle = 'sheet_correction_url')
union all
select 'reglage', 'drive_copies_url',
       (select count(*)::text from public.email_reglages where cle = 'drive_copies_url');
