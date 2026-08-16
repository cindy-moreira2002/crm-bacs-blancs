-- =====================================================================
--  UN CODE D'AFFILIATION POUR CHAQUE PROF, MEME CREE A LA MAIN
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj.
--  Idempotent : rejouable sans rien casser.
--
--  Pourquoi : `professeurs.code_affiliation` est `not null unique`. Une fiche
--  posee a la main dans le SQL Editor sans ce champ echouait avec un message
--  incomprehensible ; une fiche posee avec un code invente pouvait entrer en
--  collision avec un autre prof. Desormais la base fabrique le code toute
--  seule quand il manque : PRENOM (8 lettres max, sans accents) + 4
--  caracteres tires au sort, exactement comme le fait l'application.
--
--  Attendu a la fin : le bloc de verification affiche 0 prof sans code.
-- =====================================================================

do $$
begin
  if to_regclass('public.professeurs') is null then
    raise exception 'STOP: table public.professeurs absente. Mauvais projet Supabase.';
  end if;
end $$;

create or replace function public.fabriquer_code_affiliation(prenom text)
returns text
language plpgsql
as $$
declare
  base text;
  suffixe text;
  candidat text;
begin
  -- unaccent n'est pas garanti installe : on translitere les lettres qu'on
  -- rencontre vraiment dans des prenoms francais.
  base := upper(regexp_replace(
    translate(coalesce(prenom, ''), 'àâäãáçéèêëíìîïñóòôöõúùûüýÀÂÄÃÁÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
                                   'aaaaaceeeeiiiinooooouuuuyAAAAACEEEEIIIINOOOOOUUUUY'),
    '[^a-zA-Z]', '', 'g'));
  base := left(nullif(base, ''), 8);
  if base is null then base := 'COACH'; end if;

  for i in 1..20 loop
    suffixe := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    candidat := base || suffixe;
    exit when not exists (
      select 1 from public.professeurs where upper(code_affiliation) = candidat
    );
  end loop;

  return candidat;
end $$;

create or replace function public.professeurs_code_auto()
returns trigger
language plpgsql
as $$
begin
  if new.code_affiliation is null or btrim(new.code_affiliation) = '' then
    new.code_affiliation := public.fabriquer_code_affiliation(new.prenom);
  else
    -- Un code se compare toujours en majuscules : on le range comme tel.
    new.code_affiliation := upper(regexp_replace(new.code_affiliation, '\s', '', 'g'));
  end if;
  return new;
end $$;

drop trigger if exists professeurs_code_auto_trg on public.professeurs;
create trigger professeurs_code_auto_trg
  before insert on public.professeurs
  for each row execute function public.professeurs_code_auto();

-- Rattrapage : les fiches deja posees sans code (s'il y en a).
update public.professeurs
   set code_affiliation = public.fabriquer_code_affiliation(prenom)
 where code_affiliation is null or btrim(code_affiliation) = '';

-- ---------------------------------------------------------------------
-- VERIFICATION
-- ---------------------------------------------------------------------
select
  count(*) filter (where code_affiliation is null or btrim(code_affiliation) = '') as profs_sans_code,
  count(*)                                                                          as profs_total,
  count(distinct upper(code_affiliation))                                           as codes_distincts
from public.professeurs;
