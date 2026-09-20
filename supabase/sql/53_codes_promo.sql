-- =====================================================================
--  53 - OFFRES ET CODES PROMO
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj
--       PAS le projet pipeline xgdaibekjmtffvkwvcge.
--
--  A coller dans le SQL Editor du projet CRM. Idempotent : rejouable.
--
--  Ce script transcrit EXACTEMENT la grille publiee sur matineesdubac.fr
--  (page « Les Tarifs », relevee en ligne le 20 septembre 2026) :
--
--    Prix public .................. 59 EUR la matinee
--    Premiere matinee ............. 49 EUR, AUTOMATIQUE, sans code
--    PARRAIN10 .................... le filleul paie 49 EUR sa premiere
--                                   matinee, le parrain recoit 10 EUR
--                                   d'avoir sur SA matinee suivante
--    TRIO39 ....................... 39 EUR par personne, a partir de 3
--                                   inscrits sur la MEME matinee
--    DUO89 ........................ 2 matieres reservees ensemble, 89 EUR
--    FIDELITE3 .................... 3 matinees prepayees, 139 EUR
--    FIDELITE5 .................... 5 matinees prepayees, 199 EUR
--    Ambassadeur .................. apres sa premiere matinee, l'eleve
--                                   recoit 3 codes -10 EUR ; chaque ami
--                                   inscrit lui donne 5 EUR d'avoir
--    Regle d'or ................... UNE SEULE reduction a la fois, la
--                                   plus avantageuse
--
--  Trois notions, et non plus une seule « remise » :
--    1. un CODE peut poser un prix, une remise, ou vendre un lot ;
--    2. un AVOIR est de l'argent garde pour la prochaine matinee ;
--    3. un PACK est un stock de matinees deja payees.
--
--  Le calcul du prix (« laquelle est la plus avantageuse ? ») reste dans
--  le code TypeScript, ou il est testable. La base tient les faits.
-- =====================================================================

-- Garde-fou : on doit etre dans le projet CRM.
do $$
begin
  if to_regclass('public.professeurs') is null then
    raise exception 'STOP: table public.professeurs absente. Tu es probablement dans le projet pipeline. Ouvre le projet CRM orpbfnmdlvxmkvyrpvtj, puis relance ce bloc.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. LE REPERTOIRE DES CODES
--
--    `code` est la cle, toujours en majuscules sans espaces : « duo89 »
--    et « DUO89 » ne doivent jamais exister comme deux lignes.
--
--    `type` dit ce que le code FAIT. C'est la colonne qui manquait :
--      prix_fixe  -> la matinee coute ce prix (TRIO39, PARRAIN10)
--      remise     -> on retire N euros du prix public (codes ambassadeur)
--      lot        -> on vend N matinees pour un prix total (DUO89,
--                    FIDELITE3, FIDELITE5)
--      affiliation-> aucune reduction, le code sert a payer le prof
-- ---------------------------------------------------------------------
create table if not exists public.codes_promo (
  code                text primary key,
  libelle             text not null,
  type                text not null default 'remise'
                      check (type in ('prix_fixe', 'remise', 'lot', 'affiliation')),

  -- Ce que paie la famille, selon le type.
  prix_unitaire       numeric(8,2),   -- type 'prix_fixe' : 49.00, 39.00
  remise              numeric(8,2),   -- type 'remise'    : 10.00
  matinees_incluses   integer not null default 1,  -- 'lot' : 2, 3, 5
  prix_lot            numeric(8,2),   -- 'lot' : 89.00, 139.00, 199.00

  -- Conditions d'application.
  -- TRIO39 : 3 personnes MINIMUM, et sur la meme matinee.
  min_participants    integer not null default 1 check (min_participants >= 1),
  meme_session        boolean not null default false,
  -- PARRAIN10 cote filleul : reserve a une PREMIERE matinee.
  premiere_matinee    boolean not null default false,
  usages_par_eleve    integer not null default 1 check (usages_par_eleve >= 1),
  usages_max          integer,        -- null = illimite ; 1 pour un code ambassadeur

  -- Ce que le code rapporte a QUELQU'UN D'AUTRE, en avoir.
  -- PARRAIN10 : 10 EUR au parrain. Code ambassadeur : 5 EUR au proprietaire.
  avoir_pour_proprietaire numeric(8,2) not null default 0,
  -- Le porteur du code, quand il est nominatif (codes ambassadeur).
  proprietaire_email      text,
  professeur_id           uuid references public.professeurs(id) on delete set null,

  -- 'public'     : affiche sur le site, saisissable par tout le monde
  -- 'prof'       : le code d'affiliation d'un professeur
  -- 'ambassadeur': engendre pour UN eleve, apres sa premiere matinee
  categorie           text not null default 'public'
                      check (categorie in ('public', 'prof', 'ambassadeur')),
  actif               boolean not null default true,
  valide_du           date,
  valide_au           date,
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint codes_promo_code_normalise check (code = upper(code) and code !~ '\s'),
  -- Un type doit porter le montant qui va avec, sinon le code ne veut rien dire.
  constraint codes_promo_montant_coherent check (
    (type = 'prix_fixe'   and prix_unitaire is not null)
    or (type = 'remise'   and remise is not null)
    or (type = 'lot'      and prix_lot is not null and matinees_incluses >= 2)
    or (type = 'affiliation')
  )
);

create index if not exists codes_promo_prof_idx on public.codes_promo (professeur_id);
create index if not exists codes_promo_actif_idx on public.codes_promo (actif);
create index if not exists codes_promo_proprietaire_idx on public.codes_promo (proprietaire_email);

-- ---------------------------------------------------------------------
-- 2. LES AVOIRS — l'argent garde pour la prochaine matinee
--
--    « Le parrain recoit -10 EUR sur sa matinee suivante » et « +5 EUR de
--    credit par ami inscrit » ne sont pas des remises : ce sont des
--    sommes dues a quelqu'un, qui attendent sa prochaine inscription.
--
--    On garde chaque avoir LIGNE A LIGNE plutot qu'un solde unique : le
--    jour ou une famille conteste, on doit pouvoir dire d'ou vient
--    chaque euro et a quelle inscription il a servi.
-- ---------------------------------------------------------------------
create table if not exists public.avoirs_eleve (
  id                serial primary key,
  email             text not null,            -- le beneficiaire
  montant           numeric(8,2) not null check (montant > 0),
  origine           text not null
                    check (origine in ('parrainage', 'ambassadeur', 'geste_commercial', 'remboursement')),
  -- D'ou vient cet avoir : l'inscription du filleul qui l'a declenche.
  declenche_par     uuid references public.inscriptions(id) on delete set null,
  code              text references public.codes_promo(code) on delete set null,
  -- Ou il a ete depense. Tant que c'est null, l'avoir est disponible.
  consomme_par      uuid references public.inscriptions(id) on delete set null,
  consomme_le       timestamptz,
  expire_le         date,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists avoirs_eleve_email_idx on public.avoirs_eleve (lower(email));
create index if not exists avoirs_eleve_dispo_idx on public.avoirs_eleve (lower(email)) where consomme_par is null;

-- ---------------------------------------------------------------------
-- 3. LES PACKS — des matinees deja payees, a consommer dans l'annee
--
--    DUO89, FIDELITE3 et FIDELITE5 ne remisent pas une inscription : ils
--    vendent un STOCK. La famille paie une fois, puis inscrit l'eleve
--    autant de fois que le pack le permet, sans repayer.
--
--    `matinees_restantes` est calcule, jamais saisi : il ne peut pas
--    diverger du nombre d'inscriptions reellement rattachees.
-- ---------------------------------------------------------------------
create table if not exists public.packs_eleve (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  code               text not null references public.codes_promo(code),
  matinees_total     integer not null check (matinees_total >= 1),
  prix_paye          numeric(8,2) not null,
  paiement_statut    text not null default 'en_attente'
                     check (paiement_statut in ('en_attente', 'paye', 'rembourse', 'annule')),
  achete_le          timestamptz not null default now(),
  -- « a utiliser quand vous voulez dans l'annee » : un an ferme.
  expire_le          date not null default (current_date + interval '1 year')::date,
  note               text
);

create index if not exists packs_eleve_email_idx on public.packs_eleve (lower(email));

-- ---------------------------------------------------------------------
-- 4. CE QUE PORTE UNE INSCRIPTION
--
--    On ecrit le prix EN DUR au moment de l'inscription. Le jour ou la
--    grille change, les inscriptions deja prises gardent le prix auquel
--    elles ont ete vendues : une facture ne se reecrit pas.
-- ---------------------------------------------------------------------
alter table public.inscriptions add column if not exists code_promo        text;
alter table public.inscriptions add column if not exists prix_public       numeric(8,2);
alter table public.inscriptions add column if not exists remise_euros      numeric(8,2) not null default 0;
alter table public.inscriptions add column if not exists avoir_utilise     numeric(8,2) not null default 0;
alter table public.inscriptions add column if not exists pack_id           uuid references public.packs_eleve(id) on delete set null;
-- Les inscriptions posees ensemble (duo de matieres, groupe de 3 amis) :
-- meme identifiant de groupe, un seul paiement.
alter table public.inscriptions add column if not exists groupe_paiement   uuid;

create index if not exists inscriptions_code_promo_idx on public.inscriptions (code_promo);
create index if not exists inscriptions_pack_idx on public.inscriptions (pack_id);
create index if not exists inscriptions_groupe_idx on public.inscriptions (groupe_paiement);

-- ---------------------------------------------------------------------
-- 5. LES CODES PUBLICS, TELS QU'ILS SONT ECRITS SUR LE SITE
--
--    `on conflict do update` : rejouer le script remet la grille en
--    accord avec le site, sans dupliquer ni perdre les codes ajoutes a
--    la main entre-temps.
-- ---------------------------------------------------------------------
insert into public.codes_promo
  (code, libelle, type, prix_unitaire, remise, matinees_incluses, prix_lot,
   min_participants, meme_session, premiere_matinee, usages_par_eleve,
   avoir_pour_proprietaire, categorie, note)
values
  ('PARRAIN10', 'Parrainage entre élèves', 'prix_fixe', 49, null, 1, null,
   1, false, true, 1, 10, 'public',
   'Le filleul paie 49 € sa première matinée ; le parrain reçoit 10 € d''avoir sur sa matinée suivante.'),

  ('TRIO39', 'Groupe de 3 amis et plus', 'prix_fixe', 39, null, 1, null,
   3, true, false, 99, 0, 'public',
   'Au moins 3 inscrits sur la MÊME matinée. 39 € par personne au lieu de 59 €.'),

  ('DUO89', 'Duo de matières', 'lot', null, null, 2, 89,
   1, false, false, 99, 0, 'public',
   '2 matières différentes réservées ensemble — 44,50 € la matinée.'),

  ('FIDELITE3', 'Pack fidélité 3', 'lot', null, null, 3, 139,
   1, false, false, 99, 0, 'public',
   '3 matinées prépayées, à utiliser dans l''année — 47 € la matinée.'),

  ('FIDELITE5', 'Pack fidélité 5', 'lot', null, null, 5, 199,
   1, false, false, 99, 0, 'public',
   '5 matinées prépayées, matières au choix — 39,80 € la matinée. Meilleur prix.')
on conflict (code) do update set
  libelle                 = excluded.libelle,
  type                    = excluded.type,
  prix_unitaire           = excluded.prix_unitaire,
  remise                  = excluded.remise,
  matinees_incluses       = excluded.matinees_incluses,
  prix_lot                = excluded.prix_lot,
  min_participants        = excluded.min_participants,
  meme_session            = excluded.meme_session,
  premiere_matinee        = excluded.premiere_matinee,
  usages_par_eleve        = excluded.usages_par_eleve,
  avoir_pour_proprietaire = excluded.avoir_pour_proprietaire,
  note                    = excluded.note,
  updated_at              = now();

-- ---------------------------------------------------------------------
-- 6. LES CODES DES PROFESSEURS
--
--    IMPORTANT : un code prof ne remise RIEN. Le site l'ecrit noir sur
--    blanc — « la remise s'applique automatiquement, que vous veniez par
--    vous-meme ou avec le lien de votre professeur particulier ». Les
--    49 EUR de la premiere matinee sont acquis dans les deux cas.
--
--    Le code prof sert donc a UNE chose : savoir a qui verser les 10 EUR
--    d'affiliation. C'est pour ca que son type est 'affiliation'.
-- ---------------------------------------------------------------------
insert into public.codes_promo (code, libelle, type, professeur_id, categorie, note)
select
  upper(replace(p.code_affiliation, ' ', '')),
  'Code de ' || coalesce(p.prenom, '') || ' ' || coalesce(p.nom, ''),
  'affiliation',
  p.id,
  'prof',
  'Repris automatiquement. Ne remise pas : la première matinée est déjà à 49 €.'
from public.professeurs p
where p.code_affiliation is not null
  and length(replace(p.code_affiliation, ' ', '')) >= 4
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 7. REPRISE DES INSCRIPTIONS DEJA PRISES
--
--    On recopie le code pour la tracabilite, en laissant la remise a 0 :
--    aucune reduction ne leur a ete accordee a l'epoque, et on ne
--    rembourse pas apres coup.
-- ---------------------------------------------------------------------
update public.inscriptions
   set code_promo = upper(replace(code_affiliation, ' ', ''))
 where code_affiliation is not null
   and code_promo is null;

-- ---------------------------------------------------------------------
-- 8. LE PRIX PUBLIC
--
--    Le site annonce 59 EUR ; le reglage du CRM etait reste a 69 EUR, et
--    c'est lui qui s'affiche a l'inscription et part dans les e-mails.
--    Deux prix differents pour la meme matinee, c'est une famille qui
--    vire le mauvais montant.
--
--    >>> SUPPRIME CE BLOC si tu veux garder 69 EUR et corriger le site.
-- ---------------------------------------------------------------------
insert into public.email_reglages (cle, valeur)
values ('paiement_montant_defaut', '59')
on conflict (cle) do update set valeur = excluded.valeur;

-- ---------------------------------------------------------------------
-- 9. CE QUE LIT LE CLASSEUR DE SUIVI FINANCIER
--
--    Une ligne par code : combien de fois il a servi, combien il a
--    rapporte, combien il a coute en reductions et en avoirs.
-- ---------------------------------------------------------------------
create or replace view public.v_codes_promo_finance as
select
  c.code,
  c.libelle,
  c.type,
  c.categorie,
  c.actif,
  count(i.id)                                              as inscriptions,
  count(i.id) filter (where i.paiement_statut = 'paye')    as inscriptions_payees,
  coalesce(sum(i.remise_euros), 0)                         as remises_accordees,
  coalesce(sum(i.paiement_montant) filter (where i.paiement_statut = 'paye'), 0) as encaisse,
  coalesce((select sum(a.montant) from public.avoirs_eleve a where a.code = c.code), 0) as avoirs_generes
from public.codes_promo c
left join public.inscriptions i on i.code_promo = c.code
group by c.code, c.libelle, c.type, c.categorie, c.actif
order by c.categorie, c.code;

-- ---------------------------------------------------------------------
-- 10. VERIFICATION
--
--     Attendu : 5 codes publics, autant de codes prof que de professeurs
--     ayant un code, et le prix public a 59.
-- ---------------------------------------------------------------------
select
  (select count(*) from public.codes_promo where categorie = 'public') as codes_publics,
  (select count(*) from public.codes_promo where categorie = 'prof')   as codes_profs,
  (select count(*) from public.avoirs_eleve)                           as avoirs,
  (select count(*) from public.packs_eleve)                            as packs,
  (select valeur from public.email_reglages where cle = 'paiement_montant_defaut') as prix_public;
