-- =====================================================================
--  CODES PROMO — le code du prof vaut 10 € de remise, UNE SEULE FOIS
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj
--       PAS le projet pipeline xgdaibekjmtffvkwvcge.
--
--  A coller dans le SQL Editor du projet CRM. Idempotent.
--
--  La règle, en une phrase : un élève qui s'inscrit avec le code de son
--  prof paie 10 € de moins, et seulement à sa PREMIERE matinée — son
--  deuxième bac blanc est au prix normal, même avec le même code.
--
--  Ce que ce script fait :
--   1. codes_promo            — le répertoire. Un code absent d'ici ne
--      marche plus : fini les codes inventés acceptés en silence.
--   2. inscriptions.code_promo / remise_euros — ce dont CET élève a
--      bénéficié, lisible sur sa ligne et exportable vers le classeur.
--   3. reprise : chaque prof en activité reçoit son code dans le
--      répertoire, pour que les liens déjà partagés continuent de marcher.
--
--  Attendu à la fin : le bloc de vérification affiche le nombre de codes
--  repris et les colonnes ajoutées.
-- =====================================================================

-- Garde-fou : on doit être dans le projet CRM.
do $$
begin
  if to_regclass('public.professeurs') is null then
    raise exception 'STOP: table public.professeurs absente. Tu es probablement dans le projet pipeline. Ouvre le projet CRM orpbfnmdlvxmkvyrpvtj, puis relance ce bloc.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. LE REPERTOIRE DES CODES
--
--    `code` est la clé : toujours normalisé (majuscules, sans espaces)
--    par la contrainte, pour que « claire 3f7b » et « CLAIRE3F7B »
--    n'existent jamais comme deux lignes différentes.
--
--    `professeur_id` est FACULTATIF : un code peut appartenir à un prof
--    (il touche alors son affiliation) ou à une campagne / un lycée
--    partenaire, qui ne rémunère personne.
-- ---------------------------------------------------------------------
create table if not exists public.codes_promo (
  code              text primary key,
  libelle           text not null,
  professeur_id     uuid references public.professeurs(id) on delete set null,
  remise_euros      numeric(8,2) not null default 10 check (remise_euros >= 0),
  -- 'prof' : le code remise ET rémunère. 'campagne' : il remise seulement.
  categorie         text not null default 'prof' check (categorie in ('prof', 'campagne')),
  actif             boolean not null default true,
  valide_du         date,
  valide_au         date,
  -- Combien de fois un MEME élève peut en bénéficier. 1 = sa première
  -- matinée seulement, ce qui est la règle posée le 20/09/2026.
  usages_par_eleve  integer not null default 1 check (usages_par_eleve >= 1),
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint codes_promo_code_normalise check (code = upper(code) and code !~ '\s')
);

create index if not exists codes_promo_prof_idx on public.codes_promo (professeur_id);
create index if not exists codes_promo_actif_idx on public.codes_promo (actif);

-- ---------------------------------------------------------------------
-- 2. CE DONT L'ELEVE A BENEFICIE, SUR SA LIGNE D'INSCRIPTION
--
--    On écrit la remise EN DUR sur l'inscription plutôt que de la relire
--    dans codes_promo : le jour où tu passes la remise de 10 à 15 €, les
--    inscriptions déjà prises gardent le prix auquel elles ont été
--    vendues. Une facture ne se réécrit pas.
-- ---------------------------------------------------------------------
alter table public.inscriptions add column if not exists code_promo   text;
alter table public.inscriptions add column if not exists remise_euros numeric(8,2) not null default 0;

create index if not exists inscriptions_code_promo_idx on public.inscriptions (code_promo);

-- ---------------------------------------------------------------------
-- 3. REPRISE DES CODES PROFS EXISTANTS
--
--    Sans ça, tous les liens `?ref=…` déjà partagés par les profs
--    seraient refusés du jour au lendemain. On ne crée que ce qui manque.
-- ---------------------------------------------------------------------
insert into public.codes_promo (code, libelle, professeur_id, categorie, remise_euros, note)
select
  upper(replace(p.code_affiliation, ' ', '')),
  'Code de ' || coalesce(p.prenom, '') || ' ' || coalesce(p.nom, ''),
  p.id,
  'prof',
  10,
  'Repris automatiquement par le script 53.'
from public.professeurs p
where p.code_affiliation is not null
  and length(replace(p.code_affiliation, ' ', '')) >= 4
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 4. REPRISE DES INSCRIPTIONS DEJA PRISES
--
--    Elles portaient un code_affiliation mais aucune remise : personne ne
--    leur a rien déduit à l'époque. On recopie donc le code pour la
--    traçabilité, en laissant la remise à 0 — on ne rembourse pas après
--    coup une réduction qui n'a jamais été accordée.
-- ---------------------------------------------------------------------
update public.inscriptions
   set code_promo = upper(replace(code_affiliation, ' ', ''))
 where code_affiliation is not null
   and code_promo is null;

-- ---------------------------------------------------------------------
-- 5. VERIFICATION
-- ---------------------------------------------------------------------
select
  (select count(*) from public.codes_promo)                          as codes_repertories,
  (select count(*) from public.codes_promo where actif)              as codes_actifs,
  (select count(*) from public.inscriptions where code_promo is not null) as inscriptions_avec_code,
  (select count(*) from public.inscriptions where remise_euros > 0)  as inscriptions_avec_remise;
