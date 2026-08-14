-- 45 — Le salon Discord de chaque élève
--
-- Jusqu'ici, les salles Discord n'existaient que sur Discord : le module les
-- retrouvait par leur NOM, calculé à partir du nom de l'élève. Deux élèves
-- homonymes, un accent, un nom corrigé après coup, et le rapprochement se
-- défaisait en silence — sans qu'on puisse dire quel élève avait perdu sa salle.
--
-- On note donc, sur l'inscription elle-même, l'identifiant du salon qui lui a
-- été attribué. Cet identifiant devient la source unique :
--   · l'espace élève y lit le lien qu'il affiche ;
--   · l'e-mail « Lien de visioconférence » y lit le lien qu'il envoie ;
--   · le tableau de bord y lit « ce lien est-il bien déposé ? ».
-- Les trois disent forcément la même chose, puisqu'ils lisent la même colonne.
--
-- Rejouable sans risque : relancer ce script n'efface rien et ne recrée rien.
-- Aucune donnée existante n'est modifiée — les colonnes naissent vides, et se
-- remplissent au premier « Préparer les salles ».

-- --- L'inscription porte son salon ------------------------------------

alter table public.inscriptions
  add column if not exists discord_salon_id text;

alter table public.inscriptions
  add column if not exists discord_salon_nom text;

alter table public.inscriptions
  add column if not exists discord_salon_pose_le timestamptz;

comment on column public.inscriptions.discord_salon_id is
  'Identifiant du salon vocal Discord de cet élève. Renseigné par « Préparer les salles ». Vide = l''élève n''a pas encore de salle, et ni son espace ni son e-mail ne montreront de lien.';

comment on column public.inscriptions.discord_salon_nom is
  'Nom du salon au moment où il a été attribué. Sert uniquement à s''y retrouver à l''œil sur Discord ; le rapprochement se fait sur l''identifiant.';

comment on column public.inscriptions.discord_salon_pose_le is
  'Quand la salle a été attribuée à cet élève.';

-- --- La session porte sa catégorie ------------------------------------

alter table public.sessions_bacs_blancs
  add column if not exists discord_categorie_id text;

comment on column public.sessions_bacs_blancs.discord_categorie_id is
  'Identifiant de la catégorie Discord du bac blanc. C''est le lien que reçoit le professeur : il ouvre le bloc de l''épreuve, d''où il circule entre les salles.';

-- --- Retrouver vite un salon ------------------------------------------

create index if not exists inscriptions_discord_salon_idx
  on public.inscriptions (discord_salon_id)
  where discord_salon_id is not null;

-- --- Vérification -----------------------------------------------------
-- Doit afficher les 4 colonnes ci-dessous. Si l'une manque, le script n'a pas
-- été exécuté en entier : relance-le, il est rejouable.

select
  table_name  as "table",
  column_name as "colonne",
  data_type   as "type"
from information_schema.columns
where (table_name = 'inscriptions'
        and column_name in ('discord_salon_id', 'discord_salon_nom', 'discord_salon_pose_le'))
   or (table_name = 'sessions_bacs_blancs'
        and column_name = 'discord_categorie_id')
order by table_name, column_name;
