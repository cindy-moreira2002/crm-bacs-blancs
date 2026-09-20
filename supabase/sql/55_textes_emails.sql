-- =====================================================================
--  55 - TEXTES D'E-MAILS MODIFIABLES DEPUIS LA CONSOLE
--
--  OU : Supabase, projet CRM orpbfnmdlvxmkvyrpvtj.
--  A coller dans le SQL Editor. Idempotent : rejouable sans dommage.
--
--  Decision de Cindy, 20 septembre 2026 : pouvoir corriger le texte d'un
--  e-mail depuis /direction/emails, sans ouvrir le code.
--
--  Modele retenu : PAR ZONES. Cinq zones seulement, celles ou une
--  correction ne peut rien casser :
--
--    sujet        - l'objet du message
--    titre        - le grand titre en haut
--    intro        - un paragraphe ajoute AVANT le corps
--    postscriptum - un paragraphe ajoute APRES les boutons
--    signature    - la formule de fin
--
--  Le corps lui-meme (encadres, listes, cadre de virement, boutons) reste
--  dans le code : c'est lui qui porte les variables obligatoires, et une
--  variable mal recopiee enverrait « Bonjour undefined ».
--
--  Une zone absente = le texte d'origine s'applique. Supprimer la ligne
--  suffit donc a revenir en arriere.
-- =====================================================================

do $$
begin
  if to_regclass('public.email_reglages') is null then
    raise exception 'STOP: table email_reglages absente. Tu es probablement dans le mauvais projet Supabase.';
  end if;
end $$;

create table if not exists public.email_textes (
  type       text not null,
  cle        text not null check (cle in ('sujet', 'titre', 'intro', 'postscriptum', 'signature')),
  valeur     text not null,
  -- Qui a ecrit ca, et quand. Un texte commercial se relit a plusieurs.
  modifie_par text,
  updated_at timestamptz not null default now(),
  primary key (type, cle)
);

create index if not exists email_textes_type_idx on public.email_textes (type);

-- Le declencheur d'horodatage existe deja pour email_reglages : on le
-- reutilise s'il est la, sinon on le cree.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    create function public.touch_updated_at() returns trigger as $f$
    begin
      new.updated_at = now();
      return new;
    end $f$ language plpgsql;
  end if;
end $$;

drop trigger if exists email_textes_touch on public.email_textes;
create trigger email_textes_touch before update on public.email_textes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  VERIFICATION
-- ---------------------------------------------------------------------
select
  (select count(*) from public.email_textes) as textes_personnalises,
  (select count(distinct type) from public.email_textes) as modeles_touches;
