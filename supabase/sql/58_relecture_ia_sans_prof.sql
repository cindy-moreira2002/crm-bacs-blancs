-- =====================================================================
--  58 - DEUXIEME LECTURE PAR L'IA, FILE "A REGARDER PAR CINDY",
--       PLAFOND DE DEPENSE JOURNALIER
--
--  Decision de Cindy (2026-09-29) : SES, HLP, LLCER anglais, SVT et
--  physique-chimie n'ont AUCUN prof relecteur. L'IA doit se relire seule.
--  Francais, philosophie, maths et HGGSP : rien ne change pour elles.
--
--  Ce fichier est IDEMPOTENT et 100 % ASCII (l'editeur SQL de Supabase
--  abime les accents colles depuis un Mac). Il se rejoue sans risque.
--
--  Ce qu'il pose :
--   1. colonnes de suivi sur corrections (compteurs de relances + file Cindy) ;
--   2. journal des deuxiemes lectures (relectures_ia) ;
--   3. plafond de depense IA par jour (ia_reglages + ia_depenses +
--      ia_budget_consommer) ;
--   4. aiguillage : transcription douteuse -> une relance puis file Cindy ;
--      correction terminee -> deuxieme lecture (Edge Function review-copy) ;
--   5. pipeline_invoquer_ia : relance d'une etape par review-copy.
--
--  Regle du code : voir supabase/functions/_shared/relecture-ia-noyau.ts.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Suivi sur la copie
-- ---------------------------------------------------------------------
alter table public.corrections
  add column if not exists ia_relances_transcription integer not null default 0,
  add column if not exists ia_recorrections          integer not null default 0,
  add column if not exists ia_relectures             integer not null default 0,
  add column if not exists a_regarder_cindy          boolean not null default false,
  add column if not exists a_regarder_motifs         jsonb,
  add column if not exists a_regarder_depuis         timestamptz,
  add column if not exists a_regarder_vu_le          timestamptz,
  add column if not exists a_regarder_vu_par         text;

create index if not exists corrections_a_regarder_cindy_idx
  on public.corrections (a_regarder_depuis)
  where a_regarder_cindy;

-- ---------------------------------------------------------------------
-- 2. Journal des deuxiemes lectures
-- ---------------------------------------------------------------------
create table if not exists public.relectures_ia (
  id                 uuid primary key default gen_random_uuid(),
  correction_id      uuid not null references public.corrections(id) on delete cascade,
  passe              integer not null,
  matiere            text,
  moteur             text,
  verdict            text not null check (verdict in ('confirmee', 'ajustee', 'echec')),
  note_avant         numeric,
  note_apres         numeric,
  bareme             numeric,
  changements        jsonb not null default '[]'::jsonb,
  motifs_persistants jsonb not null default '[]'::jsonb,
  suite              text check (suite in ('terminer', 'recorriger', 'file_cindy')),
  raison             text,
  synthese           text,
  modele             text,
  usage              jsonb,
  erreur             text,
  cree_le            timestamptz not null default now()
);
create index if not exists relectures_ia_correction_idx on public.relectures_ia (correction_id, cree_le);
alter table public.relectures_ia enable row level security;

-- ---------------------------------------------------------------------
-- 3. Plafond de depense
-- ---------------------------------------------------------------------
create table if not exists public.ia_reglages (
  id                    boolean primary key default true check (id),
  -- Unites par jour (heure de Paris). 1 unite ~ 1 appel au modele ~ 0,07 $.
  plafond_jour          integer not null default 400,
  -- Matieres SANS prof relecteur : deuxieme lecture + relances automatiques.
  matieres_relecture_ia text[] not null default array['ses', 'hlp', 'anglais', 'svt', 'physique-chimie'],
  maj_le                timestamptz not null default now()
);
insert into public.ia_reglages (id) values (true) on conflict (id) do nothing;
alter table public.ia_reglages enable row level security;

create table if not exists public.ia_depenses (
  id            bigserial primary key,
  le            timestamptz not null default now(),
  nature        text not null,
  unites        integer not null default 1,
  correction_id uuid,
  source        text
);
create index if not exists ia_depenses_le_idx on public.ia_depenses (le);
alter table public.ia_depenses enable row level security;

-- Debut du jour, heure de Paris.
create or replace function private.ia_debut_du_jour()
returns timestamptz
language sql
stable
set search_path to ''
as $$
  select (date_trunc('day', now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris';
$$;

-- Reserve des unites si le plafond du jour le permet, et le trace.
-- Refuse (ok = false) sans rien ecrire au-dela du plafond.
create or replace function public.ia_budget_consommer(
  p_nature        text,
  p_unites        integer default 1,
  p_correction_id uuid default null,
  p_source        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_max     integer;
  v_utilise integer;
  v_unites  integer := greatest(coalesce(p_unites, 1), 1);
begin
  -- Deux appels simultanes ne doivent pas passer tous les deux sous le plafond.
  perform pg_advisory_xact_lock(hashtext('ia_budget_consommer'));

  select plafond_jour into v_max from public.ia_reglages where id;
  v_max := coalesce(v_max, 400);

  select coalesce(sum(unites), 0) into v_utilise
  from public.ia_depenses
  where le >= private.ia_debut_du_jour();

  if v_utilise + v_unites > v_max then
    return jsonb_build_object(
      'ok', false, 'utilise', v_utilise, 'max', v_max,
      'message', format('Plafond IA du jour atteint (%s / %s unites). Reessaie demain, ou releve ia_reglages.plafond_jour.', v_utilise, v_max));
  end if;

  insert into public.ia_depenses (nature, unites, correction_id, source)
  values (coalesce(p_nature, 'inconnu'), v_unites, p_correction_id, p_source);

  return jsonb_build_object('ok', true, 'utilise', v_utilise + v_unites, 'max', v_max);
end;
$$;

-- Lecture seule : ou en est-on aujourd'hui ?
create or replace function public.ia_budget_etat()
returns jsonb
language sql
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'utilise', coalesce((select sum(unites) from public.ia_depenses where le >= private.ia_debut_du_jour()), 0),
    'max', coalesce((select plafond_jour from public.ia_reglages where id), 400));
$$;

revoke all on function public.ia_budget_consommer(text, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.ia_budget_etat() from public, anon, authenticated;
grant execute on function public.ia_budget_consommer(text, integer, uuid, text) to service_role;
grant execute on function public.ia_budget_etat() to service_role;

-- ---------------------------------------------------------------------
-- 4. Qui est concerne ?
-- ---------------------------------------------------------------------
create or replace function private.relecture_ia_matiere_concernee(
  p_matiere text, p_rubric_id text, p_exam_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select lower(coalesce(
           nullif(p_matiere, ''),
           (select r.matiere from public.rubrics r where r.id = p_rubric_id),
           (select e.matiere from public.exams e where e.id = p_exam_id),
           '')) = any (coalesce((select g.matieres_relecture_ia from public.ia_reglages g where g.id),
                                array['ses', 'hlp', 'anglais', 'svt', 'physique-chimie']));
$$;

-- ---------------------------------------------------------------------
-- 4a. Transcription : une relance, puis la file de Cindy.
--     Les branches existantes sont reprises MOT POUR MOT du SQL 42 ;
--     seule la branche "matiere sans prof" s'ajoute devant.
-- ---------------------------------------------------------------------
create or replace function private.auto_launch_french_correction()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_requires_review boolean;
  v_moteur          text;
  v_fonction        text;
  v_c               public.corrections%rowtype;
  v_budget          jsonb;
begin
  v_requires_review :=
    coalesce((new.transcription_json ->> 'requires_human_review')::boolean, false);

  select * into v_c from public.corrections where id = new.correction_id;
  v_moteur := v_c.moteur;

  if v_requires_review then
    -- NOUVEAU (SQL 58) : matieres sans prof relecteur. Personne ne viendra
    -- debloquer une lecture douteuse : on relit UNE fois, puis on la montre
    -- a Cindy au lieu de la laisser dormir.
    if not coalesce(v_c.est_etalon, false)
       and coalesce(v_c.moteur, 'grille_generique') in ('grille_generique', 'bareme_sujet')
       and private.relecture_ia_matiere_concernee(v_c.matiere, v_c.rubric_id, v_c.exam_id) then

      if coalesce(v_c.ia_relances_transcription, 0) < 1 then
        v_budget := public.ia_budget_consommer('retranscription', 1, new.correction_id, 'trigger');
        if coalesce((v_budget ->> 'ok')::boolean, false) then
          update public.corrections
          set status = 'transcribing',
              ia_relances_transcription = coalesce(ia_relances_transcription, 0) + 1,
              processing_error = null,
              updated_at = now()
          where id = new.correction_id;
          perform private.invoke_pipeline_edge('transcribe-french-copy', new.correction_id);
          return new;
        end if;
      end if;

      update public.corrections
      set status = 'transcription_review',
          a_regarder_cindy = true,
          a_regarder_depuis = now(),
          a_regarder_vu_le = null,
          a_regarder_vu_par = null,
          a_regarder_motifs = jsonb_build_array(jsonb_build_object(
            'nature', 'transcription',
            'code', 'transcription_douteuse',
            'message', case
              when coalesce(v_c.ia_relances_transcription, 0) >= 1
                then 'Lecture de la copie douteuse deux fois de suite : a regarder avant de corriger.'
              else 'Lecture de la copie douteuse ; relance impossible (plafond IA du jour atteint).'
            end,
            'raisons', coalesce(new.transcription_json -> 'review_reasons', '[]'::jsonb))),
          updated_at = now()
      where id = new.correction_id;
      return new;
    end if;

    update public.corrections
    set status = 'transcription_review', updated_at = now()
    where id = new.correction_id;
    return new;
  end if;

  update public.corrections
  set status = 'queued_correction', processing_error = null, updated_at = now()
  where id = new.correction_id;

  v_fonction := case
                  when v_moteur = 'brevet_francais'      then 'correct-brevet-francais'
                  when v_moteur = 'brevet_mathematiques' then 'correct-brevet-maths'
                  when v_moteur = 'bareme_sujet'         then 'correct-copy-bareme'
                  when v_moteur = 'criteres_rediges'     then 'correct-copy-redigee'
                  else 'correct-french-copy'
                end;

  perform private.invoke_pipeline_edge(v_fonction, new.correction_id);

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4b. Correction terminee -> deuxieme lecture.
--     On intercepte le passage "correcting -> corrected(_review)" : la copie
--     n'est reputee corrigee (et son dossier ne part) qu'apres la relecture.
-- ---------------------------------------------------------------------
create or replace function private.relecture_ia_apres_correction()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_budget jsonb;
begin
  if old.status is distinct from 'correcting'
     or new.status not in ('corrected', 'corrected_review') then
    return new;
  end if;
  if coalesce(new.est_etalon, false)
     or coalesce(new.moteur, 'grille_generique') not in ('grille_generique', 'bareme_sujet')
     or not private.relecture_ia_matiere_concernee(new.matiere, new.rubric_id, new.exam_id) then
    return new;
  end if;

  v_budget := public.ia_budget_consommer('relecture', 1, new.id, 'trigger');
  if not coalesce((v_budget ->> 'ok')::boolean, false) then
    new.status := 'corrected_review';
    new.a_regarder_cindy := true;
    new.a_regarder_depuis := now();
    new.a_regarder_vu_le := null;
    new.a_regarder_vu_par := null;
    new.a_regarder_motifs := jsonb_build_array(jsonb_build_object(
      'nature', 'systeme', 'code', 'plafond_ia',
      'message', 'Plafond IA du jour atteint : la deuxieme lecture n''a pas ete faite.'));
    return new;
  end if;

  new.status := 'queued_review';
  perform private.invoke_pipeline_edge('review-copy', new.id);
  return new;
end;
$$;

drop trigger if exists trg_relecture_ia on public.corrections;
create trigger trg_relecture_ia
  before update of status on public.corrections
  for each row execute function private.relecture_ia_apres_correction();

-- ---------------------------------------------------------------------
-- 5. Relancer une etape depuis review-copy (service_role uniquement)
-- ---------------------------------------------------------------------
create or replace function public.pipeline_invoquer_ia(p_fonction text, p_correction_id uuid)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_fonction not in ('correct-french-copy', 'correct-copy-bareme', 'review-copy', 'transcribe-french-copy') then
    raise exception 'Fonction non autorisee : %', p_fonction;
  end if;
  return private.invoke_pipeline_edge(p_fonction, p_correction_id);
end;
$$;
revoke all on function public.pipeline_invoquer_ia(text, uuid) from public, anon, authenticated;
grant execute on function public.pipeline_invoquer_ia(text, uuid) to service_role;

commit;

-- =====================================================================
--  RETOUR ARRIERE (ne pas jouer sauf besoin) :
--    drop trigger if exists trg_relecture_ia on public.corrections;
--    puis rejouer le BLOC 10 du SQL 42 (auto_launch_french_correction).
--  Relever le plafond :
--    update public.ia_reglages set plafond_jour = 600, maj_le = now();
-- =====================================================================
