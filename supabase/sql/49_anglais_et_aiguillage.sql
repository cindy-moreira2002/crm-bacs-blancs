-- =====================================================================
--  49 - AIGUILLAGE DES COPIES VERS LE BAREME, ET AJOUT DE L'ANGLAIS
--
--  Deux choses sans rapport l'une avec l'autre, dans un seul fichier pour
--  n'avoir qu'un aller-retour au SQL Editor.
--
--  A. UN CORRECTIF. Passer maths, physique-chimie et SVT au bareme par sujet
--     (16 aout 2026) ne suffisait pas : c'est `rubrics.moteur` qui decide de
--     l'Edge Function appelee, pas `src/lib/moteurs.ts`. Une copie de maths
--     deposee aujourd'hui partirait encore a la grille generique, alors que
--     l'ecran annonce un bareme. Corrige a la source.
--
--  B. L'ANGLAIS. Grilles et gabarits de dossier pour la specialite LLCER
--     Anglais : synthese sur 16, traduction sur 4.
--
--  Ce fichier est IDEMPOTENT : le rejouer ne casse rien.
--  A coller dans le SQL Editor du projet Supabase du pipeline.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  A. OUVRIR LES CORRECTIONS AIGUILLE AUSSI LES COPIES
--
--  Rappel du mecanisme : le trigger `corrections_moteur_grille` recopie
--  `rubrics.moteur` sur chaque copie deposee, et c'est CE champ qui envoie la
--  copie vers `correct-copy-bareme` ou vers le moteur generique. Tant que la
--  grille de depot d'une matiere dit `grille_generique`, le bareme du sujet ne
--  sert a rien : il existe, il est verrouille, et personne ne l'utilise.
--
--  Le bon moment pour basculer est exactement celui-ci : quand un bareme
--  verrouille ouvre ses corrections, sa matiere passe au bareme par sujet. Pas
--  avant — sinon les copies n'auraient plus de source de note du tout.
--
--  Reversible : `exam_fermer_correction` n'existe pas, mais remettre
--  `moteur = 'grille_generique'` sur les grilles de la matiere suffit a revenir
--  en arriere.
-- ---------------------------------------------------------------------

create or replace function public.exam_ouvrir_correction(p_exam uuid, p_auteur text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam    public.exams%rowtype;
  v_version public.bareme_versions%rowtype;
  v_grilles integer := 0;
begin
  select * into v_exam from public.exams where id = p_exam;
  if not found then raise exception 'Examen introuvable.'; end if;

  if v_exam.bareme_version_active is null then
    raise exception 'Aucun bareme actif sur cet examen : impossible d''ouvrir les corrections.';
  end if;

  select * into v_version from public.bareme_versions where id = v_exam.bareme_version_active;
  if v_version.statut <> 'locked' then
    raise exception 'Le bareme % n''est pas verrouille (statut %) : impossible d''ouvrir les corrections.',
      v_version.version, v_version.statut;
  end if;

  update public.exams
  set statut = 'correction_open', maj_le = now()
  where id = p_exam;

  -- NOUVEAU : les grilles de depot de cette matiere cessent de produire la
  -- note et aiguillent desormais les copies vers le moteur du bareme. Elles
  -- restent actives : elles servent toujours au diagnostic de competences et
  -- aux conventions de lecture de la matiere.
  update public.rubrics
  set moteur = 'bareme_sujet',
      role = 'diagnostic_competences',
      note_officielle = false,
      remplacee_par_bareme = true
  where matiere = v_exam.matiere
    and status = 'active'
    and coalesce(moteur, 'grille_generique') = 'grille_generique';
  get diagnostics v_grilles = row_count;

  insert into public.bareme_audit (table_cible, ligne_id, action, auteur, apres)
  values ('exams', p_exam::text, 'ouverture_corrections', p_auteur,
          jsonb_build_object('bareme_version_id', v_version.id, 'version', v_version.version,
                             'grilles_aiguillees', v_grilles, 'matiere', v_exam.matiere));

  return jsonb_build_object('ok', true, 'exam_id', p_exam, 'version', v_version.version,
                            'grilles_aiguillees', v_grilles);
end;
$$;

revoke all on function public.exam_ouvrir_correction(uuid, text) from public, anon, authenticated;
grant execute on function public.exam_ouvrir_correction(uuid, text) to service_role;

comment on function public.exam_ouvrir_correction(uuid, text) is
  'Ouvre les corrections d''un examen ET bascule les grilles actives de sa matiere sur le moteur du bareme (rubrics.moteur), sans quoi les copies partiraient encore a la grille generique.';

-- ---------------------------------------------------------------------
--  B. L'ANGLAIS — SPECIALITE LLCER
--
--  Une seule epreuve branchee, et c'est volontaire : l'ecrit terminal de la
--  specialite LLCER Anglais, 4 heures, synthese d'un dossier de trois documents
--  (16 points) + traduction en francais d'environ 500 signes (4 points).
--
--  Ne sont PAS branchees : la specialite AMC (Anglais, monde contemporain), qui
--  est une autre epreuve, et le tronc commun LVA/LVB, qui releve du controle
--  continu et dont le format est fixe par l'etablissement.
--
--  Les deux grilles naissent en 'draft' : c'est un professeur d'anglais qui les
--  fait passer en 'active', pas ce fichier. Les deux ordres pour le faire sont
--  donnes tout en bas.
-- ---------------------------------------------------------------------

insert into public.rubrics
  (id, track, matiere, exercise_type, version, status, moteur, role, note_officielle, system_prompt, rubric_json)
values (
  'ANG_LLCER_SYNTHESE_V1', 'generale', 'anglais', 'llcer_synthese', 1, 'draft',
  'grille_generique', 'diagnostic_competences', true,
  'Tu es un correcteur expert de l''epreuve ecrite de specialite LLCER Anglais, niveau terminale, attendu B2-C1. Tu appliques exclusivement la grille fournie. Tu evalues une synthese redigee EN ANGLAIS a partir d''un dossier de trois documents : tu exiges une mise en relation reelle des documents, pas un resume successif document par document. Tu distingues toujours ce qui releve de la comprehension des documents et ce qui releve de la qualite de la langue : une copie qui a tout compris dans un anglais fautif n''est pas la meme qu''une copie fluide et hors sujet, et les deux criteres se notent separement. Tu ne sanctionnes jamais deux fois la meme faiblesse. Une maladresse d''expression isolee ne se paie pas sur le critere de comprehension. Chaque note est justifiee par des passages precis de la copie, cites en anglais. Tu tiens compte du fait que la copie est manuscrite : une graphie douteuse n''est pas une faute d''orthographe, et en cas de doute de lecture tu demandes une verification humaine.',
  jsonb_build_object(
    'maximum_score', 16,
    'principle', 'La synthese se juge d''abord sur ce que la copie fait des trois documents ensemble, ensuite sur la langue. Comprehension et langue ne se compensent pas : elles se notent separement.',
    'criteria', jsonb_build_array(
      jsonb_build_object(
        'code', 'COMPREHENSION', 'name', 'Comprehension des documents', 'maximum_score', 4,
        'description', 'Les trois documents sont compris avec exactitude : nature, propos, point de vue, implicite. Aucun contresens sur un document.',
        'levels', jsonb_build_object(
          '0', 'Documents non compris ou non exploites.',
          '1', 'Un seul document compris, ou contresens majeur sur l''un d''eux.',
          '2', 'Deux documents compris ; le troisieme est survole ou mal lu.',
          '3', 'Les trois documents sont compris, mais l''implicite ou le point de vue echappe par endroits.',
          '4', 'Les trois documents sont compris finement, y compris leur point de vue et leurs sous-entendus.')),
      jsonb_build_object(
        'code', 'MISE_EN_RELATION', 'name', 'Mise en relation et organisation', 'maximum_score', 4,
        'description', 'Les documents sont confrontes, pas resumes l''un apres l''autre. Convergences et tensions sont identifiees et organisees autour d''un fil directeur.',
        'levels', jsonb_build_object(
          '0', 'Aucune mise en relation : trois resumes juxtaposes, ou un seul document exploite.',
          '1', 'Resumes successifs avec une phrase de liaison finale.',
          '2', 'Rapprochements ponctuels, mais le plan suit encore l''ordre des documents.',
          '3', 'Plan thematique reel ; la tension entre les documents est vue mais peu exploitee.',
          '4', 'Les documents s''eclairent mutuellement du debut a la fin ; la tension du dossier structure la reponse.')),
      jsonb_build_object(
        'code', 'ARGUMENTATION', 'name', 'Pertinence et argumentation', 'maximum_score', 3,
        'description', 'La reponse traite la consigne posee, s''appuie sur des elements preleves et cites, et progresse vers une conclusion.',
        'levels', jsonb_build_object(
          '0', 'Hors sujet, ou aucun appui sur le dossier.',
          '1', 'La consigne est effleuree ; les affirmations ne sont pas etayees.',
          '2', 'La consigne est traitee, les appuis sont presents mais inegalement exploites.',
          '3', 'La consigne est traitee de bout en bout, chaque affirmation est etayee par un element du dossier.')),
      jsonb_build_object(
        'code', 'LANGUE', 'name', 'Qualite de la langue anglaise', 'maximum_score', 4,
        'description', 'Correction grammaticale, richesse et precision du lexique, idiomaticite. Niveau attendu B2-C1.',
        'levels', jsonb_build_object(
          '0', 'Langue qui empeche la comprehension.',
          '1', 'Erreurs de base repetees (accords, temps, ordre des mots) ; lexique tres pauvre ou calque du francais.',
          '2', 'Anglais comprehensible mais scolaire : structures simples, erreurs recurrentes, quelques calques.',
          '3', 'Anglais correct et varie ; erreurs ponctuelles qui ne genent pas la lecture.',
          '4', 'Anglais fluide et idiomatique, lexique precis et reinvesti du dossier ; erreurs rares.')),
      jsonb_build_object(
        'code', 'FORMAT', 'name', 'Respect de la consigne materielle', 'maximum_score', 1,
        'description', 'Reponse redigee en anglais, longueur conforme a la consigne (environ 500 mots), sujet choisi clairement identifie.',
        'levels', jsonb_build_object(
          '0', 'Consigne materielle non respectee : longueur tres insuffisante, ou reponse redigee en francais.',
          '0.5', 'Longueur nettement en deca ou au-dela de la consigne.',
          '1', 'Consigne materielle respectee.'))),
    'guardrails', jsonb_build_array(
      'Une faiblesse de langue ne se sanctionne que sur le critere LANGUE, jamais aussi sur COMPREHENSION.',
      'Un resume document par document plafonne MISE_EN_RELATION, mais n''interdit pas de bons points en COMPREHENSION.',
      'Une graphie manuscrite douteuse n''est pas une faute : demander une verification humaine.',
      'Aucun point ne se retire pour un point de vue personnel different de celui du corrige.',
      'La note est la somme des criteres : ne jamais annoncer une note globale a part.'))
)
on conflict (id) do update set
  system_prompt = excluded.system_prompt,
  rubric_json = excluded.rubric_json,
  moteur = excluded.moteur,
  role = excluded.role,
  note_officielle = excluded.note_officielle;

insert into public.rubrics
  (id, track, matiere, exercise_type, version, status, moteur, role, note_officielle, system_prompt, rubric_json)
values (
  'ANG_LLCER_TRADUCTION_V1', 'generale', 'anglais', 'llcer_traduction', 1, 'draft',
  'grille_generique', 'diagnostic_competences', true,
  'Tu es un correcteur expert de la traduction de l''epreuve de specialite LLCER Anglais, niveau terminale. Tu corriges une traduction EN FRANCAIS d''un passage anglais d''environ 500 signes tire du dossier. Tu appliques exclusivement la grille fournie. Tu distingues strictement le contresens (le sens est inverse ou perdu) du faux sens (nuance manquee) et du maladroit (sens juste, francais bancal) : ces trois defauts ne coutent pas la meme chose. Une omission de segment est un defaut de fidelite, pas une faute de langue. Tu acceptes toute traduction qui rend le sens et sonne francais, meme eloignee du corrige mot a mot. Tu ne sanctionnes jamais deux fois la meme erreur, y compris si elle se repete d''une phrase a l''autre. En cas de graphie manuscrite douteuse, tu demandes une verification humaine plutot que de compter une faute.',
  jsonb_build_object(
    'maximum_score', 4,
    'principle', 'La traduction se note segment par segment : ce qui est rendu est acquis, meme si le reste est rate. Un contresens local ne fait pas tomber toute la traduction.',
    'criteria', jsonb_build_array(
      jsonb_build_object(
        'code', 'FIDELITE', 'name', 'Fidelite au sens', 'maximum_score', 1.5,
        'description', 'Le sens du passage est rendu, sans contresens ni omission. Chaque segment du passage est traduit.',
        'levels', jsonb_build_object(
          '0', 'Passage non traduit, ou sens general perdu.',
          '0.5', 'Plusieurs contresens, ou un tiers du passage omis.',
          '1', 'Sens general rendu ; un contresens local ou une omission breve.',
          '1.5', 'Sens integralement rendu, aucun segment omis.')),
      jsonb_build_object(
        'code', 'GRAMMAIRE', 'name', 'Structures et temps', 'maximum_score', 1,
        'description', 'Temps, modaux, voix passive, structures idiomatiques anglaises correctement transposes en francais.',
        'levels', jsonb_build_object(
          '0', 'Temps et structures ignores : traduction mot a mot.',
          '0.5', 'Erreurs de temps ou de modaux qui changent la valeur de l''enonce.',
          '1', 'Temps et structures correctement transposes.')),
      jsonb_build_object(
        'code', 'LEXIQUE', 'name', 'Precision lexicale', 'maximum_score', 1,
        'description', 'Mots rendus avec justesse ; ni faux amis, ni calques, ni approximations qui appauvrissent le texte.',
        'levels', jsonb_build_object(
          '0', 'Lexique massivement faux ou invente.',
          '0.5', 'Faux sens ou calques repetes.',
          '1', 'Lexique juste et precis ; les termes difficiles sont resolus.')),
      jsonb_build_object(
        'code', 'FRANCAIS', 'name', 'Qualite du francais', 'maximum_score', 0.5,
        'description', 'Le resultat se lit comme du francais : syntaxe, ponctuation, orthographe.',
        'levels', jsonb_build_object(
          '0', 'Francais fautif ou illisible.',
          '0.25', 'Francais comprehensible mais calque sur l''anglais.',
          '0.5', 'Francais correct et naturel.'))),
    'guardrails', jsonb_build_array(
      'Une meme erreur repetee sur plusieurs segments ne se compte qu''une fois.',
      'Une traduction eloignee du corrige mais fidele au sens et idiomatique vaut tous les points.',
      'Un contresens local ne met jamais la traduction a zero : les segments justes restent acquis.',
      'Une omission se sanctionne sur FIDELITE, jamais aussi sur LEXIQUE.',
      'La note est la somme des criteres : ne jamais annoncer une note globale a part.'))
)
on conflict (id) do update set
  system_prompt = excluded.system_prompt,
  rubric_json = excluded.rubric_json,
  moteur = excluded.moteur,
  role = excluded.role,
  note_officielle = excluded.note_officielle;

-- Les gabarits de dossier remis a l'eleve.
insert into public.dossier_templates
  (id, track, matiere, exercise_type, audience, output_format, status, version, system_prompt)
values (
  'ANG_DOSSIER_SYNTHESE_ELEVE_V1', 'generale', 'anglais', 'llcer_synthese', 'eleve', 'html', 'draft', 1,
  'Redige le dossier de correction d''une synthese de LLCER Anglais, pour l''eleve, en FRANCAIS — sauf les citations de sa copie et les propositions de reformulation, qui restent en anglais. Sections attendues, dans cet ordre : 1) appreciation generale et note, avec le detail des cinq criteres ; 2) ce que les trois documents disaient reellement, et ce que la copie en a fait ou manque ; 3) la mise en relation : montrer concretement, sur son plan a elle, comment passer de trois resumes a une confrontation ; 4) la langue : relever cinq a huit tournures fautives ou scolaires de la copie et proposer pour chacune la formulation idiomatique attendue au niveau B2-C1, en anglais ; 5) un paragraphe de sa copie reecrit tel qu''il aurait pu etre, en anglais, sans changer ses idees ; 6) plan de progression : trois objectifs concrets pour la prochaine synthese ; 7) fiche memo : le lexique et les articulateurs de synthese a reinvestir. Ton exigeant et bienveillant, jamais decourageant. Ne jamais reprocher a l''eleve une faiblesse deja pointee plus haut.')
on conflict (id) do update set system_prompt = excluded.system_prompt;

insert into public.dossier_templates
  (id, track, matiere, exercise_type, audience, output_format, status, version, system_prompt)
values (
  'ANG_DOSSIER_TRADUCTION_ELEVE_V1', 'generale', 'anglais', 'llcer_traduction', 'eleve', 'html', 'draft', 1,
  'Redige le dossier de correction d''une traduction de LLCER Anglais, pour l''eleve, en francais. Sections attendues, dans cet ordre : 1) appreciation generale et note, avec le detail des quatre criteres ; 2) le tableau segment par segment : pour chaque segment du passage, l''anglais d''origine, la traduction de l''eleve, une traduction acceptable, et la nature exacte de l''ecart (contresens, faux sens, omission, calque, maladresse) — c''est la section principale du dossier ; 3) les deux ou trois difficultes de fond que le passage posait (temps, modaux, voix passive, expression idiomatique) et la regle a retenir pour chacune ; 4) la traduction complete proposee, d''un seul tenant ; 5) trois exercices cibles sur les difficultes reellement rencontrees dans SA copie. Ne jamais presenter la traduction proposee comme la seule possible : indiquer les variantes acceptables. Ne jamais compter deux fois la meme erreur.')
on conflict (id) do update set system_prompt = excluded.system_prompt;

commit;

-- =====================================================================
--  VERIFICATIONS apres execution
--
--  -- 1. Les deux grilles d'anglais existent, en brouillon :
--  select id, exercise_type, status, (rubric_json->>'maximum_score') as sur
--  from public.rubrics where matiere = 'anglais';
--     attendu : ANG_LLCER_SYNTHESE_V1 / draft / 16
--               ANG_LLCER_TRADUCTION_V1 / draft / 4
--
--  -- 2. Les deux gabarits de dossier existent :
--  select id, exercise_type, status from public.dossier_templates where matiere = 'anglais';
--
--  -- 3. L'aiguillage : rien ne doit avoir bouge tant qu'aucun bareme n'est
--  --    ouvert. Les grilles de maths restent sur grille_generique jusqu'au
--  --    premier « Ouvrir les corrections ».
--  select matiere, exercise_type, moteur, note_officielle
--  from public.rubrics where matiere in ('maths','physique-chimie','svt') and status = 'active';
--
--  -- QUAND UN PROFESSEUR D'ANGLAIS AURA RELU LES DEUX GRILLES, les activer :
--  -- update public.rubrics set status = 'active' where matiere = 'anglais';
--  -- update public.dossier_templates set status = 'active' where matiere = 'anglais';
-- =====================================================================
