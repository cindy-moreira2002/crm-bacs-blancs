-- =====================================================================
--  48 - LES EPREUVES A CALCULS REVIENNENT AU BAREME PAR SUJET
--
--  Decision du 16 aout 2026 : en maths, physique-chimie et SVT, les calculs
--  comptent comme des exercices. La note s'y fabrique en additionnant des
--  questions numerotees, et ce que vaut chaque question n'existe que dans CE
--  sujet-la. Ces trois matieres repassent donc sur `bareme_sujet`
--  (src/lib/moteurs.ts), ce qui suppose deux choses en base.
--
--  A. Un controle de plus avant verrouillage : des etapes attendues sans prix.
--  B. Le referentiel SVT, qui n'existait pas du tout.
--
--  Ce fichier est IDEMPOTENT : le rejouer ne casse rien.
--  A coller dans le SQL Editor du projet Supabase du pipeline de correction.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  A. bareme_verifier() : une etape attendue doit avoir un prix
--
--  Le controle 4 existant accepte une question qui n'a QUE des etapes, sans
--  aucun palier de points. Le correcteur ne dispose alors que du maximum de la
--  question : il note tout ou rien. C'est exactement ce qu'un bareme
--  analytique doit rendre impossible, et c'est la premiere exigence du cahier
--  des charges des epreuves a calculs : « les points attribues a chaque etape ».
--
--  On ajoute donc le blocage 11 et l'avertissement 12, sans toucher aux dix
--  controles existants (fonction reecrite a l'identique pour le reste).
-- ---------------------------------------------------------------------

create or replace function public.bareme_verifier(p_version uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version    public.bareme_versions%rowtype;
  v_blocages   jsonb := '[]'::jsonb;
  v_avertis    jsonb := '[]'::jsonb;
  v_total      numeric;
  v_ligne      record;
begin
  select * into v_version from public.bareme_versions where id = p_version;
  if not found then
    return jsonb_build_object('ok', false, 'blocages',
      jsonb_build_array(jsonb_build_object('code', 'version_inconnue',
        'message', 'Version de bareme introuvable.')));
  end if;

  select coalesce(sum(max_points), 0) into v_total
  from public.bareme_questions where bareme_version_id = p_version;

  -- 1. Le total doit valoir exactement le maximum annonce (20).
  if abs(v_total - v_version.max_score) > 0.001 then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'total_incorrect',
      'message', format('Le total du bareme vaut %s points au lieu de %s.', v_total, v_version.max_score));
  end if;

  -- 2. Aucune question : rien a corriger.
  if v_total = 0 then
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'aucune_question',
      'message', 'Aucune question n''est rattachee a ce bareme.');
  end if;

  -- 3. Question sans reponse attendue.
  for v_ligne in
    select question_key from public.bareme_questions
    where bareme_version_id = p_version
      and (reponse_attendue is null or btrim(reponse_attendue) = '')
    order by ordre
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'reponse_attendue_manquante',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : aucune reponse attendue.', v_ligne.question_key));
  end loop;

  -- 4. Question sans aucune regle d'attribution des points.
  for v_ligne in
    select q.question_key
    from public.bareme_questions q
    where q.bareme_version_id = p_version
      and not exists (select 1 from public.bareme_awards a where a.question_id = q.id)
      and jsonb_array_length(q.etapes) = 0
    order by q.ordre
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'attribution_manquante',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : aucune regle d''attribution des points (ni palier, ni etape valorisee).', v_ligne.question_key));
  end loop;

  -- 5. Paliers cumulables au-dessus du maximum de la question.
  for v_ligne in
    select q.question_key, q.max_points, sum(a.points) as somme
    from public.bareme_questions q
    join public.bareme_awards a on a.question_id = q.id and a.cumulable
    where q.bareme_version_id = p_version
    group by q.question_key, q.max_points
    having sum(a.points) > q.max_points + 0.001
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'paliers_hors_max',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : les paliers font %s points pour un maximum de %s.',
        v_ligne.question_key, v_ligne.somme, v_ligne.max_points));
  end loop;

  -- 6. Competence attribuee a une question alors qu'elle n'existe pas
  --    dans le referentiel de la discipline.
  for v_ligne in
    select q.question_key, c as competence
    from public.bareme_questions q, unnest(q.competences) as c
    where q.bareme_version_id = p_version
      and not exists (
        select 1 from public.competence_referentiels r
        where r.matiere = v_version.matiere and r.code = c
      )
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'competence_inconnue',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : competence "%s" absente du referentiel %s.',
        v_ligne.question_key, v_ligne.competence, v_version.matiere));
  end loop;

  -- 7. Question sans aucune competence : le diagnostic serait aveugle.
  for v_ligne in
    select question_key from public.bareme_questions
    where bareme_version_id = p_version and cardinality(competences) = 0
    order by ordre
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'competence_manquante',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : aucune competence mobilisee declaree.', v_ligne.question_key));
  end loop;

  -- 8. depend_de qui pointe vers une question inexistante : la regle de
  --    poursuite apres erreur ne pourrait pas s'appliquer.
  for v_ligne in
    select q.question_key, d as cible
    from public.bareme_questions q, unnest(q.depend_de) as d
    where q.bareme_version_id = p_version
      and not exists (
        select 1 from public.bareme_questions q2
        where q2.bareme_version_id = p_version and q2.question_key = d
      )
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'dependance_inconnue',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : depend de "%s", qui n''existe pas dans ce bareme.',
        v_ligne.question_key, v_ligne.cible));
  end loop;

  -- 9. Code d'erreur hors taxonomie de la discipline.
  for v_ligne in
    select q.question_key, e as code
    from public.bareme_questions q, unnest(q.codes_erreurs) as e
    where q.bareme_version_id = p_version
      and not exists (
        select 1 from public.taxonomie_erreurs t
        where t.matiere = v_version.matiere and t.code = e
      )
  loop
    v_avertis := v_avertis || jsonb_build_object(
      'code', 'code_erreur_inconnu',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : code d''erreur "%s" absent de la taxonomie %s.',
        v_ligne.question_key, v_ligne.code, v_version.matiere));
  end loop;

  -- 10. Aucune methode alternative nulle part : possible, mais suspect.
  if not exists (
    select 1 from public.bareme_questions
    where bareme_version_id = p_version and jsonb_array_length(methodes_alternatives) > 0
  ) then
    v_avertis := v_avertis || jsonb_build_object(
      'code', 'aucune_methode_alternative',
      'message', 'Aucune methode alternative prevue : toute demarche non prevue partira en relecture humaine.');
  end if;

  -- 11. NOUVEAU - Des etapes attendues, mais aucun palier de points.
  --     On sait ce qu'on attend et pas ce que ca vaut : la question se note
  --     tout ou rien, ce qui rend impossibles la poursuite apres erreur et le
  --     maintien des points de methode.
  for v_ligne in
    select q.question_key, jsonb_array_length(q.etapes) as nb
    from public.bareme_questions q
    where q.bareme_version_id = p_version
      and jsonb_array_length(q.etapes) > 0
      and not exists (select 1 from public.bareme_awards a where a.question_id = q.id)
    order by q.ordre
  loop
    v_blocages := v_blocages || jsonb_build_object(
      'code', 'etapes_sans_points',
      'question_key', v_ligne.question_key,
      'message', format('Question %s : %s etape(s) attendue(s) mais aucun palier de points. Sans le prix de chaque etape, la question se note tout ou rien.',
        v_ligne.question_key, v_ligne.nb));
  end loop;

  -- 12. NOUVEAU - Question a plusieurs points sans aucune reponse acceptee
  --     alternative : tout ecart de formulation partira en relecture. Ce n'est
  --     pas bloquant (certaines questions n'admettent qu'une reponse), mais ca
  --     se dit avant le verrouillage, pas apres cinquante copies.
  for v_ligne in
    select q.question_key, q.max_points
    from public.bareme_questions q
    where q.bareme_version_id = p_version
      and q.max_points >= 2
      and jsonb_array_length(q.methodes_alternatives) = 0
      and jsonb_array_length(q.reponses_equivalentes) = 0
    order by q.ordre
  loop
    v_avertis := v_avertis || jsonb_build_object(
      'code', 'aucune_reponse_acceptee_alternative',
      'question_key', v_ligne.question_key,
      'message', format('Question %s (%s pts) : aucune reponse equivalente ni methode alternative acceptee.',
        v_ligne.question_key, v_ligne.max_points));
  end loop;

  update public.bareme_versions
  set controles = jsonb_build_object(
        'ok', jsonb_array_length(v_blocages) = 0,
        'total_points', v_total,
        'blocages', v_blocages,
        'avertissements', v_avertis,
        'verifie_le', now())
  where id = p_version;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_blocages) = 0,
    'version', v_version.version,
    'total_points', v_total,
    'max_score', v_version.max_score,
    'blocages', v_blocages,
    'avertissements', v_avertis
  );
end;
$$;

comment on function public.bareme_verifier(uuid) is
  'Les controles bloquants du bareme (12 depuis le 16 aout 2026). Rejouee par bareme_verrouiller() : on ne peut pas verrouiller un bareme incomplet en contournant l''interface.';

-- ---------------------------------------------------------------------
--  B. LE REFERENTIEL SVT
--
--  Il n'existait pas : zero competence, zero code d'erreur. Sans lui, le
--  controle 7 bloque CHAQUE question d'un bareme de SVT, et le correcteur n'a
--  aucun code pour nommer ce qu'il observe. Les six competences ci-dessous
--  suivent la structure de l'epreuve de specialite (exercice 1 : mobiliser ses
--  connaissances ; exercice 2 : pratiquer une demarche scientifique a partir de
--  documents).
--
--  A RELIRE PAR UN PROFESSEUR DE SVT : c'est une proposition, calquee sur la
--  forme des referentiels de maths et de physique-chimie deja en place, pas un
--  texte officiel.
-- ---------------------------------------------------------------------

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('svt', 'restituer', 'Restituer des connaissances', 'Mobiliser un savoir exigible du programme, avec le vocabulaire exact, et le rattacher a la question posee.', 1, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle, description = excluded.description,
  ordre = excluded.ordre, toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('svt', 'exploiter-documents', 'Extraire et exploiter des documents', 'Tirer d''un graphique, d''un tableau, d''une photographie ou d''un texte l''information utile, en citant la donnee precise qui sert le raisonnement.', 2, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle, description = excluded.description,
  ordre = excluded.ordre, toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('svt', 'raisonner', 'Raisonner et argumenter', 'Enchainer les etapes d''un raisonnement scientifique : de la donnee a l''interpretation, puis a la conclusion, sans saut logique.', 3, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle, description = excluded.description,
  ordre = excluded.ordre, toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('svt', 'demarche-experimentale', 'Concevoir et analyser une demarche experimentale', 'Proposer un protocole, identifier un temoin, une variable testee, et discuter ce que l''experience permet ou non de conclure.', 4, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle, description = excluded.description,
  ordre = excluded.ordre, toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('svt', 'quantifier', 'Calculer, exploiter des grandeurs', 'Mener un calcul (vitesse, taux, echelle, datation, pourcentage), rendre un resultat avec son unite et un nombre de chiffres coherent avec les donnees.', 5, false)
on conflict (matiere, code) do update set
  libelle = excluded.libelle, description = excluded.description,
  ordre = excluded.ordre, toujours_mobilisee = excluded.toujours_mobilisee;

insert into public.competence_referentiels (matiere, code, libelle, description, ordre, toujours_mobilisee)
values ('svt', 'communiquer', 'Communiquer scientifiquement', 'Rediger clairement, legender un schema, organiser la reponse pour qu''elle reponde a la question posee et a elle seule.', 6, true)
on conflict (matiere, code) do update set
  libelle = excluded.libelle, description = excluded.description,
  ordre = excluded.ordre, toujours_mobilisee = excluded.toujours_mobilisee;

-- Taxonomie d'erreurs SVT.
-- La gravite est PEDAGOGIQUE : elle ne retire aucun point. Seul le bareme de la
-- question decide de l'effet sur la note (regle deja posee dans le noyau).
-- Les codes TR-* et SU-* sont communs a toutes les matieres : ils designent un
-- incident du dispositif, jamais une faute de l'eleve.
insert into public.taxonomie_erreurs (matiere, code, domaine, description, gravite, nature, competence) values
  ('svt', 'CO-DEFINITION-01',    'connaissances', 'Notion du programme definie de facon inexacte ou confondue avec une notion voisine.', 'majeure', 'eleve', 'restituer'),
  ('svt', 'CO-HORS-SUJET-01',    'connaissances', 'Connaissances exactes mais sans rapport avec la question posee.', 'moderee', 'eleve', 'communiquer'),
  ('svt', 'CO-ECHELLE-01',       'connaissances', 'Confusion d''echelle : cellulaire, tissulaire, organisme, population, geologique.', 'majeure', 'eleve', 'raisonner'),
  ('svt', 'DO-NON-CITE-01',      'documents',     'Conclusion tiree d''un document sans citer la donnee qui la fonde.', 'moderee', 'eleve', 'exploiter-documents'),
  ('svt', 'DO-LECTURE-01',       'documents',     'Donnee mal lue : axe, unite, legende ou echelle du document non respectee.', 'majeure', 'eleve', 'exploiter-documents'),
  ('svt', 'DO-SURINTERPRET-01',  'documents',     'Le document ne permet pas la conclusion qu''en tire la copie.', 'majeure', 'eleve', 'raisonner'),
  ('svt', 'DO-IGNORE-01',        'documents',     'Document fourni et necessaire, non exploite du tout.', 'moderee', 'eleve', 'exploiter-documents'),
  ('svt', 'RA-SAUT-LOGIQUE-01',  'raisonnement',  'Passage direct de la donnee a la conclusion, sans l''interpretation qui les relie.', 'majeure', 'eleve', 'raisonner'),
  ('svt', 'RA-CAUSALITE-01',     'raisonnement',  'Correlation prise pour une causalite.', 'majeure', 'eleve', 'raisonner'),
  ('svt', 'RA-FINALISME-01',     'raisonnement',  'Explication finaliste : l''organisme agirait « pour » ou « afin de ».', 'moderee', 'eleve', 'raisonner'),
  ('svt', 'RA-CONCLUSION-01',    'raisonnement',  'Aucune conclusion, ou conclusion qui ne repond pas a la question posee.', 'moderee', 'eleve', 'communiquer'),
  ('svt', 'EX-TEMOIN-01',        'experimental',  'Temoin absent, mal choisi, ou role du temoin non explique.', 'majeure', 'eleve', 'demarche-experimentale'),
  ('svt', 'EX-VARIABLE-01',      'experimental',  'Plusieurs parametres varient a la fois : l''experience ne conclut rien.', 'majeure', 'eleve', 'demarche-experimentale'),
  ('svt', 'CA-UNITE-01',         'calcul',        'Resultat sans unite, ou unite incoherente avec la grandeur calculee.', 'mineure', 'eleve', 'quantifier'),
  ('svt', 'CA-CONVERSION-01',    'calcul',        'Erreur de conversion ou d''echelle dans un calcul.', 'moderee', 'eleve', 'quantifier'),
  ('svt', 'CA-CHIFFRES-01',      'calcul',        'Precision du resultat sans rapport avec celle des donnees.', 'mineure', 'eleve', 'quantifier'),
  ('svt', 'CM-SCHEMA-01',        'communication', 'Schema non legende, sans titre, ou dont la legende contredit le texte.', 'moderee', 'eleve', 'communiquer'),
  ('svt', 'CM-VOCABULAIRE-01',   'communication', 'Vocabulaire scientifique employe a la place d''un autre.', 'moderee', 'eleve', 'communiquer'),
  ('svt', 'TR-ILLISIBLE-01',     'transcription', 'Element manuscrit illisible : ce n''est pas une erreur de l''eleve.', 'mineure', 'transcription', null),
  ('svt', 'TR-NON-TRANSCRIT-01', 'transcription', 'Schema ou annotation non transcrit : la copie n''a pas pu etre lue entierement.', 'mineure', 'transcription', null),
  ('svt', 'RC-METHODE-ALTERNATIVE-01', 'reconnaissance', 'Demarche valide mais absente du corrige : a trancher par un humain, jamais zero d''office.', 'mineure', 'reconnaissance', null),
  ('svt', 'SU-ANOMALIE-01',      'sujet',         'Le sujet ou le corrige semble comporter une erreur.', 'majeure', 'sujet', null),
  ('svt', 'SU-BAREME-CONTRADICTION-01', 'sujet',  'Deux regles du bareme se contredisent sur cette question.', 'majeure', 'sujet', null)
on conflict (matiere, code) do update set
  domaine = excluded.domaine, description = excluded.description,
  gravite = excluded.gravite, nature = excluded.nature, competence = excluded.competence;

commit;

-- =====================================================================
--  VERIFICATION apres execution — les deux doivent renvoyer 6 et 23.
--
--  select count(*) from public.competence_referentiels where matiere = 'svt';
--  select count(*) from public.taxonomie_erreurs      where matiere = 'svt';
-- =====================================================================
