-- 46 — Le compte Discord de chaque personne
--
-- Le script 45 a donné une salle à chaque élève. Il manquait la moitié qui
-- ouvre la porte : Discord ne sait pas qui est « Léa Martin ». Une salle privée
-- n'autorise que des identifiants Discord — sans eux, l'élève clique sur son
-- lien et ne voit rien du tout.
--
-- On note donc, sur l'inscription et sur la fiche du professeur, l'identifiant
-- Discord de la personne, obtenu quand elle clique « Relier mon compte Discord »
-- depuis son espace. Cet identifiant sert à trois choses, et à rien d'autre :
--   · ajouter la personne au serveur sans qu'elle ait à chercher une invitation ;
--   · pour un élève : l'autoriser sur SA salle, et sur aucune autre ;
--   · pour un prof : lui poser le rôle « Prof », qui ouvre la zone ÉQUIPE.
--
-- L'identifiant Discord n'est pas un secret : c'est un numéro public, visible
-- de quiconque active le mode développeur. Ce qui protège une salle, ce sont
-- ses permissions, pas l'ignorance de ce numéro.
--
-- Rejouable sans risque : relancer ce script n'efface rien. Les colonnes
-- naissent vides et se remplissent au premier compte relié.

-- --- L'élève porte son compte Discord ----------------------------------

alter table public.inscriptions
  add column if not exists discord_user_id text;

alter table public.inscriptions
  add column if not exists discord_relie_le timestamptz;

alter table public.inscriptions
  add column if not exists discord_acces_pose_le timestamptz;

comment on column public.inscriptions.discord_user_id is
  'Identifiant Discord de l''élève, obtenu quand il relie son compte depuis son espace. Vide = il peut voir le lien de sa salle mais pas y entrer.';

comment on column public.inscriptions.discord_relie_le is
  'Quand l''élève a relié son compte Discord.';

comment on column public.inscriptions.discord_acces_pose_le is
  'Quand l''autorisation a été écrite sur SA salle. Vide alors que discord_user_id et discord_salon_id sont remplis = il reste un accès à poser (« Préparer les salles » le fait).';

-- --- Le professeur porte son compte Discord ----------------------------

alter table public.professeurs
  add column if not exists discord_user_id text;

alter table public.professeurs
  add column if not exists discord_relie_le timestamptz;

comment on column public.professeurs.discord_user_id is
  'Identifiant Discord du professeur. Dès qu''il est posé, le rôle « Prof » lui est attribué automatiquement : c''est lui qui ouvre la zone ÉQUIPE et toutes les salles d''élèves.';

comment on column public.professeurs.discord_relie_le is
  'Quand le professeur a relié son compte Discord.';

-- --- Retrouver une personne par son compte Discord ---------------------

create index if not exists inscriptions_discord_user_idx
  on public.inscriptions (discord_user_id)
  where discord_user_id is not null;

-- --- Vérification -----------------------------------------------------
-- Doit afficher les 5 colonnes ci-dessous. Si l'une manque, le script n'a pas
-- été exécuté en entier : relance-le, il est rejouable.

select
  table_name  as "table",
  column_name as "colonne",
  data_type   as "type"
from information_schema.columns
where (table_name = 'inscriptions'
        and column_name in ('discord_user_id', 'discord_relie_le', 'discord_acces_pose_le'))
   or (table_name = 'professeurs'
        and column_name in ('discord_user_id', 'discord_relie_le'))
order by table_name, column_name;
