-- =====================================================================
--  AFFILIATION DES PROFS — 10 € par élève inscrit avec leur lien
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj
--       PAS le projet pipeline xgdaibekjmtffvkwvcge.
--
--  A coller dans le SQL Editor du projet CRM. Idempotent : on peut le
--  relancer autant de fois qu'on veut sans rien casser.
--
--  Ce que ce script fait :
--   1. inscriptions.code_affiliation   — le code du prof, saisi par l'élève
--      (déjà créé par 09_espaces_prof_schema.sql, repris ici au cas où) ;
--   2. revenus_prof.inscription_id     — QUEL élève a produit CE revenu, avec
--      un index unique : une inscription ne peut jamais payer deux fois
--      l'affiliation, même si la page est rechargée dix fois ;
--   3. professeurs.iban / titulaire_compte — pour savoir OU virer l'argent
--      sans quitter la page Paiements ;
--   4. rattrapage : crée les lignes d'affiliation manquantes pour les
--      inscriptions déjà payées qui portaient un code (jamais de doublon).
--
--  Attendu à la fin : le bloc de vérification affiche 3 colonnes ajoutées et
--  le nombre de lignes d'affiliation existantes.
-- =====================================================================

-- Garde-fou : on doit être dans le projet CRM.
do $$
begin
  if to_regclass('public.professeurs') is null then
    raise exception 'STOP: table public.professeurs absente. Tu es probablement dans le projet pipeline. Ouvre le projet CRM orpbfnmdlvxmkvyrpvtj, puis relance ce bloc.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. LE CODE DU PROF SUR L'INSCRIPTION DE L'ELEVE
-- ---------------------------------------------------------------------
alter table public.inscriptions add column if not exists code_affiliation text;
create index if not exists inscriptions_affiliation_idx on public.inscriptions (code_affiliation);

-- ---------------------------------------------------------------------
-- 2. REVENUS_PROF — rattachement à l'élève qui l'a déclenché
--
--    Sans cette colonne, rien n'empêchait d'ajouter deux fois les 10 € du
--    même élève : la ligne était identifiée par rien du tout. L'index
--    unique partiel ferme la porte au niveau de la base, pas seulement
--    dans le code.
-- ---------------------------------------------------------------------
alter table public.revenus_prof add column if not exists inscription_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'revenus_prof_inscription_fkey') then
    alter table public.revenus_prof
      add constraint revenus_prof_inscription_fkey
      foreign key (inscription_id) references public.inscriptions(id) on delete cascade;
  end if;
end $$;

create unique index if not exists revenus_prof_affiliation_unique
  on public.revenus_prof (inscription_id)
  where type = 'affiliation' and inscription_id is not null;

create index if not exists revenus_prof_statut_idx on public.revenus_prof (statut);

-- ---------------------------------------------------------------------
-- 3. OU VIRER L'ARGENT
--    L'IBAN n'est lisible que par la service_role (RLS actif sur la table,
--    aucune policy pour anon) : il ne sort que par la page Paiements.
-- ---------------------------------------------------------------------
alter table public.professeurs add column if not exists iban              text;
alter table public.professeurs add column if not exists titulaire_compte  text;

-- ---------------------------------------------------------------------
-- 4. RATTRAPAGE — les élèves déjà payés qui portaient un code de prof
--    n'avaient jamais généré leur ligne d'affiliation.
-- ---------------------------------------------------------------------
insert into public.revenus_prof (professeur_id, type, montant, session_id, inscription_id, libelle, statut)
select p.id,
       'affiliation',
       10,
       i.session_id,
       i.id,
       'Affiliation — ' || coalesce(i.nom, 'élève') || coalesce(' (' || i.matiere || ')', ''),
       'a_payer'
from public.inscriptions i
join public.professeurs p
  on upper(trim(p.code_affiliation)) = upper(trim(i.code_affiliation))
where i.code_affiliation is not null
  and trim(i.code_affiliation) <> ''
  and i.paiement_statut = 'paye'
  and i.annulee_le is null
on conflict do nothing;

-- ---------------------------------------------------------------------
-- VERIFICATION
-- ---------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'revenus_prof'
       and column_name = 'inscription_id')                        as colonne_inscription_id,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'professeurs'
       and column_name in ('iban', 'titulaire_compte'))           as colonnes_virement,
  (select count(*) from public.revenus_prof where type = 'affiliation') as lignes_affiliation,
  (select count(*) from public.inscriptions
     where code_affiliation is not null and trim(code_affiliation) <> '') as inscriptions_parrainees;
