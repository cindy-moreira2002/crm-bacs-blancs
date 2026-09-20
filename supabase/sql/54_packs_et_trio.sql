-- =====================================================================
--  54 - PACKS PREPAYES ET CODES DE GROUPE (TRIO)
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj.
--  A coller dans le SQL Editor. Idempotent : rejouable sans dommage.
--  Le script 53 doit avoir ete passe avant.
--
--  Deux decisions de Cindy, 20 septembre 2026.
--
--  1. LES PACKS (DUO89, FIDELITE3, FIDELITE5)
--     La famille s'inscrit a UNE matinee et paie le pack entier tout de
--     suite. Les autres matinees restent en reserve : l'eleve les pose
--     plus tard, quand il connait ses disponibilites. Son espace lui dit
--     combien il lui en reste, et le suivi financier voit qu'il a paye
--     pour trois seances.
--
--  2. LE TRIO A 39 EUR
--     Le premier eleve s'inscrit et le systeme fabrique SON code :
--     « LEA39 ». Il le donne a deux camarades — pas plus : au troisieme
--     usage, le code est expire.
--     Les trois doivent etre inscrits ET regles dans les 48 HEURES qui
--     suivent la premiere inscription. Passe ce delai, l'inscription de
--     celui qui a genere le code est ANNULEE, et il recoit un e-mail lui
--     disant que l'offre ne tient plus.
-- =====================================================================

do $$
begin
  if to_regclass('public.codes_promo') is null then
    raise exception 'STOP: table codes_promo absente. Joue d''abord 53_codes_promo.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. UNE NOUVELLE CATEGORIE DE CODE : 'groupe'
--
--    Un code de groupe n'est pas public : il appartient a un eleve, il
--    ne vaut que pour SA matinee, et il meurt avec elle.
-- ---------------------------------------------------------------------
alter table public.codes_promo drop constraint if exists codes_promo_categorie_check;
alter table public.codes_promo
  add constraint codes_promo_categorie_check
  check (categorie in ('public', 'prof', 'ambassadeur', 'groupe'));

-- La matinee a laquelle le code est attache (TRIO39 : « la meme matinee »).
alter table public.codes_promo
  add column if not exists session_id uuid references public.sessions_bacs_blancs(id) on delete cascade;

-- L'inscription qui a fait naitre le code. C'est elle qu'on annule si le
-- compte n'y est pas au bout de 48 h.
alter table public.codes_promo
  add column if not exists genere_par uuid references public.inscriptions(id) on delete cascade;

-- L'heure limite. Null = le code ne perime pas (codes publics).
alter table public.codes_promo
  add column if not exists expire_a timestamptz;

-- Le modele dont ce code est une declinaison : 'TRIO39' pour un LEA39.
alter table public.codes_promo
  add column if not exists modele text references public.codes_promo(code) on delete set null;

create index if not exists codes_promo_session_idx on public.codes_promo (session_id);
create index if not exists codes_promo_genere_idx on public.codes_promo (genere_par);

-- Le code modele TRIO39 ne s'utilise plus directement : il sert de gabarit.
-- On le garde actif pour que le site puisse continuer a l'afficher, mais
-- `usages_max = 0` dit au moteur « celui-ci se decline, il ne s'applique pas ».
update public.codes_promo
   set usages_max = 0,
       note = 'Gabarit : à l''inscription, le premier élève reçoit SON code (LEA39) valable 48 h pour 2 camarades.',
       updated_at = now()
 where code = 'TRIO39';

-- ---------------------------------------------------------------------
-- 2. LES PACKS — ce qui manquait pour les rattacher a une inscription
-- ---------------------------------------------------------------------
alter table public.packs_eleve
  add column if not exists inscription_origine uuid references public.inscriptions(id) on delete set null;

-- Le nom de l'eleve, pour que la page Finances soit lisible sans jointure.
alter table public.packs_eleve add column if not exists nom text;

-- ---------------------------------------------------------------------
-- 3. CE QUE VOIT L'ELEVE DANS SON ESPACE
--
--    « Il te reste 2 matinées comprises dans ton pack. »
--    `matinees_restantes` est CALCULE : il ne peut pas diverger du nombre
--    d'inscriptions reellement posees sur le pack.
-- ---------------------------------------------------------------------
create or replace view public.v_packs_eleve as
select
  p.id,
  p.email,
  p.nom,
  p.code,
  c.libelle,
  p.matinees_total,
  count(i.id) filter (where i.paiement_statut <> 'annule')                  as matinees_utilisees,
  p.matinees_total - count(i.id) filter (where i.paiement_statut <> 'annule') as matinees_restantes,
  p.prix_paye,
  p.paiement_statut,
  p.achete_le,
  p.expire_le,
  (p.expire_le < current_date)                                             as perime
from public.packs_eleve p
left join public.codes_promo c on c.code = p.code
left join public.inscriptions i on i.pack_id = p.id
group by p.id, p.email, p.nom, p.code, c.libelle, p.matinees_total,
         p.prix_paye, p.paiement_statut, p.achete_le, p.expire_le;

-- ---------------------------------------------------------------------
-- 4. LES TRIOS EN COURS — ce que le planificateur relit toutes les 5 min
--
--    Une ligne par code de groupe encore vivant : combien se sont
--    inscrits, combien ont paye, et si l'heure limite est passee.
--    La decision (annuler, prevenir) est prise dans le code, pas ici :
--    une vue ne doit jamais envoyer d'e-mail.
-- ---------------------------------------------------------------------
create or replace view public.v_trios as
select
  c.code,
  c.libelle,
  c.session_id,
  c.genere_par,
  c.expire_a,
  c.actif,
  i0.email                                                          as email_initiateur,
  i0.nom                                                            as nom_initiateur,
  i0.paiement_statut                                                as statut_initiateur,
  -- L'initiateur compte dans le trio : son inscription porte deja le code.
  count(i.id) filter (where i.paiement_statut <> 'annule')           as inscrits,
  count(i.id) filter (where i.paiement_statut in ('paye', 'offert')) as payes,
  (now() > c.expire_a)                                              as delai_depasse
from public.codes_promo c
left join public.inscriptions i0 on i0.id = c.genere_par
left join public.inscriptions i on i.code_promo = c.code
where c.categorie = 'groupe'
group by c.code, c.libelle, c.session_id, c.genere_par, c.expire_a, c.actif,
         i0.email, i0.nom, i0.paiement_statut;

-- ---------------------------------------------------------------------
-- 5. CE QUE LIT LE CLASSEUR DE SUIVI FINANCIER
--
--    Un pack ne se lit pas sur une ligne d'inscription : la famille a
--    paye 139 EUR une fois pour trois matinees. Cette vue donne le
--    montant encaisse ET ce qui reste a livrer.
-- ---------------------------------------------------------------------
create or replace view public.v_packs_finance as
select
  p.code,
  count(*)                                                     as packs_vendus,
  sum(p.prix_paye) filter (where p.paiement_statut = 'paye')   as encaisse,
  sum(p.matinees_total)                                        as matinees_vendues,
  sum(v.matinees_utilisees)                                    as matinees_consommees,
  sum(v.matinees_restantes)                                    as matinees_a_livrer
from public.packs_eleve p
join public.v_packs_eleve v on v.id = p.id
group by p.code;

-- ---------------------------------------------------------------------
-- 6. VERIFICATION
-- ---------------------------------------------------------------------
select
  (select count(*) from public.codes_promo where categorie = 'groupe') as codes_de_groupe,
  (select usages_max from public.codes_promo where code = 'TRIO39')     as trio_gabarit,
  (select count(*) from public.packs_eleve)                             as packs,
  (select count(*) from public.v_trios)                                 as trios_suivis;
