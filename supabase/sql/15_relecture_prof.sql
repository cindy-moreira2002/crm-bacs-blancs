-- =====================================================================
--  DOSSIER DE RELECTURE PROF - TABLE DES REPONSES
--
--  OU  : Supabase, projet "matineesdubac" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Pourquoi : la page /relecture/[matiere] du CRM montre a un professeur
--  le bareme, la taxonomie d'erreurs et une copie corrigee, puis lui pose
--  trois questions. Ses reponses arrivent ici via /api/relecture.
--
--  A JOUER AVANT de deployer la page (sinon l'envoi du formulaire
--  echouera avec un message propre, mais echouera quand meme).
--
--  100% ASCII : l'editeur SQL de Supabase abime les accents colles
--  depuis un Mac.
-- =====================================================================


-- =====================================================================
--  BLOC A - LA TABLE
--  Attendu : "Success. No rows returned", puis 1 ligne "relecture_feedback".
-- =====================================================================

begin;

create table if not exists public.relecture_feedback (
  id            uuid primary key default gen_random_uuid(),
  matiere       text not null,
  prof_nom      text not null,
  prof_email    text not null,
  etablissement text,
  -- Reponses libres aux trois questions :
  --   bareme_choix / bareme_commentaire
  --   copie_choix  / copie_commentaire
  --   taxonomie_commentaire
  reponses      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists relecture_feedback_matiere_idx
  on public.relecture_feedback (matiere, created_at desc);

-- Seule la cle service_role (cote serveur du CRM) lit et ecrit :
-- RLS active sans aucune policy = porte fermee pour les cles publiques.
alter table public.relecture_feedback enable row level security;

commit;

select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'relecture_feedback';


-- =====================================================================
--  BLOC B - VERIFICATION (a rejouer quand des profs auront repondu)
--  Attendu maintenant : 0 ligne. Plus tard : une ligne par reponse.
-- =====================================================================

select matiere, prof_nom, etablissement, created_at,
       reponses->>'bareme_choix'  as bareme,
       reponses->>'copie_choix'   as copie,
       left(reponses->>'taxonomie_commentaire', 80) as taxonomie_debut
from public.relecture_feedback
order by created_at desc;
