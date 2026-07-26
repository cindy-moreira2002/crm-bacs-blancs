-- =====================================================================
--  RENDRE LE PIPELINE VRAIMENT MULTI-MATIERES
--
--  OU  : Supabase, projet "matineesdubac" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Pourquoi cette migration :
--  dossier_templates avait deja une colonne "matiere" (le dossier de
--  l'eleve choisit deja son gabarit par matiere). Mais subject_cards et
--  rubrics n'avaient PAS cette colonne : la mise en relation sujet <->
--  bareme se faisait seulement par track+exercise_type. Tant qu'il n'y
--  avait que le francais ca marchait. Des qu'une 2e matiere partage un
--  meme nom d'epreuve (ex: "dissertation" existe en francais ET en
--  philosophie), l'application aurait pu associer le mauvais bareme
--  sans aucune erreur visible. Cette migration ajoute la colonne
--  manquante et corrige la mise en relation.
--
--  Meme geste que d'habitude : coller un bloc, Run, lire le resultat,
--  bloc suivant. 100% ASCII (l'editeur SQL de Supabase abime les
--  accents colles depuis un Mac).
-- =====================================================================


-- =====================================================================
--  BLOC A - AJOUTER LA COLONNE MATIERE OU ELLE MANQUE
--  Attendu : "Success. No rows returned", puis 2 lignes ci-dessous.
-- =====================================================================

begin;

alter table public.subject_cards add column if not exists matiere text;
alter table public.rubrics       add column if not exists matiere text;

create index if not exists subject_cards_matiere_idx on public.subject_cards (matiere);
create index if not exists rubrics_matiere_idx        on public.rubrics (matiere);

commit;

select 'subject_cards' as table_name, column_name from information_schema.columns
where table_schema='public' and table_name='subject_cards' and column_name='matiere'
union all
select 'rubrics', column_name from information_schema.columns
where table_schema='public' and table_name='rubrics' and column_name='matiere';


-- =====================================================================
--  BLOC B - RENSEIGNER LA MATIERE DES 2 SUJETS FRANCAIS EXISTANTS
--  Sans ce backfill, le francais lui-meme deviendrait invisible dans
--  l'ecran de depot des que le filtre par matiere sera actif.
--  Attendu : "Success. No rows returned", puis 2 lignes "francais".
-- =====================================================================

begin;

update public.subject_cards set matiere = 'francais'
where id in ('FR-COM-2025-ENSORCELEE', 'FR-DISS-MUSSET-BADINE') and matiere is null;

update public.rubrics set matiere = 'francais'
where id in ('fr_commentaire_general_v1', 'fr_dissertation_general_v1') and matiere is null;

commit;

select id, matiere from public.subject_cards where matiere is not null order by id;
select id, matiere from public.rubrics       where matiere is not null order by id;


-- =====================================================================
--  BLOC C - LA GRILLE DEVIENT LA SEULE SOURCE DE L'"EXPERTISE" DE
--  CORRECTION (au lieu d'un texte fige dans le code de la fonction).
--
--  generate-dossier fonctionnait deja ainsi (dossier_templates.
--  system_prompt). correct-french-copy, elle, avait la phrase
--  "Tu es un correcteur expert ... de francais, specialise dans le
--  commentaire litteraire" ECRITE EN DUR dans le code, meme pour
--  corriger une dissertation. On la deplace dans les donnees, comme
--  le reste, et on l'ecrit correctement pour chacune des 2 grilles.
--
--  Les valeurs sont deja encodees pour eviter tout probleme d'accent.
--  Attendu : "Success. No rows returned", puis 2 lignes non vides.
-- =====================================================================

begin;

alter table public.rubrics add column if not exists system_prompt text;

update public.rubrics set system_prompt = convert_from(decode(
  '547520657320756e20636f727265637465757220657870657274206465206ce28099c3a970726575766520616e7469636970c3a965206465206672616ec3a76169732c207370c3a96369616c6973c3a92064616e73206c6520636f6d6d656e7461697265206c697474c3a972616972652e205475206170706c6971756573206578636c75736976656d656e74206c61206772696c6c6520666f75726e69652e205475206ee28099696e76656e74657320617563756e2063726974c3a87265206574207475206e652073616e6374696f6e6e657320706173206465757820666f6973206c61206dc3aa6d6520666169626c657373652e205475206ee28099696d706f73657320617563756e20706c616e20756e697175652e2054752064697374696e6775657320746f756a6f75727320726570c3a9726167652c20616e616c79736520657420696e7465727072c3a9746174696f6e2e204368617175652073636f726520646f697420c3aa74726520736f7574656e7520706172206465732070726575766573206c6f63616c697361626c65732064616e73206c61207472616e736372697074696f6e2e204c6120736f6d6d65206465732063726974c3a872657320646f6974206578616374656d656e7420636f72726573706f6e64726520c3a0206c61206e6f74652066696e616c652e204c657320636f7069657320c3a974616c6f6e732073657276656e7420617520706f736974696f6e6e656d656e7420676c6f62616c2c206d616973206c65757273206e6f746573206e6520646f6976656e74206a616d61697320c3aa747265207265636f7069c3a96573206dc3a963616e697175656d656e742e20456e206361732064e28099696e636572746974756465206465206c6563747572652c20646520636f6e74726164696374696f6e206f75206465206361732061747970697175652c2064656d616e646520756e652076c3a972696669636174696f6e2068756d61696e652e',
  'hex'), 'UTF8')
where id = 'fr_commentaire_general_v1';

update public.rubrics set system_prompt = convert_from(decode(
  '547520657320756e20636f727265637465757220657870657274206465206ce28099c3a970726575766520616e7469636970c3a965206465206672616ec3a76169732c207370c3a96369616c6973c3a92064616e73206c6120646973736572746174696f6e2e205475206170706c6971756573206578636c75736976656d656e74206c61206772696c6c6520666f75726e69652e205475206ee28099696e76656e74657320617563756e2063726974c3a87265206574207475206e652073616e6374696f6e6e657320706173206465757820666f6973206c61206dc3aa6d6520666169626c657373652e205475206ee28099696d706f73657320617563756e20706c616e20756e6971756520657420747520616363657074657320746f7574652070726f626cc3a96d6174697175652070657274696e656e7465207175692072c3a9706f6e642061752073756a65742e20547520c3a976616c756573206c6120636f6e6e61697373616e6365207072c3a963697365206465206ce28099c5937576726520657420647520706172636f7572732c206c61207175616c6974c3a9206465206ce28099617267756d656e746174696f6e206574206ce280996578706c6f69746174696f6e2072c3a9656c6c6520646573206578656d706c65732c20706173206c6575722073696d706c65206369746174696f6e2e204368617175652073636f726520646f697420c3aa74726520736f7574656e7520706172206465732070726575766573206c6f63616c697361626c65732064616e73206c61207472616e736372697074696f6e2e204c6120736f6d6d65206465732063726974c3a872657320646f6974206578616374656d656e7420636f72726573706f6e64726520c3a0206c61206e6f74652066696e616c652e204c657320636f7069657320c3a974616c6f6e732073657276656e7420617520706f736974696f6e6e656d656e7420676c6f62616c2c206d616973206c65757273206e6f746573206e6520646f6976656e74206a616d61697320c3aa747265207265636f7069c3a96573206dc3a963616e697175656d656e742e20456e206361732064e28099696e636572746974756465206465206c6563747572652c20646520636f6e74726164696374696f6e206f75206465206361732061747970697175652c2064656d616e646520756e652076c3a972696669636174696f6e2068756d61696e652e',
  'hex'), 'UTF8')
where id = 'fr_dissertation_general_v1';

commit;

select id, length(system_prompt) as taille, left(system_prompt, 60) as debut
from public.rubrics
where id in ('fr_commentaire_general_v1','fr_dissertation_general_v1')
order by id;


-- =====================================================================
--  BLOC D - VERIFICATION FINALE
--  Attendu : 2 lignes, matiere='francais' ET system_prompt rempli
--  pour les 2 grilles francaises.
-- =====================================================================

select id, track, exercise_type, matiere,
       (system_prompt is not null and length(system_prompt) > 20) as system_prompt_ok
from public.rubrics
order by id;
