-- =====================================================================
--  PUBLICATION AUTOMATIQUE DU SUJET AUX ELEVES
--
--  OU  : Supabase, projet CRM (NEXT_PUBLIC_SUPABASE_URL, orpbfnmdlvxmkvyrpvtj)
--        — PAS le projet du pipeline de correction.
--  QUAND : apres 41_bacs_blancs_pilotage.sql (tables session_sujets /
--        session_retours). SQL Editor > New query > coller TOUT > Run.
--
--  CE QUE CELA FAIT, ET POURQUOI
--
--  Le sujet d'un bac blanc est deja depose par l'administratrice et visible
--  du professeur qui surveille (41_...). Il restait invisible de l'eleve, et
--  le rendre visible a la main le jour J, a l'heure exacte, pour chaque
--  session, n'est pas tenable.
--
--  Trois pieces :
--
--  1. sessions_bacs_blancs.debut_le — l'heure de debut REELLE.
--     `heure_debut` est du TEXTE ('9h', '9 h 30') : on ne peut pas en
--     soustraire dix minutes. On ajoute donc un vrai timestamptz, rempli
--     automatiquement a partir de la date et de l'heure texte, en heure de
--     Paris. Le texte reste, il est ce que lisent les humains.
--
--  2. session_sujets — quatre colonnes de publication :
--       publication_active : l'administratrice a ARME la publication. Sans
--                            cela, rien ne part : un sujet depose trois
--                            semaines avant ne doit pas s'ouvrir tout seul.
--       minutes_avant      : combien de minutes avant le debut (defaut 10).
--       publier_le         : heure imposee a la main, qui prime sur le calcul.
--       visible_eleve      : le drapeau que lit l'espace eleve.
--       publie_le          : quand la bascule a eu lieu (trace).
--
--  3. publier_sujets_dus() + pg_cron toutes les minutes.
--     Toutes les minutes, et non toutes les cinq comme les e-mails : a cinq
--     minutes pres, « dix minutes avant » n'a plus de sens.
--
--  GARDE-FOU CENTRAL : seuls les enregistrements `type = 'sujet'` peuvent
--  devenir visibles des eleves. Un corrige ou un bareme depose sur la meme
--  session ne peut pas basculer, meme si quelqu'un arme la publication
--  dessus. C'est verifie ici, dans la fonction, et une seconde fois dans le
--  code de lecture (src/lib/bacsBlancs.ts).
--
--  Idempotent : rejouable sans risque.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  1. L'HEURE DE DEBUT REELLE
-- ---------------------------------------------------------------------

alter table public.sessions_bacs_blancs
  add column if not exists debut_le timestamptz;

comment on column public.sessions_bacs_blancs.debut_le is
  'Debut reel de l''epreuve (heure de Paris). Calcule depuis date_epreuve + heure_debut, ou saisi a la main. C''est la seule base du calcul de publication.';

-- Parse '9h', '9 h 30', '09:30', '14h00', '8h05' -> minutes depuis minuit.
-- Renvoie NULL si la chaine n'est pas exploitable : mieux vaut ne rien
-- publier que publier a une heure inventee.
create or replace function public.heure_texte_en_minutes(brut text)
returns integer
language plpgsql
immutable
as $$
declare
  m text[];
  h integer;
  mn integer;
begin
  if brut is null then return null; end if;
  m := regexp_match(lower(trim(brut)), '^([0-9]{1,2})\s*[h:]\s*([0-9]{1,2})?');
  if m is null then return null; end if;
  h  := m[1]::integer;
  mn := coalesce(nullif(m[2], '')::integer, 0);
  if h > 23 or mn > 59 then return null; end if;
  return h * 60 + mn;
end;
$$;

-- Le calcul, en heure de Paris : 9h le 12 mars, c'est 08:00 UTC en hiver et
-- 07:00 UTC en ete. `at time zone` s'en occupe, pas nous.
create or replace function public.calculer_debut_le(d date, heure text)
returns timestamptz
language sql
immutable
as $$
  select case
    when d is null or public.heure_texte_en_minutes(heure) is null then null
    else ((d + make_interval(mins => public.heure_texte_en_minutes(heure)))
          at time zone 'Europe/Paris')
  end;
$$;

-- Remplissage des sessions existantes qui n'ont pas encore d'heure reelle.
update public.sessions_bacs_blancs
   set debut_le = public.calculer_debut_le(date_epreuve, heure_debut)
 where debut_le is null
   and public.calculer_debut_le(date_epreuve, heure_debut) is not null;

-- Et pour la suite : toute session creee ou dont la date/l'heure change voit
-- son debut_le recalcule — sauf si l'administratrice l'a fixe elle-meme.
create or replace function public.sessions_bacs_blancs_debut()
returns trigger
language plpgsql
as $$
declare
  calcule timestamptz;
begin
  calcule := public.calculer_debut_le(new.date_epreuve, new.heure_debut);

  if tg_op = 'INSERT' then
    if new.debut_le is null then new.debut_le := calcule; end if;
    return new;
  end if;

  -- UPDATE : on ne recalcule que si la date ou l'heure a bouge ET que
  -- personne n'a pose debut_le a la main dans la meme requete.
  if new.debut_le is not distinct from old.debut_le
     and (new.date_epreuve is distinct from old.date_epreuve
          or new.heure_debut is distinct from old.heure_debut)
     and (old.debut_le is null
          or old.debut_le = public.calculer_debut_le(old.date_epreuve, old.heure_debut))
  then
    new.debut_le := calcule;
  end if;

  return new;
end;
$$;

drop trigger if exists sessions_bacs_blancs_debut_trg on public.sessions_bacs_blancs;
create trigger sessions_bacs_blancs_debut_trg
  before insert or update on public.sessions_bacs_blancs
  for each row execute function public.sessions_bacs_blancs_debut();

-- ---------------------------------------------------------------------
--  2. LES COLONNES DE PUBLICATION
-- ---------------------------------------------------------------------

alter table public.session_sujets
  add column if not exists publication_active boolean not null default false,
  add column if not exists minutes_avant      integer not null default 10,
  add column if not exists publier_le         timestamptz,
  add column if not exists visible_eleve      boolean not null default false,
  add column if not exists publie_le          timestamptz;

comment on column public.session_sujets.publication_active is
  'La publication est armee. Sans cela, le sujet ne part jamais tout seul.';
comment on column public.session_sujets.minutes_avant is
  'Minutes avant le debut de l''epreuve. 10 par defaut, reglable par sujet.';
comment on column public.session_sujets.publier_le is
  'Heure de publication imposee a la main. Prime sur le calcul debut_le - minutes_avant.';
comment on column public.session_sujets.visible_eleve is
  'Le sujet est ouvert aux eleves inscrits a la session. Bascule par le planificateur, ou a la main.';

alter table public.session_sujets
  drop constraint if exists session_sujets_minutes_avant_valides;
alter table public.session_sujets
  add constraint session_sujets_minutes_avant_valides
  check (minutes_avant between 0 and 1440);

-- Un corrige ne s'ouvre pas aux eleves. La regle est dans la base, pas
-- seulement dans le code : une fausse manoeuvre en SQL est rattrapee ici.
alter table public.session_sujets
  drop constraint if exists session_sujets_eleves_sujet_seulement;
alter table public.session_sujets
  add constraint session_sujets_eleves_sujet_seulement
  check (visible_eleve = false or type = 'sujet');

create index if not exists session_sujets_publication_idx
  on public.session_sujets (publication_active, visible_eleve);

-- ---------------------------------------------------------------------
--  3. QUAND CHAQUE SUJET DOIT S'OUVRIR
-- ---------------------------------------------------------------------

create or replace view public.v_sujets_publication as
select
  s.id                as sujet_id,
  s.session_id,
  s.type,
  s.titre,
  s.fichier_nom,
  s.publication_active,
  s.minutes_avant,
  s.visible_eleve,
  s.publie_le,
  ses.matiere,
  ses.date_epreuve,
  ses.heure_debut,
  ses.debut_le,
  coalesce(s.publier_le, ses.debut_le - make_interval(mins => s.minutes_avant))
                      as publication_prevue
from public.session_sujets s
join public.sessions_bacs_blancs ses on ses.id = s.session_id;

comment on view public.v_sujets_publication is
  'Chaque sujet avec l''heure a laquelle il doit s''ouvrir aux eleves. Lecture seule, pour la page de pilotage et pour le controle.';

-- ---------------------------------------------------------------------
--  4. LE PLANIFICATEUR
-- ---------------------------------------------------------------------

create or replace function public.publier_sujets_dus()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  bascules integer;
begin
  with dus as (
    select s.id
    from public.session_sujets s
    join public.sessions_bacs_blancs ses on ses.id = s.session_id
    where s.type = 'sujet'                     -- jamais un corrige, jamais un bareme
      and s.publication_active                 -- armee par l'administratrice
      and not s.visible_eleve                  -- pas deja ouverte
      and s.fichier_path is not null           -- un sujet sans fichier n'ouvre rien
      and ses.debut_le is not null             -- sans heure reelle, on ne devine pas
      and coalesce(s.publier_le,
                   ses.debut_le - make_interval(mins => s.minutes_avant)) <= now()
    for update of s skip locked
  )
  update public.session_sujets s
     set visible_eleve = true,
         publie_le     = now()
    from dus
   where s.id = dus.id;

  get diagnostics bascules = row_count;
  return bascules;
end;
$$;

comment on function public.publier_sujets_dus() is
  'Ouvre aux eleves les sujets dont l''heure est venue. Renvoie le nombre de bascules. Appelee chaque minute par pg_cron.';

create extension if not exists pg_cron;

select cron.unschedule('sujets-publication')
where exists (select 1 from cron.job where jobname = 'sujets-publication');

select cron.schedule(
  'sujets-publication',
  '* * * * *',
  $job$ select public.publier_sujets_dus(); $job$
);

-- ---------------------------------------------------------------------
--  5. QUI A TELECHARGE QUOI
--
--  Un sujet d'examen qui circule dix minutes avant l'epreuve, cela se
--  retrace. Une ligne par telechargement, sans autre donnee que l'adresse
--  de l'eleve deja connue du CRM.
-- ---------------------------------------------------------------------

create table if not exists public.sujet_telechargements (
  id         uuid primary key default gen_random_uuid(),
  sujet_id   uuid not null references public.session_sujets(id) on delete cascade,
  session_id uuid not null references public.sessions_bacs_blancs(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create index if not exists sujet_telechargements_sujet_idx
  on public.sujet_telechargements (sujet_id, created_at desc);

alter table public.sujet_telechargements enable row level security;

commit;

-- =====================================================================
--  VERIFICATION
-- =====================================================================

-- a) Les heures de debut ont-elles ete calculees ?
select matiere, date_epreuve, heure_debut, debut_le
from public.sessions_bacs_blancs
order by date_epreuve desc
limit 10;

-- b) Les sessions dont l'heure texte n'a pas pu etre lue (a corriger a la main) :
select id, matiere, date_epreuve, heure_debut
from public.sessions_bacs_blancs
where debut_le is null;

-- c) Ce qui va s'ouvrir, et quand :
select matiere, titre, type, publication_active, minutes_avant,
       debut_le, publication_prevue, visible_eleve, publie_le
from public.v_sujets_publication
order by publication_prevue nulls last;

-- d) La tache tourne-t-elle ?
select jobid, jobname, schedule, active from cron.job where jobname = 'sujets-publication';

-- Pour l'arreter un jour :  select cron.unschedule('sujets-publication');
-- Pour publier tout de suite ce qui est du :  select public.publier_sujets_dus();
