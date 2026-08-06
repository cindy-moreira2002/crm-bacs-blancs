// =====================================================================
//  DONNEES DE LA MATIERE : FRANCAIS, VOIE TECHNOLOGIQUE (1re techno)
//
//  Pourquoi ce fichier existe : le francais est la SEULE matiere du
//  pipeline reellement en service (session du 6 septembre 2026), mais il
//  n'existait en base QUE la voie generale. Un eleve de premiere
//  technologique n'avait aucun sujet a choisir au depot, aucune grille
//  pour le corriger et aucun gabarit de dossier : une filiere entiere
//  sortait du tunnel. Le centre de sante du pipeline le disait dans ces
//  termes : "etalons orphelins d'epreuves qu'AUCUNE matiere installee ne
//  propose - la filiere techno du francais n'a ni grille ni sujet".
//
//  L'epreuve ecrite anticipee de francais, voie technologique, 4 heures :
//  l'eleve choisit ENTRE le commentaire d'un texte litteraire (guide par
//  des axes fournis) ET la contraction d'un texte d'idees suivie d'un
//  essai. Chaque exercice est ici une epreuve autonome, deposee et notee
//  seule, ramenee sur 20 - meme parti que les mathematiques. Dans
//  l'epreuve officielle, contraction et essai valent 10 points chacun :
//  la conversion est ecrite noir sur blanc dans chaque system_prompt.
//
//  LES DEUX TEXTES SONT DU DOMAINE PUBLIC, et c'est un choix contraint :
//  les textes d'idees contemporains employes au bac sont proteges.
//    - Victor Hugo, "Detruire la misere", discours du 9 juillet 1849 ;
//      texte etabli d'apres Wikisource (Actes et Paroles, tome I), les
//      reactions de l'Assemblee entre parentheses ayant ete retirees pour
//      l'exercice. 986 mots -> contraction en 250 mots.
//    - Charles Baudelaire, "L'Albatros", Les Fleurs du mal, edition de
//      1861, texte valide sur Wikisource.
//  Comme pour la philosophie, le professeur relecteur doit VERIFIER
//  chaque texte mot a mot sur une edition de reference avant la session :
//  un commentaire se corrige sur le texte exact.
//
//  Rien ici n'est une annale reproduite : sujets, grilles, baremes et
//  profils d'etalons sont rediges par Les Matinees du Bac. Les fiches
//  portent 'a_remplacer_par_le_sujet_reel_de_la_session' : le jour ou le
//  sujet du bac blanc techno est ecrit, il remplace ces fiches.
// =====================================================================

export const matiere = 'francais';
export const libelle = 'Francais - voie technologique';
export const session = 2026;

// ---------------------------------------------------------------------
//  Taxonomie d'erreurs, dans rubric_json.common_error_taxonomy.
//  La table error_taxonomy ne porte que le francais voie generale et n'a
//  pas de colonne matiere : y ecrire des codes techno les ferait remonter
//  dans les corrections de la voie generale. Ils restent donc dans la
//  grille, comme pour toutes les matieres installees depuis SES.
//  Le champ `criterion` est reecrit par taxoPour() pour chaque grille.
// ---------------------------------------------------------------------
const TAXONOMIE = [
  // --- Contraction de texte
  { code: 'FRT-CTR-01', criterion: 'FIDELITE',      severity: 'major',    category: 'contresens',            description: "Contresens sur la these : le resume fait dire au texte autre chose que ce qu'il dit, ou inverse sa position." },
  { code: 'FRT-CTR-02', criterion: 'FIDELITE',      severity: 'major',    category: 'ajout_exterieur',       description: "Ajout d'idees, d'exemples ou de commentaires absents du texte : la contraction n'est pas un espace personnel." },
  { code: 'FRT-CTR-03', criterion: 'FIDELITE',      severity: 'major',    category: 'commentaire_du_texte',  description: "L'eleve commente ou juge le texte (\"l'auteur a raison\", \"ce texte est emouvant\") au lieu de le restituer." },
  { code: 'FRT-CTR-04', criterion: 'SELECTION',     severity: 'major',    category: 'etape_perdue',          description: "Une etape essentielle du raisonnement disparait : le resume garde des exemples et perd un maillon de l'argumentation." },
  { code: 'FRT-CTR-05', criterion: 'SELECTION',     severity: 'moderate', category: 'exemples_conserves',    description: "Les exemples et les illustrations sont conserves alors qu'ils devaient etre resumes d'un mot ou supprimes : la place manque ensuite pour les idees." },
  { code: 'FRT-CTR-06', criterion: 'REFORMULATION', severity: 'major',    category: 'copie_du_texte',        description: "Phrases entieres recopiees du texte : la reformulation personnelle est la competence evaluee." },
  { code: 'FRT-CTR-07', criterion: 'REFORMULATION', severity: 'moderate', category: 'enonciation',           description: "Le systeme d'enonciation du texte n'est pas tenu : passage a \"l'auteur dit que\" repete, ou melange des personnes." },
  { code: 'FRT-CTR-08', criterion: 'REFORMULATION', severity: 'moderate', category: 'liens_logiques_perdus', description: "Les articulations logiques (mais, donc, car, or) disparaissent : le resume devient une liste d'idees sans raisonnement." },
  { code: 'FRT-CTR-09', criterion: 'LONGUEUR',      severity: 'moderate', category: 'longueur',              description: "Le nombre de mots demande n'est pas respecte (marge de 10 %), ou le decompte n'est pas indique en fin de copie." },
  // --- Essai
  { code: 'FRT-ESS-01', criterion: 'PROBLEME',      severity: 'major',    category: 'question_deplacee',     description: "La question posee n'est pas celle qui est traitee : l'eleve repond a un sujet voisin, souvent celui qu'il a revise." },
  { code: 'FRT-ESS-02', criterion: 'PROBLEME',      severity: 'moderate', category: 'termes_non_definis',    description: "Les mots cles de la question ne sont pas expliques : la reponse porte sur une notion floue." },
  { code: 'FRT-ESS-03', criterion: 'ARGUMENTATION', severity: 'major',    category: 'affirmation_sans_preuve', description: "Suite d'affirmations sans raisonnement : la these est posee, jamais etablie." },
  { code: 'FRT-ESS-04', criterion: 'ARGUMENTATION', severity: 'moderate', category: 'texte_non_mobilise',    description: "Le texte support n'est jamais mobilise alors que la consigne le demande explicitement." },
  { code: 'FRT-ESS-05', criterion: 'EXEMPLES',      severity: 'major',    category: 'exemple_absent',        description: "Aucun exemple precis : ni oeuvre, ni lecture, ni situation concrete ne vient appuyer le raisonnement." },
  { code: 'FRT-ESS-06', criterion: 'EXEMPLES',      severity: 'moderate', category: 'exemple_non_analyse',   description: "L'exemple est raconte mais jamais analyse : rien ne montre ce qu'il prouve." },
  { code: 'FRT-ESS-07', criterion: 'STRUCTURE',     severity: 'major',    category: 'devoir_non_organise',   description: "Absence d'organisation : ni introduction, ni parties reperables, ni conclusion. Le devoir est un bloc." },
  { code: 'FRT-ESS-08', criterion: 'STRUCTURE',     severity: 'moderate', category: 'paragraphe_fourre_tout', description: "Un paragraphe melange plusieurs idees : une idee par paragraphe est la regle de l'essai." },
  // --- Commentaire (voie technologique, guide par des axes)
  { code: 'FRT-COM-01', criterion: 'COMPREHENSION', severity: 'major',    category: 'contresens',            description: "Contresens sur le sens litteral du texte : la situation, le locuteur ou l'objet du texte sont mal identifies." },
  { code: 'FRT-COM-02', criterion: 'COMPREHENSION', severity: 'moderate', category: 'paraphrase',            description: "Paraphrase : le texte est raconte avec d'autres mots, sans rien expliquer." },
  { code: 'FRT-COM-03', criterion: 'EXPLOITATION',  severity: 'major',    category: 'axes_recopies',         description: "Les axes fournis sont recopies comme titres mais ne sont pas developpes en sous-idees : le guidage n'a pas ete exploite." },
  { code: 'FRT-COM-04', criterion: 'EXPLOITATION',  severity: 'moderate', category: 'axe_ignore',            description: "L'un des axes fournis par le sujet est traite en deux lignes ou abandonne." },
  { code: 'FRT-COM-05', criterion: 'ANALYSE',       severity: 'major',    category: 'procede_sans_effet',    description: "Un procede est nomme (metaphore, champ lexical) sans que son effet sur le sens soit explique : le releve tient lieu d'analyse." },
  { code: 'FRT-COM-06', criterion: 'ANALYSE',       severity: 'major',    category: 'citation_absente',      description: "Les affirmations ne sont pas appuyees sur des citations precises et localisees du texte." },
  { code: 'FRT-COM-07', criterion: 'ORGANISATION',  severity: 'moderate', category: 'introduction_absente',  description: "Introduction ou conclusion absente ou reduite a une phrase : le texte n'est ni presente ni situe." },
  { code: 'FRT-COM-08', criterion: 'ORGANISATION',  severity: 'minor',    category: 'transition_absente',    description: "Aucune transition entre les parties : le devoir juxtapose deux blocs sans progression." },
  // --- Commun aux trois exercices
  { code: 'FRT-LANG-01', criterion: 'LANGUE',       severity: 'moderate', category: 'langue',                description: "Orthographe et syntaxe degradees au point de gener la lecture ou de rendre une phrase ambigue." },
  { code: 'FRT-LANG-02', criterion: 'LANGUE',       severity: 'minor',    category: 'registre',              description: "Registre familier ou oral (\"y'a\", \"du coup\", \"on voit trop bien\") dans un devoir ecrit." },
  { code: 'FRT-TRANS-01', criterion: 'TRANSCRIPTION', severity: 'major',  category: 'transcription',         description: "Mot, citation ou nom propre incertain dans la transcription : declenche une relecture humaine, jamais une sanction." },
];

/** Selectionne des codes pour une grille en redirigeant leur `criterion`. */
const taxoPour = (codes, versCritere = {}) =>
  TAXONOMIE.filter((e) => codes.includes(e.code)).map((e) =>
    versCritere[e.code] ? { ...e, criterion: versCritere[e.code] } : e,
  );

// ---------------------------------------------------------------------
//  Socle commun des consignes de correction
// ---------------------------------------------------------------------
const SOCLE_PROMPT =
  "ECHELLE DE NOTATION : le bareme de cette grille vaut 20 points. " +
  "Le champ note_finale doit etre exactement la somme des scores attribues aux criteres, donc un nombre compris entre 0 et 20. " +
  "Les copies etalons portent la meme echelle sur 20 : comparaison directe, sans conversion. " +
  "LIMITE DE LA TRANSCRIPTION : tu ne recois que le TEXTE transcrit de la copie. " +
  "[illisible], [rature] et [marge] sont des marques du transcripteur, jamais des erreurs de l'eleve. " +
  "Si la transcription signale un doute sur un mot ou une citation, tu retiens la lecture la PLUS FAVORABLE a l'eleve et tu passes human_review_required a true. " +
  "Tu ne sanctionnes jamais la mise en page, l'ecriture ni la longueur apparente : elles ne survivent pas a la transcription. " +
  "ELEVE DE VOIE TECHNOLOGIQUE : tu corriges une copie de premiere technologique, pas de voie generale. " +
  "Les attendus sont ceux de l'epreuve technologique : un devoir clair, appuye sur le texte, correctement organise. " +
  "Tu ne reproches jamais a l'eleve l'absence d'une culture litteraire de voie generale, ni un vocabulaire critique savant. " +
  "CODES D'ERREUR : tu emploies uniquement les codes de common_error_taxonomy de la grille fournie (FRT-xxx-nn). " +
  "Ignore toute autre liste de codes qui pourrait apparaitre dans le dossier de correction : elle provient d'une autre matiere ou de la voie generale. " +
  "ETALONS : les copies etalons servent a situer le niveau global. Le champ benchmark_comparison.lower_or_equal_id doit designer l'etalon dont la note est INFERIEURE OU EGALE a celle que tu attribues, et upper_or_equal_id celui dont la note est SUPERIEURE OU EGALE. " +
  "Methode imposee : classe d'abord les etalons par note croissante, place ta note dans ce classement, puis prends l'etalon immediatement en dessous et celui immediatement au-dessus. " +
  "Verifie l'ordre avant de repondre : la note de lower_or_equal_id ne peut JAMAIS etre superieure a la tienne, ni celle de upper_or_equal_id inferieure. " +
  "Si aucun etalon n'encadre la note d'un cote, reprends l'etalon le plus proche de ce cote et dis-le dans explanation.";

const CRIT_LANGUE = (max) => ({
  code: 'LANGUE',
  name: 'Correction de la langue',
  maximum_score: max,
  description:
    "Orthographe, syntaxe et registre : une langue qui ne gene pas la lecture. La langue se note sur ce qui survit a la transcription (constructions, accords lisibles, registre), jamais sur l'ecriture ni la presentation.",
  levels: {
    '0': 'Copie blanche, ou langue rendant le propos inintelligible.',
    [String(max * 0.5)]: "Insuffisant : phrases mal construites, registre oral, erreurs frequentes qui genent la comprehension.",
    [String(max * 0.75)]: 'Fragile a satisfaisant : la langue passe, quelques maladresses ou negligences subsistent.',
    [String(max)]: "Tres satisfaisant : phrases construites, vocabulaire juste, registre ecrit tenu du debut a la fin.",
  },
});

// ---------------------------------------------------------------------
//  1) LES 3 GRILLES
//     Ponderations choisies par Les Matinees du Bac a partir des attendus
//     publics de l'epreuve technologique. C'est le premier point a faire
//     trancher par un professeur de lettres.
// ---------------------------------------------------------------------
export const rubrics = [
  {
    id: 'FR_TECHNO_CONTRACTION_V1',
    track: 'technologique',
    exercise_type: 'contraction',
    version: 1,
    status: 'active',
    system_prompt:
      "Tu es un correcteur expert de l'epreuve anticipee de francais, voie technologique. " +
      "Tu corriges une CONTRACTION DE TEXTE : l'eleve devait resumer le texte donne au quart de sa longueur, avec une marge de 10 %. " +
      "REGLE PREMIERE DE L'EXERCICE : la contraction restitue, elle ne commente pas. Tu ne valorises jamais une remarque personnelle, une appreciation ou un exemple ajoute : ce sont des fautes, meme bien ecrites. " +
      "Tu verifies dans l'ordre : la these du texte est-elle restituee sans contresens ; les etapes du raisonnement sont-elles toutes presentes et dans l'ordre ; les liens logiques sont-ils conserves ; le texte est-il reformule et non recopie ; le nombre de mots est-il respecte et indique. " +
      "Une phrase recopiee telle quelle du texte est une faute de reformulation, meme si elle est bien choisie : tu la signales avec la citation exacte. " +
      "Le systeme d'enonciation du texte se conserve : l'eleve n'a pas a ecrire 'l'auteur dit que' a chaque phrase. " +
      "Tu comptes les mots de la copie et tu le dis explicitement dans ton commentaire du critere LONGUEUR ; si la transcription est incertaine, tu donnes une estimation et tu passes human_review_required a true. " +
      "L'exercice officiel compte pour 10 points dans l'epreuve, ou il est suivi d'un essai. Ici il est corrige seul : le bareme est donc RAMENE SUR 20, chaque critere valant le double de son poids officiel. Une note sur 20 obtenue ici se reporte sur 10 en la divisant par deux. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Une contraction se juge sur la fidelite au raisonnement de l'auteur, la hierarchisation des idees et la reformulation personnelle, dans le nombre de mots impose.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les attendus publics de l'epreuve anticipee de francais de la voie technologique (contraction au quart, marge de 10 %, restitution sans commentaire). La ponderation FIDELITE 7 / SELECTION 5 / REFORMULATION 4 / LONGUEUR 2 / LANGUE 2 et le passage sur 20 sont des choix des Matinees du Bac, pas un bareme officiel.",
      exam_context:
        "Epreuve ecrite anticipee de francais, voie technologique, 4 heures. Au choix : commentaire, ou contraction de texte suivie d'un essai (10 points chacun).",
      criteria: [
        {
          code: 'FIDELITE',
          name: 'Fidelite au texte et a sa these',
          maximum_score: 7,
          description:
            "Restituer ce que le texte dit, sans contresens, sans ajout, sans jugement. La these et la position de l'auteur doivent etre reconnaissables par quelqu'un qui n'a pas lu le texte.",
          levels: {
            '0': "Copie blanche, ou resume sans rapport avec le texte.",
            '1.75': "Insuffisant : contresens sur la these, ou resume noye dans des commentaires personnels.",
            '3.5': "Fragile : la these generale est perçue mais deformee sur un point important, ou des idees exterieures s'y melent.",
            '5.25': "Satisfaisant : these et position de l'auteur restituees fidelement, une nuance perdue.",
            '7': "Tres satisfaisant : these, position et nuances restituees exactement, sans aucun ajout ni commentaire.",
          },
        },
        {
          code: 'SELECTION',
          name: 'Selection et hierarchisation des idees',
          maximum_score: 5,
          description:
            "Distinguer les etapes du raisonnement des illustrations : garder tous les maillons, resumer ou supprimer les exemples, ne rien inverser dans l'ordre du propos.",
          levels: {
            '0': "Aucune hierarchisation : idees prises au hasard.",
            '1.25': "Insuffisant : plusieurs etapes du raisonnement manquent, les exemples occupent la place des idees.",
            '2.5': "Fragile : le raisonnement est reconnaissable mais un maillon manque, ou un exemple est developpe.",
            '3.75': "Satisfaisant : toutes les etapes sont presentes et ordonnees, la selection est globalement juste.",
            '5': "Tres satisfaisant : hierarchisation nette, exemples reduits d'un mot, aucune etape perdue.",
          },
        },
        {
          code: 'REFORMULATION',
          name: 'Reformulation et liens logiques',
          maximum_score: 4,
          description:
            "Redire avec ses propres mots en conservant l'enonciation du texte et ses articulations logiques (mais, donc, car, or). Recopier n'est pas contracter.",
          levels: {
            '0': "Copie recopiee ou illisible.",
            '1': "Insuffisant : phrases entieres recopiees, liens logiques disparus.",
            '2': "Fragile : reformulation partielle, quelques expressions du texte reprises telles quelles, articulations affaiblies.",
            '3': "Satisfaisant : reformulation personnelle, liens logiques presents.",
            '4': "Tres satisfaisant : reformulation entierement personnelle, raisonnement rendu visible par des connecteurs justes, enonciation tenue.",
          },
        },
        {
          code: 'LONGUEUR',
          name: 'Respect du format impose',
          maximum_score: 2,
          description:
            "Le nombre de mots demande, avec la marge de 10 % annoncee, et le decompte indique en fin de copie.",
          levels: {
            '0': "Format ignore : longueur tres eloignee de la consigne, ou aucune contraction (texte recopie).",
            '1': "Ecart hors marge, ou decompte absent.",
            '2': "Nombre de mots dans la marge et decompte indique.",
          },
        },
        CRIT_LANGUE(2),
      ],
      common_error_taxonomy: taxoPour([
        'FRT-CTR-01', 'FRT-CTR-02', 'FRT-CTR-03', 'FRT-CTR-04', 'FRT-CTR-05',
        'FRT-CTR-06', 'FRT-CTR-07', 'FRT-CTR-08', 'FRT-CTR-09',
        'FRT-LANG-01', 'FRT-LANG-02', 'FRT-TRANS-01',
      ]),
    },
  },
  {
    id: 'FR_TECHNO_ESSAI_V1',
    track: 'technologique',
    exercise_type: 'essai',
    version: 1,
    status: 'active',
    system_prompt:
      "Tu es un correcteur expert de l'epreuve anticipee de francais, voie technologique. " +
      "Tu corriges un ESSAI : une reponse argumentee et organisee a une question posee a partir du texte contracte. " +
      "REGLE PREMIERE DE L'EXERCICE : tu ne notes JAMAIS l'accord ou le desaccord avec la position de l'eleve. Une reponse contraire a la tienne, argumentee et illustree, merite une tres bonne note. Ce qui se note, c'est la comprehension de la question, la conduite de l'argumentation, la precision des exemples et l'organisation du devoir. " +
      "Tu verifies d'abord que la question POSEE est bien celle qui est TRAITEE : le deplacement de sujet est la faute la plus couteuse et tu dis precisement quelle question la copie traite en realite. " +
      "L'essai attend des exemples PRECIS : oeuvres etudiees en classe, lectures personnelles, situations concretes. Un exemple raconte mais non analyse ne rapporte que la moitie des points du critere EXEMPLES. " +
      "La consigne demande d'appuyer la reflexion sur le texte : une copie qui ne le mobilise jamais perd des points d'argumentation, meme si elle est brillante par ailleurs. " +
      "Tu attends une organisation simple et lisible : une introduction qui reformule la question et annonce, deux ou trois parties, une idee par paragraphe, une conclusion qui repond. Tu ne reclames pas de plan dialectique sophistique. " +
      "L'exercice officiel compte pour 10 points dans l'epreuve, ou il suit la contraction. Ici il est corrige seul : le bareme est donc RAMENE SUR 20, chaque critere valant le double de son poids officiel. Une note sur 20 obtenue ici se reporte sur 10 en la divisant par deux. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Un essai se juge sur la comprehension de la question, la conduite d'une argumentation personnelle appuyee sur des exemples precis, et la clarte de l'organisation.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les attendus publics de l'essai de la voie technologique (reponse argumentee et organisee, appui sur le texte, sur les oeuvres etudiees et sur les lectures personnelles). La ponderation PROBLEME 4 / ARGUMENTATION 7 / EXEMPLES 4 / STRUCTURE 3 / LANGUE 2 et le passage sur 20 sont des choix des Matinees du Bac.",
      exam_context:
        "Epreuve ecrite anticipee de francais, voie technologique, 4 heures. L'essai suit la contraction et porte sur une question liee au texte.",
      criteria: [
        {
          code: 'PROBLEME',
          name: 'Comprehension de la question',
          maximum_score: 4,
          description:
            "Comprendre exactement ce qui est demande, expliquer les mots cles de la question, annoncer une position ou une tension. Le sujet traite doit etre celui qui est pose.",
          levels: {
            '0': "Copie blanche, ou question totalement deplacee.",
            '1': "Insuffisant : la question est recopiee sans etre comprise, la copie traite un sujet voisin.",
            '2': "Fragile : la question est comprise globalement, ses termes ne sont pas expliques.",
            '3': "Satisfaisant : question reformulee, termes cles expliques, position annoncee.",
            '4': "Tres satisfaisant : question analysee, tension degagee, fil tenu jusqu'a la conclusion.",
          },
        },
        {
          code: 'ARGUMENTATION',
          name: 'Argumentation et appui sur le texte',
          maximum_score: 7,
          description:
            "Etablir plutot qu'affirmer : chaque idee est soutenue par un raisonnement, le texte support est mobilise, une objection peut etre envisagee.",
          levels: {
            '0': "Aucune argumentation exploitable.",
            '1.75': "Insuffisant : suite d'affirmations et d'opinions, aucun raisonnement, texte jamais mobilise.",
            '3.5': "Fragile : quelques arguments amorces mais inaboutis ; le texte est cite sans etre exploite.",
            '5.25': "Satisfaisant : arguments construits et relies, texte mobilise a bon escient, un maillon reste implicite.",
            '7': "Tres satisfaisant : argumentation progressive et personnelle, texte mis au travail, objection envisagee.",
          },
        },
        {
          code: 'EXEMPLES',
          name: 'Exemples et references',
          maximum_score: 4,
          description:
            "Des exemples precis et analyses : oeuvres etudiees, lectures personnelles, faits ou situations concretes. Un exemple ne vaut que si l'on montre ce qu'il prouve.",
          levels: {
            '0': "Aucun exemple.",
            '1': "Insuffisant : un exemple vague ou faux, aucune analyse.",
            '2': "Fragile : exemples reels mais racontes, jamais analyses.",
            '3': "Satisfaisant : exemples precis, analyses brievement, relies a l'argument.",
            '4': "Tres satisfaisant : exemples varies, precis, analyses et mis au service du raisonnement.",
          },
        },
        {
          code: 'STRUCTURE',
          name: 'Organisation du devoir',
          maximum_score: 3,
          description:
            "Introduction, parties reperables, une idee par paragraphe, conclusion qui repond a la question. La clarte prime sur la sophistication du plan.",
          levels: {
            '0': "Aucune organisation : bloc unique sans progression.",
            '0.75': "Insuffisant : ni introduction ni conclusion, paragraphes fourre-tout.",
            '1.5': "Fragile : organisation amorcee mais desequilibree, conclusion absente ou repetitive.",
            '2.25': "Satisfaisant : introduction, parties lisibles, conclusion qui repond.",
            '3': "Tres satisfaisant : progression nette, paragraphes construits, transitions presentes, conclusion qui apporte une reponse assumee.",
          },
        },
        CRIT_LANGUE(2),
      ],
      common_error_taxonomy: taxoPour([
        'FRT-ESS-01', 'FRT-ESS-02', 'FRT-ESS-03', 'FRT-ESS-04',
        'FRT-ESS-05', 'FRT-ESS-06', 'FRT-ESS-07', 'FRT-ESS-08',
        'FRT-LANG-01', 'FRT-LANG-02', 'FRT-TRANS-01',
      ]),
    },
  },
  {
    id: 'FR_TECHNO_COMMENTAIRE_V1',
    track: 'technologique',
    exercise_type: 'commentaire',
    version: 1,
    status: 'active',
    system_prompt:
      "Tu es un correcteur expert de l'epreuve anticipee de francais, voie technologique. " +
      "Tu corriges un COMMENTAIRE de texte litteraire de voie TECHNOLOGIQUE : le sujet fournit a l'eleve des axes de lecture, et l'exercice consiste a les exploiter, pas a en inventer d'autres. " +
      "REGLE PREMIERE DE L'EXERCICE : l'eleve n'a pas a construire son propre plan. Tu ne lui reproches JAMAIS d'avoir suivi les axes donnes ; tu evalues la maniere dont il les a developpes en sous-idees, appuyes sur des citations et relies au sens du texte. " +
      "Tu verifies dans l'ordre : le sens litteral du texte est-il compris ; les deux axes fournis sont-ils traites et developpes ; chaque affirmation est-elle appuyee sur une citation precise ; chaque procede releve est-il interprete (que produit-il sur le sens ?) ; le devoir a-t-il une introduction, une transition et une conclusion. " +
      "Un procede nomme sans effet explique ne rapporte rien : c'est la faute la plus frequente de l'exercice, tu la nommes avec la citation concernee. " +
      "Tu n'exiges ni vocabulaire critique savant, ni culture litteraire de voie generale : une analyse juste dite avec des mots simples vaut la note maximale. " +
      "Tu cites les formulations exactes de la copie pour justifier chaque score. " +
      SOCLE_PROMPT,
    rubric_json: {
      maximum_score: 20,
      principle:
        "Un commentaire de voie technologique se juge sur la comprehension du texte et sur l'exploitation des axes fournis : developper, citer, interpreter, organiser.",
      source_status: 'grille_interne_matinees_du_bac_a_valider_par_un_professeur',
      official_basis:
        "Construite sur les attendus publics du commentaire de la voie technologique (parcours de lecture indique par le sujet, analyse appuyee sur des citations, organisation simple). La ponderation COMPREHENSION 5 / EXPLOITATION 5 / ANALYSE 5 / ORGANISATION 3 / LANGUE 2 est un choix des Matinees du Bac.",
      exam_context:
        "Epreuve ecrite anticipee de francais, voie technologique, 4 heures. Le commentaire est note sur 20 et le sujet fournit deux axes de lecture.",
      criteria: [
        {
          code: 'COMPREHENSION',
          name: 'Comprehension du texte',
          maximum_score: 5,
          description:
            "Comprendre ce que dit le texte : la situation, le locuteur, le mouvement d'ensemble. Aucun contresens, et pas de simple paraphrase.",
          levels: {
            '0': "Copie blanche, ou texte non compris.",
            '1.25': "Insuffisant : contresens majeur sur la situation ou le propos du texte.",
            '2.5': "Fragile : sens global perçu, mais le devoir raconte le texte plus qu'il ne l'explique.",
            '3.75': "Satisfaisant : texte compris, mouvement d'ensemble identifie, paraphrase occasionnelle.",
            '5': "Tres satisfaisant : comprehension fine, y compris des passages difficiles ou implicites.",
          },
        },
        {
          code: 'EXPLOITATION',
          name: 'Exploitation des axes fournis',
          maximum_score: 5,
          description:
            "Traiter les deux axes donnes par le sujet, les developper chacun en sous-idees, les equilibrer. Le guidage est une aide : ne pas s'en servir est la faute propre a cet exercice.",
          levels: {
            '0': "Les axes ne sont pas utilises.",
            '1.25': "Insuffisant : les axes sont recopies comme titres, sans aucun developpement.",
            '2.5': "Fragile : un axe developpe, l'autre expedie en quelques lignes.",
            '3.75': "Satisfaisant : les deux axes traites et developpes, avec des sous-idees identifiables.",
            '5': "Tres satisfaisant : les deux axes developpes, equilibres, articules entre eux et relies au sens general du texte.",
          },
        },
        {
          code: 'ANALYSE',
          name: 'Citations et analyse des procedes',
          maximum_score: 5,
          description:
            "Appuyer chaque idee sur une citation precise, nommer le procede et surtout EXPLIQUER son effet sur le sens. Le releve seul ne vaut rien.",
          levels: {
            '0': "Aucune citation, aucune analyse.",
            '1.25': "Insuffisant : affirmations sans citation, ou citations sans commentaire.",
            '2.5': "Fragile : citations presentes, procedes nommes mais effets non expliques.",
            '3.75': "Satisfaisant : citations precises, procedes interpretes dans la majorite des cas.",
            '5': "Tres satisfaisant : chaque analyse relie une citation, un procede et un effet de sens.",
          },
        },
        {
          code: 'ORGANISATION',
          name: 'Organisation et redaction du devoir',
          maximum_score: 3,
          description:
            "Une introduction qui presente et situe le texte et annonce les axes, des paragraphes construits, une transition, une conclusion qui fait le bilan.",
          levels: {
            '0': "Aucune organisation reperable.",
            '0.75': "Insuffisant : ni introduction ni conclusion, devoir en bloc.",
            '1.5': "Fragile : introduction ou conclusion reduite a une phrase, transition absente.",
            '2.25': "Satisfaisant : introduction, deux parties, conclusion presentes.",
            '3': "Tres satisfaisant : introduction complete, transition explicite, conclusion qui fait le bilan et ouvre.",
          },
        },
        CRIT_LANGUE(2),
      ],
      common_error_taxonomy: taxoPour([
        'FRT-COM-01', 'FRT-COM-02', 'FRT-COM-03', 'FRT-COM-04',
        'FRT-COM-05', 'FRT-COM-06', 'FRT-COM-07', 'FRT-COM-08',
        'FRT-LANG-01', 'FRT-LANG-02', 'FRT-TRANS-01',
      ]),
    },
  },
];

// ---------------------------------------------------------------------
//  2) LES 3 SUJETS
//     Deux textes du domaine public, verifies sur Wikisource et a
//     reverifier sur une edition de reference avant la session.
// ---------------------------------------------------------------------
const TEXTE_HUGO = `Je ne suis pas, Messieurs, de ceux qui croient qu’on peut supprimer la souffrance en ce monde ; la souffrance est une loi divine ; mais je suis de ceux qui pensent et qui affirment qu’on peut détruire la misère.

Remarquez-le bien, Messieurs, je ne dis pas diminuer, amoindrir, limiter, circonscrire, je dis détruire. La misère est une maladie du corps social comme la lèpre était une maladie du corps humain ; la misère peut disparaître comme la lèpre a disparu. Détruire la misère ! Oui, cela est possible. Les législateurs et les gouvernants doivent y songer sans cesse ; car, en pareille matière, tant que le possible n’est pas fait, le devoir n’est pas rempli.

La misère, Messieurs, j’aborde ici le vif de la question, voulez-vous savoir où elle en est, la misère ? Voulez-vous savoir jusqu’où elle peut aller, jusqu’où elle va, je ne dis pas en Irlande, je ne dis pas au moyen-âge, je dis en France, je dis à Paris, et au temps où nous vivons ? Voulez-vous des faits ?

Il y a dans Paris…

Mon Dieu, je n’hésite pas à les citer, ces faits. Ils sont tristes, mais nécessaires à révéler ; et tenez, s’il faut dire toute ma pensée, je voudrais qu’il sortît de cette Assemblée, et au besoin j’en ferai la proposition formelle, une grande et solennelle enquête sur la situation vraie des classes laborieuses et souffrantes en France. Je voudrais que tous les faits éclatassent au grand jour. Comment veut-on guérir le mal si l’on ne sonde pas les plaies ?

Voici donc ces faits.

Il y a dans Paris, dans ces faubourgs de Paris que le vent de l’émeute soulevait naguère si aisément, il y a des rues, des maisons, des cloaques, où des familles, des familles entières, vivent pêle-mêle, hommes, femmes, jeunes filles, enfants, n’ayant pour lits, n’ayant pour couvertures, j’ai presque dit pour vêtements, que des monceaux infects de chiffons en fermentation, ramassés dans la fange du coin des bornes, espèce de fumier des villes, où des créatures s’enfouissent toutes vivantes pour échapper au froid de l’hiver.

Voilà un fait. En voulez-vous d’autres ? Ces jours-ci, un homme, mon Dieu, un malheureux homme de lettres, car la misère n’épargne pas plus les professions libérales que les professions manuelles, un malheureux homme est mort de faim, mort de faim à la lettre, et l’on a constaté, après sa mort, qu’il n’avait pas mangé depuis six jours. Voulez-vous quelque chose de plus douloureux encore ? Le mois passé, pendant la recrudescence du choléra, on a trouvé une mère et ses quatre enfants qui cherchaient leur nourriture dans les débris immondes et pestilentiels des charniers de Montfaucon !

Eh bien, messieurs, je dis que ce sont là des choses qui ne doivent pas être ; je dis que la société doit dépenser toute sa force, toute sa sollicitude, toute son intelligence, toute sa volonté, pour que de telles choses ne soient pas ! Je dis que de tels faits, dans un pays civilisé, engagent la conscience de la société tout entière ; que je m’en sens, moi qui parle, complice et solidaire, et que de tels faits ne sont pas seulement des torts envers l’homme, que ce sont des crimes envers Dieu !

Voilà pourquoi je suis pénétré, voilà pourquoi je voudrais pénétrer tous ceux qui m’écoutent de la haute importance de la proposition qui vous est soumise. Ce n’est qu’un premier pas, mais il est décisif. Je voudrais que cette Assemblée, majorité et minorité, n’importe, je ne connais pas, moi de majorité et de minorité en de telles questions ; je voudrais que cette Assemblée n’eût qu’une seule âme pour marcher à ce grand but, à ce but magnifique, à ce but sublime, l’abolition de la misère !

Et, messieurs, je ne m’adresse pas seulement à votre générosité, je m’adresse à ce qu’il y a de plus sérieux dans le sentiment politique d’une assemblée de législateurs. Et, à ce sujet, un dernier mot : je terminerai par là.

Messieurs, comme je vous le disais tout à l’heure, vous venez, avec le concours de la garde nationale, de l’armée et de toutes les forces vives du pays, vous venez de raffermir l’État ébranlé encore une fois. Vous n’avez reculé devant aucun péril, vous n’avez hésité devant aucun devoir. Vous avez sauvé la société régulière, le gouvernement légal, les institutions, la paix publique, la civilisation même. Vous avez fait une chose considérable… Eh bien ! Vous n’avez rien fait !

Vous n’avez rien fait, j’insiste sur ce point, tant que l’ordre matériel raffermi n’a point pour base l’ordre moral consolidé ! Vous n’avez rien fait tant que le peuple souffre ! Vous n’avez rien fait tant qu’il y a au-dessous de vous une partie du peuple qui désespère ! Vous n’avez rien fait, tant que ceux qui sont dans la force de l’âge et qui travaillent peuvent être sans pain ! tant que ceux qui sont vieux et qui ne peuvent plus travailler sont sans asile ! tant que l’usure dévore nos campagnes, tant qu’on meurt de faim dans nos villes, tant qu’il n’y a pas des lois fraternelles, des lois évangéliques qui viennent de toutes parts en aide aux pauvres familles honnêtes, aux bons paysans, aux bons ouvriers, aux gens de cœur ! Vous n’avez rien fait, tant que l’esprit de révolution a pour auxiliaire la souffrance publique ! Vous n’avez rien fait, rien fait, tant que, dans cette œuvre de destruction et de ténèbres, qui se continue souterrainement, l’homme méchant a pour collaborateur fatal l’homme malheureux !

Vous le voyez, messieurs, je le répète en terminant, ce n’est pas seulement à votre générosité que je m’adresse, c’est à votre sagesse, et je vous conjure d’y réfléchir. Messieurs, songez-y, c’est l’anarchie qui ouvre les abîmes, mais c’est la misère qui les creuse. Vous avez fait des lois contre l’anarchie, faites maintenant des lois contre la misère !`;

const TEXTE_ALBATROS = `Souvent, pour s’amuser, les hommes d’équipage
Prennent des albatros, vastes oiseaux des mers,
Qui suivent, indolents compagnons de voyage,
Le navire glissant sur les gouffres amers.

À peine les ont-ils déposés sur les planches,
Que ces rois de l’azur, maladroits et honteux,
Laissent piteusement leurs grandes ailes blanches
Comme des avirons traîner à côté d’eux.

Ce voyageur ailé, comme il est gauche et veule !
Lui, naguère si beau, qu’il est comique et laid !
L’un agace son bec avec un brûle-gueule,
L’autre mime, en boitant, l’infirme qui volait !

Le Poëte est semblable au prince des nuées
Qui hante la tempête et se rit de l’archer ;
Exilé sur le sol au milieu des huées,
Ses ailes de géant l’empêchent de marcher.`;

const AVERTISSEMENT_TEXTE =
  "Texte du domaine public etabli d'apres Wikisource. A VERIFIER MOT A MOT sur une edition de reference avant la session : un commentaire et une contraction se corrigent sur le texte exact.";

const AVERTISSEMENT_SUJET =
  "Fiche redigee par Les Matinees du Bac pour ouvrir la voie technologique du francais, qui n'existait pas en base. Ce n'est pas une annale. Le jour ou le sujet reel du bac blanc technologique est ecrit, il remplace cette fiche.";

export const subject_cards = [
  {
    id: 'FR-TECHNO-CONTRACTION-HUGO-MISERE',
    track: 'technologique',
    exercise_type: 'contraction',
    work_id: null,
    status: 'active',
    card_json: {
      exercise: 'Contraction de texte',
      work: 'Victor Hugo, « Détruire la misère » (1849)',
      author: 'Victor Hugo',
      publication_year: 1849,
      study_object: "La littérature d'idées et la presse du XIXᵉ au XXIᵉ siècle",
      maximum_score: 20,
      instruction:
        "Vous résumerez ce texte en 250 mots, avec une marge de plus ou moins 10 % (soit entre 225 et 275 mots). Vous indiquerez le nombre de mots employés à la fin de votre copie.",
      target_words: 250,
      tolerance_percent: 10,
      source_words: 986,
      texte_support: TEXTE_HUGO,
      document_requirements: "Le texte à contracter, fourni ci-dessus dans texte_support.",
      presentation:
        "Discours prononcé par Victor Hugo à l'Assemblée nationale législative le 9 juillet 1849, lors de la discussion d'une proposition de loi sur l'assistance publique.",
      these_du_texte:
        "La misère n'est pas une fatalité mais une maladie sociale que la loi peut supprimer ; tant qu'elle subsiste, les législateurs n'ont rien fait, quelles que soient leurs autres réussites.",
      etapes_attendues: [
        "Distinction initiale entre la souffrance, inévitable, et la misère, qui peut être détruite.",
        "Refus des demi-mesures : détruire, et non diminuer ; comparaison de la misère avec la lèpre, maladie vaincue.",
        "Appel à une enquête publique : on ne guérit pas un mal que l'on refuse de regarder.",
        "Trois faits parisiens donnés comme preuves de l'état réel de la misère.",
        "Passage du constat à la responsabilité : de tels faits engagent la conscience de la société entière.",
        "Appel à l'unité de l'Assemblée, au-delà de la majorité et de la minorité.",
        "Renversement final : avoir rétabli l'ordre matériel ne compte pour rien tant que le peuple souffre.",
        "Conclusion : après les lois contre l'anarchie, faire des lois contre la misère.",
      ],
      pieges: [
        "Conserver les trois faits parisiens en détail : ce sont des exemples, ils doivent être ramenés à une phrase.",
        "Commenter l'éloquence de Hugo ou juger son propos : la contraction restitue, elle ne commente pas.",
        "Perdre le renversement final (« vous n'avez rien fait »), qui est le mouvement décisif du discours.",
        "Recopier les formules célèbres au lieu de les reformuler.",
      ],
      source_status: 'texte_domaine_public_a_verifier',
      source_verification_required: true,
      source_references: [
        { type: 'wikisource', url: 'https://fr.wikisource.org/wiki/D%C3%A9truire_la_mis%C3%A8re,_Discours_%C3%A0_l%27Assembl%C3%A9e_nationale_l%C3%A9gislative_9_juillet_1849_(extrait)' },
        { type: 'edition_de_reference', url: 'Victor Hugo, Actes et Paroles, tome I, Œuvres complètes, Imprimerie nationale' },
      ],
      texte_adaptation:
        "Les réactions de l'Assemblée notées entre parenthèses dans l'édition (« Mouvement. », « Très bien ! ») ont été retirées pour l'exercice : elles ne se contractent pas. Le texte fait alors 986 mots.",
      warning: AVERTISSEMENT_TEXTE + ' ' + AVERTISSEMENT_SUJET,
    },
  },
  {
    id: 'FR-TECHNO-ESSAI-HUGO-MISERE',
    track: 'technologique',
    exercise_type: 'essai',
    work_id: null,
    status: 'active',
    card_json: {
      exercise: 'Essai',
      work: 'Victor Hugo, « Détruire la misère » (1849)',
      author: 'Victor Hugo',
      study_object: "La littérature d'idées et la presse du XIXᵉ au XXIᵉ siècle",
      maximum_score: 20,
      instruction:
        "« Écrire sur la misère, est-ce déjà agir contre elle ? » Vous répondrez à cette question dans un essai organisé d'une quarantaine de lignes, en vous appuyant sur le texte de Victor Hugo, sur les œuvres étudiées en classe et sur vos lectures personnelles.",
      question:
        "Écrire sur la misère, est-ce déjà agir contre elle ?",
      texte_support: TEXTE_HUGO,
      document_requirements: "Le texte support de la contraction, fourni ci-dessus dans texte_support.",
      pistes_attendues: [
        "Oui : le texte rend visible ce que l'on ne veut pas voir ; Hugo choisit des faits précis parce que la description est déjà une accusation.",
        "Oui : la littérature agit sur les consciences avant d'agir sur les lois ; elle crée une opinion, une émotion partagée, une pression sur les gouvernants.",
        "Non, ou pas seulement : un discours n'est pas une loi ; Hugo lui-même demande une enquête et des lois, ce qui montre que l'écrit ne suffit pas.",
        "Nuance : l'écrit agit s'il est relayé, lu, entendu ; sa portée dépend de qui l'écoute — Hugo parle devant une Assemblée qui peut légiférer.",
      ],
      exemples_possibles: [
        "Victor Hugo, Les Misérables : le roman comme enquête sur la pauvreté.",
        "Émile Zola, « J'accuse… ! » : un article de presse qui provoque un procès.",
        "Les œuvres au programme de l'objet d'étude « La littérature d'idées ».",
        "Une lecture personnelle, un reportage, un documentaire ou une campagne récente.",
      ],
      pieges: [
        "Réciter le cours sur l'engagement littéraire sans jamais répondre à la question posée.",
        "Rester dans l'affirmation générale (« la littérature change le monde ») sans un seul exemple analysé.",
        "Oublier le texte de Hugo, que la consigne demande explicitement de mobiliser.",
        "Confondre l'essai avec un commentaire du texte : ici, le texte est un appui, pas l'objet.",
      ],
      source_status: 'sujet_interne_matinees_du_bac',
      warning: AVERTISSEMENT_TEXTE + ' ' + AVERTISSEMENT_SUJET,
    },
  },
  {
    id: 'FR-TECHNO-COM-BAUDELAIRE-ALBATROS',
    track: 'technologique',
    exercise_type: 'commentaire',
    work_id: null,
    status: 'active',
    card_json: {
      exercise: 'Commentaire (voie technologique)',
      work: "Charles Baudelaire, « L'Albatros », Les Fleurs du mal (1861)",
      author: 'Charles Baudelaire',
      publication_year: 1861,
      study_object: 'La poésie du XIXᵉ au XXIᵉ siècle',
      maximum_score: 20,
      instruction:
        "Vous commenterez le poème de Charles Baudelaire en vous aidant du parcours de lecture suivant :\n1. Vous montrerez d'abord comment le poème raconte la chute d'un oiseau majestueux devenu objet de moquerie.\n2. Vous étudierez ensuite comment cette scène devient une image de la condition du poète.",
      axes_fournis: [
        "Vous montrerez d'abord comment le poème raconte la chute d'un oiseau majestueux devenu objet de moquerie.",
        "Vous étudierez ensuite comment cette scène devient une image de la condition du poète.",
      ],
      texte_support: TEXTE_ALBATROS,
      document_requirements: "Le poème à commenter, fourni ci-dessus dans texte_support.",
      presentation:
        "Poème de la section « Spleen et Idéal » des Fleurs du mal, dans l'édition de 1861.",
      text_movements: [
        { order: 1, scope: 'Strophes 1 et 2', function: "La capture : l'oiseau est saisi par jeu, puis déposé sur le pont où sa grandeur devient encombrement." },
        { order: 2, scope: 'Strophe 3', function: "La moquerie : les marins imitent et humilient l'oiseau, le vocabulaire du comique et du laid s'installe." },
        { order: 3, scope: 'Strophe 4', function: "La comparaison explicite : le poète est ce prince des nuées, souverain dans son élément, infirme parmi les hommes." },
      ],
      attendus_axe_1: [
        "L'opposition entre le ciel et le pont du navire : « rois de l'azur » contre « déposés sur les planches ».",
        "Le vocabulaire de la grandeur (« vastes oiseaux », « rois de l'azur », « grandes ailes blanches ») renversé en vocabulaire de la maladresse (« maladroits », « honteux », « gauche et veule », « comique et laid »).",
        "La gratuité de la scène : « pour s'amuser » ouvre le poème et fait de la cruauté un jeu.",
        "La comparaison des ailes avec des avirons : ce qui servait à voler ne sert plus qu'à traîner.",
      ],
      attendus_axe_2: [
        "Le passage du récit à la comparaison : « Le Poëte est semblable au prince des nuées ».",
        "L'albatros comme allégorie : l'élévation du poète et son inadaptation au monde ordinaire.",
        "Les huées de la dernière strophe qui répondent aux moqueries des marins.",
        "Le vers final : le même trait, les ailes de géant, fait la grandeur et l'infirmité.",
      ],
      pieges: [
        "Traiter les deux axes comme deux titres à recopier sans les développer en sous-idées.",
        "Relever des figures de style sans expliquer ce qu'elles produisent sur le sens.",
        "Raconter le poème strophe après strophe : c'est de la paraphrase, pas du commentaire.",
        "Oublier la dernière strophe, qui porte le sens allégorique du poème.",
      ],
      source_status: 'texte_domaine_public_a_verifier',
      source_verification_required: true,
      source_references: [
        { type: 'wikisource', url: 'https://fr.wikisource.org/wiki/Les_Fleurs_du_mal_(1861)/L%E2%80%99Albatros' },
        { type: 'edition_de_reference', url: 'Charles Baudelaire, Les Fleurs du mal, Poulet-Malassis et de Broise, 1861, p. 11-12' },
      ],
      warning: AVERTISSEMENT_TEXTE + ' ' + AVERTISSEMENT_SUJET,
    },
  },
];

// ---------------------------------------------------------------------
//  3) LES 15 ETALONS (5 par sujet)
//     Profils synthetiques : aucune copie reelle de voie technologique
//     n'etait disponible a l'installation. Ils calent l'echelle, ils ne
//     la prouvent pas — a remplacer par 3 vraies copies notees.
// ---------------------------------------------------------------------
const BANDES = {
  contraction: [
    { suffixe: 'N05', score: 5,  role: 'niveau_05_tres_insuffisant', profil: 'texte non contracte', forces: "Quelques idees du texte apparaissent.", limites: "Phrases recopiees du texte, these non degagee, longueur tres eloignee de la consigne, aucun decompte.", codes: ['FRT-CTR-06', 'FRT-CTR-01', 'FRT-CTR-09'] },
    { suffixe: 'N08', score: 8,  role: 'niveau_08_insuffisant',      profil: 'resume partiel et commente', forces: "La these generale est perçue.", limites: "Les exemples sont conserves au detriment des etapes du raisonnement, des commentaires personnels s'ajoutent, la fin du texte est perdue.", codes: ['FRT-CTR-05', 'FRT-CTR-03', 'FRT-CTR-04'] },
    { suffixe: 'N11', score: 11, role: 'niveau_11_moyen',            profil: 'contraction honnete mais deformee', forces: "These restituee, longueur a peu pres respectee, reformulation amorcee.", limites: "Un maillon du raisonnement manque, quelques expressions du texte sont reprises telles quelles, les liens logiques s'effacent.", codes: ['FRT-CTR-04', 'FRT-CTR-08'] },
    { suffixe: 'N14', score: 14, role: 'niveau_14_bon',              profil: 'contraction fidele et bien construite', forces: "Toutes les etapes presentes et ordonnees, reformulation personnelle, longueur et decompte conformes.", limites: "Une nuance de la these est perdue, un ou deux liens logiques restent implicites.", codes: ['FRT-CTR-08'] },
    { suffixe: 'N17', score: 17, role: 'niveau_17_tres_bon',         profil: 'contraction exacte, dense et personnelle', forces: "These, etapes et nuances restituees, reformulation entierement personnelle, articulations logiques visibles, format respecte au mot pres.", limites: '', codes: [] },
  ],
  essai: [
    { suffixe: 'N05', score: 5,  role: 'niveau_05_tres_insuffisant', profil: 'question deplacee', forces: "Une opinion est exprimee.", limites: "La question posee n'est pas traitee, aucun exemple, aucune organisation reperable.", codes: ['FRT-ESS-01', 'FRT-ESS-05', 'FRT-ESS-07'] },
    { suffixe: 'N08', score: 8,  role: 'niveau_08_insuffisant',      profil: 'affirmations sans preuve', forces: "La question est comprise globalement et une position est prise.", limites: "Suite d'affirmations, aucun raisonnement suivi, le texte support n'est jamais mobilise, un seul exemple vague.", codes: ['FRT-ESS-03', 'FRT-ESS-04', 'FRT-ESS-06'] },
    { suffixe: 'N11', score: 11, role: 'niveau_11_moyen',            profil: 'essai construit mais peu argumente', forces: "Introduction et conclusion presentes, deux parties reperables, exemples reels.", limites: "Les exemples sont racontes et non analyses, les termes de la question ne sont pas expliques, un paragraphe melange deux idees.", codes: ['FRT-ESS-06', 'FRT-ESS-02', 'FRT-ESS-08'] },
    { suffixe: 'N14', score: 14, role: 'niveau_14_bon',              profil: 'essai argumente et illustre', forces: "Question reformulee, arguments relies, texte de Hugo mobilise, exemples precis et analyses.", limites: "Une objection possible n'est pas envisagee, la conclusion repete l'introduction.", codes: ['FRT-ESS-08'] },
    { suffixe: 'N17', score: 17, role: 'niveau_17_tres_bon',         profil: 'essai personnel, nuance et documente', forces: "Question analysee et tension degagee, argumentation progressive, texte mis au travail, exemples varies et analyses, conclusion qui assume une reponse.", limites: '', codes: [] },
  ],
  commentaire: [
    { suffixe: 'N05', score: 5,  role: 'niveau_05_tres_insuffisant', profil: 'paraphrase sans axes', forces: "Le sujet du poeme est identifie.", limites: "Le texte est raconte stophe apres strophe, les axes fournis ne sont pas utilises, aucune citation analysee.", codes: ['FRT-COM-02', 'FRT-COM-03', 'FRT-COM-06'] },
    { suffixe: 'N08', score: 8,  role: 'niveau_08_insuffisant',      profil: 'axes recopies mecaniquement', forces: "Les deux axes apparaissent comme titres, quelques citations sont donnees.", limites: "Les axes ne sont pas developpes en sous-idees, les procedes sont nommes sans que leur effet soit explique, pas d'introduction.", codes: ['FRT-COM-03', 'FRT-COM-05', 'FRT-COM-07'] },
    { suffixe: 'N11', score: 11, role: 'niveau_11_moyen',            profil: 'un axe traite, l’autre expedie', forces: "Texte compris, premier axe developpe avec des citations.", limites: "Le second axe est traite en quelques lignes, plusieurs releves restent sans interpretation, aucune transition.", codes: ['FRT-COM-04', 'FRT-COM-05', 'FRT-COM-08'] },
    { suffixe: 'N14', score: 14, role: 'niveau_14_bon',              profil: 'commentaire complet et appuye', forces: "Les deux axes developpes et equilibres, citations precises, procedes interpretes, introduction et conclusion presentes.", limites: "Quelques analyses restent descriptives, la derniere strophe est peu exploitee.", codes: ['FRT-COM-05'] },
    { suffixe: 'N17', score: 17, role: 'niveau_17_tres_bon',         profil: 'commentaire fin et bien conduit', forces: "Comprehension fine y compris de l'allegorie finale, axes developpes et articules, chaque citation reliee a un procede et a un effet de sens, devoir construit.", limites: '', codes: [] },
  ],
};

/**
 * Repartit une note sur 20 entre les criteres, proportionnellement a leur
 * maximum, arrondie au quart de point ; le reste d'arrondi va sur le
 * critere le plus lourd pour que la somme tombe EXACTEMENT juste.
 */
function repartir(criteria, note) {
  const total = criteria.reduce((s, c) => s + c.maximum_score, 0);
  const parts = criteria.map((c) => ({
    code: c.code,
    max: c.maximum_score,
    valeur: Math.round(((note * c.maximum_score) / total) * 4) / 4,
  }));
  const ecart = Math.round((note - parts.reduce((s, p) => s + p.valeur, 0)) * 100) / 100;
  if (ecart !== 0) {
    const cible = [...parts].sort((a, b) => b.max - a.max)[0];
    cible.valeur = Math.min(cible.max, Math.max(0, Math.round((cible.valeur + ecart) * 100) / 100));
  }
  return Object.fromEntries(parts.map((p) => [p.code, p.valeur]));
}

export const benchmark_cards = subject_cards.flatMap((sujet) => {
  const grille = rubrics.find(
    (r) => r.track === sujet.track && r.exercise_type === sujet.exercise_type,
  );
  return BANDES[sujet.exercise_type].map((bande) => ({
    id: `${sujet.id}_${bande.suffixe}`,
    track: sujet.track,
    exercise_type: sujet.exercise_type,
    subject_id: sujet.id,
    score: bande.score,
    error_codes: bande.codes,
    validation_status: 'candidate',
    card_json: {
      annee: String(session),
      support: sujet.card_json.work,
      exercice: sujet.card_json.exercise,
      profil: bande.profil,
      forces: bande.forces,
      limites: bande.limites || "Rien de substantiel a reprendre a ce niveau.",
      erreurs_observees: bande.codes,
      same_subject: true,
      benchmark_role: bande.role,
      origin: 'synthetic_calibration_profile',
      origin_warning:
        "Profil synthetique de calibration : aucune copie reelle de francais voie technologique n'etait disponible a l'installation de la filiere. A remplacer ou confirmer par des copies authentiques anonymisees et notees par un professeur.",
      normalised_score_on_20: bande.score,
      criterion_scores: repartir(grille.rubric_json.criteria, bande.score),
      criterion_scale: 'sur 20, echelle de la grille',
    },
  }));
});

// ---------------------------------------------------------------------
//  4) LES 3 GABARITS DE DOSSIER ELEVE
//     Meme charpente que les autres matieres : 8 sections numerotees,
//     note en fourchette, budget de longueur.
// ---------------------------------------------------------------------
const FOURCHETTE = `
LA NOTE S'AFFICHE EN FOURCHETTE, JAMAIS EN NOTE SÈCHE. Règle de calcul, à appliquer telle quelle :
- demi-largeur = 5 % du barème total, arrondie au demi-point (sur un barème de 20, cela fait 1 point).
- si correction.human_review_required vaut true, tu DOUBLES cette demi-largeur : une correction incertaine s'annonce plus large.
- borne basse = note_finale − demi-largeur, borne haute = note_finale + demi-largeur, chacune arrondie au demi-point et ramenée dans l'intervalle [0 ; barème total].
- Exemple sur 20 : note_finale = 13 → fourchette « 12 – 14 ».
Où elle apparaît :
- BADGE de couverture : <div class="n">12 – 14</div><div class="d">/ 20</div> (les deux bornes, jamais la note exacte).
- cover-note, juste dessous : "Estimation issue d'une correction automatique — ton professeur peut situer ta copie à l'intérieur de cette fourchette." Si human_review_required vaut true, ajoute " Cette copie demande une relecture : la fourchette est volontairement large."
- Ligne TOTAL du tableau de barème : la fourchette, pas la somme. Les lignes de critères gardent leur score exact.
- Partout ailleurs (appréciation, plan de progression, projection), tu parles de la fourchette ou d'un objectif, jamais d'une note exacte. Le titre de la section 5 devient "DE {borne basse}–{borne haute} À {cible}/20".
Tu n'écris nulle part la valeur exacte de note_finale.`;

const RAPPEL_TECHNO = `
RAPPEL SUR L'ÉLÈVE : c'est un élève de PREMIÈRE TECHNOLOGIQUE. Les attendus de l'épreuve sont ceux de sa voie : un devoir clair, appuyé sur le texte, correctement organisé. Tu ne lui reproches jamais de ne pas avoir la culture littéraire ni le vocabulaire critique de la voie générale, et tu ne lui proposes pas des références de voie générale comme si elles allaient de soi. Les exemples que tu suggères sont accessibles : les œuvres de son programme, une lecture, un film, une situation concrète.

RÈGLES NON NÉGOCIABLES :
- Tu n'inventes JAMAIS une citation, une référence ou une analyse que la copie ne contient pas. Une suggestion est annoncée comme une piste pour la prochaine fois.
- Tu ne recorriges pas : tous les scores viennent de correction.criteria, sans exception.
- Toute citation de l'élève vient de la transcription. Si la transcription manque, tu décris sans citer.
- À chaque perte de points, tu montres la FORMULATION attendue, entièrement rédigée, pas seulement le défaut constaté.
- Tu tutoies l'élève. Ton exigeant et bienveillant, jamais de flatterie, jamais de reproche sans la correction à appliquer.
- Ne produis rien d'autre que le corps HTML.

BUDGET DE LONGUEUR — contrainte technique, pas stylistique : le dossier complet doit tenir sous 24 000 caractères de HTML. Le générateur est coupé au-delà et l'élève ne reçoit alors RIEN. Tu restes au bas des fourchettes quand la copie ne justifie pas plus, et tu ne répètes pas d'une section à l'autre.`;

const enTeteDossier = (titre, sousTitre) => `
Tu rédiges le dossier HTML de correction d'un élève de première technologique, après ${titre}.

STRUCTURE (dans <div class="page"> … <div class="wrap"> … </div></div>) :

COUVERTURE :
- cover-band : <h1>DOSSIER DE CORRECTION</h1><div class="sub">FRANÇAIS · VOIE TECHNOLOGIQUE · ${sousTitre}</div>
- cover-id : name = identite.eleve ; work = sujet.work ; work-meta = sujet.exercise + " · Bac blanc" ; badge = fourchette de note, "/ 20" ; cover-note = voir la règle de fourchette plus bas.
- .wrap : rappelle d'abord le sujet dans une .box cream (lab "Sujet") = sujet.instruction. Puis table.bareme, une ligne par correction.criteria[] avec le nom complet du critère, + TOTAL. Puis .cap de contexte.

SECTION 1 — NOTE DÉTAILLÉE & APPRÉCIATION
- h3.sub "Niveau par critère" : table.radar, une ligne par critère. Colonne /10 = round(score/maximum*10,1) ; barre width = score/maximum*100 % ; colonne Observation = le NIVEAU ATTEINT parmi Très satisfaisant / Satisfaisant / Fragile / Insuffisant, suivi de six à douze mots de justification.
- h3.sub "Appréciation du correcteur" : correction.appreciation_generale développée en 2 paragraphes .just suivant cet ordre — qualité générale, ce qui fonctionne, le principal frein à une note plus haute, le potentiel réel. Finir par une phrase en gras fixant un objectif chiffré pour la prochaine copie.`;

const sectionsCommunes = (memo) => `
SECTION 3 — CE QUI FAIT BAISSER LA NOTE · CE QUE TU MAÎTRISES
- h3.sub "Erreurs pénalisantes" : 3 à 5 .err construits sur correction.detected_errors, classés par impact décroissant sur la note. Chaque .err dit : ce qui est faux ou manquant · ce qu'il fallait faire · pourquoi cela coûte des points · "Comment corriger :" en gras avec la FORMULATION modèle entièrement rédigée.
- h3.sub "Ce qui manquait" : une .box cream (lab "À ajouter") comparant les attendus de la fiche sujet à ce que la copie mobilise réellement ; chaque manque expliqué en une phrase et situé à l'endroit du devoir où il aurait servi.
- h3.sub "Ce que tu maîtrises déjà" : un .good par correction.points_forts, avec le passage exact qui le prouve et ce qu'un correcteur officiel y valoriserait.

SECTION 5 — PLAN DE PROGRESSION
- Un .prio numéroté par correction.priorites_amelioration (4 à 6 chantiers), format "Problème :" / "Action :". Chaque action doit être applicable dès la prochaine copie ; "lis plus" et "sois plus rigoureux" sont interdits — on écrit le geste exact.

SECTION 6 — EXERCICES CIBLÉS
- 2 tables "Exercice N · titre", chacune ciblant UNE faiblesse réellement observée. Lignes Objectif / Consigne / Réussite. La consigne doit être exécutable en 15 minutes sans document supplémentaire.

SECTION 7 — PROJECTION BAC
- table "Correction apportée" / "Gain estimé" (+0,5 à +2 points, cohérent avec les points réellement perdus au barème) puis <tr class="total"> "Note estimée après corrections" / fourchette au-dessus de la note actuelle, plafonnée à 20. Puis .cap précisant que la projection suppose le même niveau de connaissances.

SECTION 8 — FICHE MÉMO
- Ouvre <div class="sec memo"> et commence OBLIGATOIREMENT par l'en-tête numéroté : <div class="sec-h"><div class="num">8</div><div class="ttl">FICHE MÉMO — RÉFLEXES DE L'ÉPREUVE</div></div>.
- "MES RÉFLEXES DE MÉTHODE" (mh) + mb ul de 3 li tirés des erreurs réelles de la copie, chacun avec un exemple de formulation modèle.
${memo}
- .kicker de fin, motivant et chiffré.

Termine par .foot : "Dossier de correction — {eleve} · Français, voie technologique" | "Les Matinées du Bac".`;

export const dossier_templates = [
  {
    id: 'FR_TECHNO_DOSSIER_CONTRACTION_ELEVE_V1',
    track: 'technologique',
    matiere,
    exercise_type: 'contraction',
    audience: 'eleve',
    output_format: 'html',
    status: 'active',
    version: 1,
    system_prompt:
      enTeteDossier('une contraction de texte', 'CONTRACTION DE TEXTE') +
      `

SECTION 2 — LE TEXTE ET SON RAISONNEMENT
- Une .box cream (lab "La thèse du texte") : la thèse rédigée en une phrase (sujet.these_du_texte), suivie d'une comparaison en une phrase avec celle que l'élève a restituée — ou du constat qu'elle a été déformée.
- Puis une table "Étape du raisonnement" / "Présente dans ta contraction ?" / "Ce qu'il fallait garder", une ligne par entrée de sujet.etapes_attendues. C'est le cœur du dossier : l'élève doit voir exactement quel maillon il a perdu.
- Puis une .box (lab "Le compte de mots") : le nombre de mots demandé, la marge, l'estimation du nombre de mots de la copie, et ce que cela coûte au barème.

SECTION 4 — CONTRACTER, CE N'EST PAS RECOPIER
- Une .box (lab "Avant / après") : prends DEUX passages réels de la copie sur deux colonnes — à gauche ce que l'élève a écrit (recopié ou trop long), à droite la reformulation attendue avec son nombre de mots. Si la copie ne recopie pas, prends les deux passages les plus verbeux et montre comment les resserrer.` +
      sectionsCommunes(`- "MES RÉFLEXES DE CONTRACTION" (mh) + mb ul de 4 li : repérer la thèse avant d'écrire, numéroter les étapes du raisonnement, réduire chaque exemple à un mot, compter les mots et l'indiquer.`) +
      FOURCHETTE + RAPPEL_TECHNO,
  },
  {
    id: 'FR_TECHNO_DOSSIER_ESSAI_ELEVE_V1',
    track: 'technologique',
    matiere,
    exercise_type: 'essai',
    audience: 'eleve',
    output_format: 'html',
    status: 'active',
    version: 1,
    system_prompt:
      enTeteDossier('un essai', 'ESSAI') +
      `

SECTION 2 — DE LA QUESTION À LA RÉPONSE
- Une .box cream (lab "Ce que la question demandait") : les mots clés de la question expliqués un à un, puis la question reformulée en une phrase. Compare en une phrase avec la façon dont l'élève l'a comprise.
- Puis une table "Piste attendue" / "Traitée dans ta copie ?" / "Ce qu'elle apportait", une ligne par entrée de sujet.pistes_attendues.
- Puis une .box (lab "Un exemple bien utilisé") : prends UN exemple réellement cité par l'élève et montre, en trois lignes rédigées, comment on passe du récit de l'exemple à ce qu'il prouve. Si la copie n'en contient aucun, prends un exemple de sujet.exemples_possibles et dis-le.

SECTION 4 — LE PLAN QUI TENAIT LA QUESTION
- Une .box (lab "Un plan possible") : deux ou trois parties annoncées en une phrase chacune, avec la TRANSITION rédigée entre elles. Introduis-le comme UNE construction possible, pas comme la bonne réponse.` +
      sectionsCommunes(`- "MES RÉFLEXES D'ESSAI" (mh) + mb ul de 4 li : souligner les mots clés de la question, annoncer sa position dès l'introduction, une idée par paragraphe avec son exemple analysé, conclure en répondant vraiment.`) +
      FOURCHETTE + RAPPEL_TECHNO,
  },
  {
    id: 'FR_TECHNO_DOSSIER_COMMENTAIRE_ELEVE_V1',
    track: 'technologique',
    matiere,
    exercise_type: 'commentaire',
    audience: 'eleve',
    output_format: 'html',
    status: 'active',
    version: 1,
    system_prompt:
      enTeteDossier('un commentaire guidé par un parcours de lecture', 'COMMENTAIRE') +
      `

SECTION 2 — CE QUE LES AXES DEMANDAIENT
- Une .box cream (lab "Le parcours de lecture") : les deux axes de sujet.axes_fournis rappelés, et pour chacun ce qu'il fallait y mettre (sujet.attendus_axe_1 et sujet.attendus_axe_2), en trois puces chacun.
- Puis une table "Attendu" / "Présent dans ta copie ?" / "Ce que cela rapportait", une ligne par attendu des deux axes.
- Puis une .box (lab "Développer un axe") : montre, entièrement rédigée, UNE sous-partie modèle de six à huit lignes construite sur le premier axe — citation, procédé, effet de sens — pour que l'élève voie ce qu'on attend de lui.

SECTION 4 — CITER, NOMMER, INTERPRÉTER
- Une .box (lab "Le geste qui rapporte des points") : prends TROIS relevés réellement présents dans la copie et complète-les sur trois colonnes — citation exacte / procédé / effet sur le sens. Si la copie ne cite pas, prends trois citations du texte et fais la démonstration.` +
      sectionsCommunes(`- "MES RÉFLEXES DE COMMENTAIRE" (mh) + mb ul de 4 li : traiter les deux axes donnés, deux sous-parties par axe, jamais un procédé sans son effet, une citation entre guillemets à chaque affirmation.`) +
      FOURCHETTE + RAPPEL_TECHNO,
  },
];

export default { matiere, libelle, session, rubrics, subject_cards, benchmark_cards, dossier_templates };
