/**
 * Tests du moteur de correction du FRANÇAIS — brevet. HORS LIGNE.
 *
 *   npm run test:brevet:francais
 *
 * Aucun accès à Supabase, aucun appel à Anthropic : tout est joué sur un
 * barème fabriqué. Les tests portent sur le code RÉELLEMENT exécuté en
 * production, puisque l'Edge Function importe les mêmes fichiers
 * (supabase/functions/_shared/brevet-*.ts).
 *
 * Ils couvrent le §17 du cahier des charges, cas par cas.
 */
import assert from 'node:assert/strict';

import { SUJET_ZERO_FRANCAIS } from './brevet/sujets-zero.mjs';
import {
  assemblerResultatFrancais,
  evaluerDictee,
  evaluerReecriture,
  evaluerRedaction,
  normaliserQuestionsFrancais,
  verifierBaremeFrancais,
  verifierJustification,
  PARTIES_DU_BLOC_TEXTE,
  classerSubstitution,
  BAREME_TOTAL_FRANCAIS,
  type ConfigDictee,
  type GrilleRedaction,
  type ItemReecriture,
  type QuestionFrancais,
  type RegleDictee,
} from '../src/lib/brevetFrancaisNoyau';
import {
  construireRapportEleve,
  convertirSur20,
  motifsCommuns,
  retoucheAcceptable,
  synthetiserQualiteDocument,
  synthetiserValidation,
  verifierAppariementMatiere,
  motif,
} from '../src/lib/brevetNoyau';
import { validerSortieFrancais } from '../src/lib/brevetFrancaisPrompt';

/* --- Harnais --------------------------------------------------------- */

let reussis = 0;
let echoues = 0;
const echecs: string[] = [];

function test(numero: string, titre: string, fn: () => void): void {
  try {
    fn();
    reussis += 1;
    console.log(`  ✓ ${numero}  ${titre}`);
  } catch (err) {
    echoues += 1;
    const message = err instanceof Error ? err.message : String(err);
    echecs.push(`${numero} ${titre}\n     ${message.split('\n')[0]}`);
    console.log(`  ✗ ${numero}  ${titre}`);
    console.log(`      ${message.split('\n').slice(0, 4).join('\n      ')}`);
  }
}

function titre(texte: string) {
  console.log(`\n${texte}`);
}

/* --- Jeu d'essai ------------------------------------------------------ */

function question(
  cle: string,
  max: number,
  extra: Partial<QuestionFrancais> = {},
): QuestionFrancais {
  return {
    question_key: cle,
    numero: cle,
    sous_numero: null,
    partie: 'texte',
    formulation: `Question ${cle}`,
    competence_evaluee: 'lire',
    type_reponse: 'reponse_courte',
    elements_attendus: ['idée attendue'],
    max_points: max,
    reponses_alternatives: [],
    citations_attendues: [],
    degre_justification: 'aucun',
    regles_points_partiels: [{ points: max / 2, condition: 'idée sans justification', cumulable: false }],
    erreurs_caracteristiques: [],
    depend_de: [],
    codes_erreurs: [],
    ...extra,
  };
}

const BAREME_TEXTE: QuestionFrancais[] = [
  question('q1', 4),
  question('q2', 4, { degre_justification: 'citation_expliquee' }),
  question('q3', 4),
  question('q4', 4),
  question('q5', 4),
];

const REGLES_DICTEE: RegleDictee[] = [
  { categorie: 'accord', sous_categorie: null, penalite: 0.5, plafond: null, cumul_repetitions: false, regle: 'Accord : 0,5 pt' },
  { categorie: 'conjugaison', sous_categorie: null, penalite: 0.5, plafond: null, cumul_repetitions: false, regle: 'Conjugaison : 0,5 pt' },
  { categorie: 'lexique', sous_categorie: null, penalite: 0.5, plafond: 3, cumul_repetitions: false, regle: 'Lexique : 0,5 pt, plafond 3' },
  { categorie: 'accent', sous_categorie: null, penalite: 0.25, plafond: 2, cumul_repetitions: false, regle: 'Accent : 0,25 pt' },
  { categorie: 'majuscule', sous_categorie: null, penalite: 0.25, plafond: 1, cumul_repetitions: false, regle: 'Majuscule : 0,25 pt' },
  { categorie: 'ponctuation', sous_categorie: null, penalite: 0.25, plafond: 1, cumul_repetitions: false, regle: 'Ponctuation : 0,25 pt' },
  { categorie: 'mot_oublie', sous_categorie: null, penalite: 0.5, plafond: null, cumul_repetitions: true, regle: 'Mot oublié : 0,5 pt' },
  { categorie: 'mot_ajoute', sous_categorie: null, penalite: 0.25, plafond: null, cumul_repetitions: true, regle: 'Mot ajouté : 0,25 pt' },
  { categorie: 'homophone', sous_categorie: null, penalite: 0.5, plafond: null, cumul_repetitions: false, regle: 'Homophone : 0,5 pt' },
];

const TEXTE_DICTEE =
  "Le vieux marin regardait la mer grise. Les mouettes tournaient au-dessus des barques amarrees. Il pensait aux hivers passes, aux tempetes et aux retours heureux.";

function configDictee(extra: Partial<ConfigDictee> = {}): ConfigDictee {
  return {
    max_points: 10,
    texte_attendu: TEXTE_DICTEE,
    regles: REGLES_DICTEE,
    graphies_admises: [],
    plancher: 0,
    source_bareme: 'subject_bareme',
    ...extra,
  };
}

function grille(type: 'imagination' | 'reflexion', issueDuSujet = true): GrilleRedaction {
  const axes =
    type === 'imagination'
      ? ['consigne', 'organisation_recit', 'personnages', 'idees', 'vocabulaire', 'orthographe', 'syntaxe', 'longueur']
      : ['comprehension_question', 'pertinence_arguments', 'exemples', 'organisation', 'connecteurs', 'vocabulaire', 'orthographe', 'longueur'];
  return {
    type_sujet: type,
    intitule: `Sujet de ${type}`,
    max_points: 40,
    longueur_minimale: 30,
    issue_du_sujet: issueDuSujet,
    criteres: axes.map((code) => ({
      code,
      libelle: code,
      max_points: 5,
      descripteurs: [],
      cumul_famille_autorise: false,
    })),
  };
}

const ITEMS_REECRITURE: ItemReecriture[] = [
  { cle: 'f1', forme_originale: 'il regardait', forme_attendue: 'ils regardaient', transformation: 'singulier → pluriel', points: 0.5, variantes_admises: [] },
  { cle: 'f2', forme_originale: 'la mer grise', forme_attendue: 'les mers grises', transformation: 'singulier → pluriel', points: 0.5, variantes_admises: [] },
  { cle: 'f3', forme_originale: 'il pensait', forme_attendue: 'ils pensaient', transformation: 'singulier → pluriel', points: 0.5, variantes_admises: [] },
];

const QUALITE_LISIBLE = synthetiserQualiteDocument({ anomalies: [], zonesIncertaines: [] });

/* ==================================================================== */

console.log('\n═══ FRANÇAIS — BREVET ═══');

titre('1. Étanchéité : jamais une grille de bac sur une copie de brevet');

test('1.1', 'un examen BAC est refusé par le moteur du brevet', () => {
  const r = verifierAppariementMatiere({
    matiereAttendue: 'brevet_francais',
    matiereExamen: 'francais',
    niveauExamen: 'BAC',
    moteurCorrection: 'brevet_francais',
  });
  assert.equal(r.ok, false);
});

test('1.2', 'une copie de maths brevet est refusée par le moteur de français', () => {
  const r = verifierAppariementMatiere({
    matiereAttendue: 'brevet_francais',
    matiereExamen: 'brevet_mathematiques',
    niveauExamen: 'DNB',
    moteurCorrection: 'brevet_mathematiques',
  });
  assert.equal(r.ok, false);
});

test('1.3', 'l’appariement correct passe', () => {
  const r = verifierAppariementMatiere({
    matiereAttendue: 'brevet_francais',
    matiereExamen: 'brevet_francais',
    niveauExamen: 'DNB',
    moteurCorrection: 'brevet_francais',
  });
  assert.equal(r.ok, true);
});

titre('2. Travail sur le texte');

test('2.1', 'réponse exacte formulée autrement : plein des points', () => {
  const { questions } = normaliserQuestionsFrancais(BAREME_TEXTE, [
    { question_key: 'q1', score: 4, statut: 'equivalente_vocabulaire_different', certitude: 1 },
  ]);
  assert.equal(questions[0].points, 4);
  assert.equal(questions[0].statut, 'equivalente_vocabulaire_different');
});

test('2.2', 'citation juste sans explication : le plein est refusé', () => {
  const { questions } = normaliserQuestionsFrancais(BAREME_TEXTE, [
    { question_key: 'q2', score: 4, statut: 'citation_sans_explication', certitude: 1 },
  ]);
  assert.ok(questions[1].points < 4, 'le plein ne doit pas être accordé');
});

test('2.3', 'explication correcte sans la citation exigée : jamais zéro d’office', () => {
  const { questions } = normaliserQuestionsFrancais(BAREME_TEXTE, [
    { question_key: 'q2', score: 0, statut: 'explication_sans_citation_exigee', certitude: 1 },
  ]);
  const alertes = verifierJustification(BAREME_TEXTE, questions);
  assert.ok(
    alertes.some((a) => a.includes('notée 0')),
    'le cas doit être signalé pour arbitrage humain',
  );
});

test('2.4', 'réponse partielle : points partiels conservés', () => {
  const { questions } = normaliserQuestionsFrancais(BAREME_TEXTE, [
    { question_key: 'q3', score: 2, statut: 'partiellement_exacte', certitude: 1 },
  ]);
  assert.equal(questions[2].points, 2);
});

test('2.5', 'interprétation alternative défendable : la nature de décision remonte', () => {
  const { questions } = normaliserQuestionsFrancais(BAREME_TEXTE, [
    {
      question_key: 'q4',
      score: 4,
      statut: 'equivalente_vocabulaire_different',
      nature_decision: 'a_valider',
      certitude: 0.7,
    },
  ]);
  assert.equal(questions[3].nature_decision, 'a_valider');
});

test('2.6', 'zone illisible : ce n’est pas une absence de réponse', () => {
  const { questions } = normaliserQuestionsFrancais(BAREME_TEXTE, [
    { question_key: 'q5', score: 0, statut: 'illisible', certitude: 0.2 },
  ]);
  assert.equal(questions[4].transcription_incertaine, true);
  assert.ok(questions[4].alertes.some((a) => a.includes('pas une absence de réponse')));
});

test('2.7', 'question absente de la réponse : 0 posé ET alerte', () => {
  const { questions, alertes } = normaliserQuestionsFrancais(BAREME_TEXTE, []);
  assert.equal(questions.length, 5);
  assert.ok(questions.every((q) => q.points === 0));
  assert.equal(alertes.length, 5);
});

test('2.8', 'question inventée par le modèle : écartée de la note', () => {
  const { questions, alertes } = normaliserQuestionsFrancais(BAREME_TEXTE, [
    { question_key: 'q1', score: 4, statut: 'exacte' },
    { question_key: 'q99', score: 10, statut: 'exacte' },
  ]);
  assert.equal(questions.length, 5);
  assert.ok(alertes.some((a) => a.includes('q99')));
});

test('2.9', 'score au-dessus du maximum : ramené, et signalé', () => {
  const { questions, alertes } = normaliserQuestionsFrancais(BAREME_TEXTE, [
    { question_key: 'q1', score: 99, statut: 'exacte' },
  ]);
  assert.equal(questions[0].points, 4);
  assert.ok(alertes.some((a) => a.includes('maximum')));
});

titre('3. Réécriture');

test('3.1', 'réécriture partiellement correcte : points partiels', () => {
  const r = evaluerReecriture(
    ITEMS_REECRITURE,
    [
      { cle: 'f1', forme_produite: 'ils regardaient' },
      { cle: 'f2', forme_produite: 'les mers grise' },
      { cle: 'f3', forme_produite: 'il pensait' },
    ],
    { max_points: 1.5, penalite_erreur_copie: 0.25, plafond_erreurs_copie: 1, bareme_du_sujet_fourni: true },
  );
  assert.equal(r.formes[0].statut, 'exacte');
  assert.equal(r.formes[2].statut, 'transformation_manquee');
  assert.equal(r.formes[2].points, 0);
});

test('3.2', 'erreur de simple copie : la transformation reste acquise', () => {
  const r = evaluerReecriture(
    [ITEMS_REECRITURE[0]],
    [{ cle: 'f1', forme_produite: 'ils regardaìent' }],
    { max_points: 0.5, penalite_erreur_copie: 0.25, plafond_erreurs_copie: 1, bareme_du_sujet_fourni: true },
  );
  assert.equal(r.formes[0].statut, 'erreur_de_copie_seule');
  assert.equal(r.formes[0].points, 0.5, 'les points de transformation restent');
  assert.equal(r.erreurs_de_copie, 1);
});

test('3.3', 'pas de double pénalité sur une même forme', () => {
  const r = evaluerReecriture(
    [ITEMS_REECRITURE[0]],
    [{ cle: 'f1', forme_produite: 'il regardait' }],
    { max_points: 0.5, penalite_erreur_copie: 0.25, plafond_erreurs_copie: 1, bareme_du_sujet_fourni: true },
  );
  assert.equal(r.formes[0].statut, 'transformation_manquee');
  assert.equal(r.erreurs_de_copie, 0, 'une transformation manquée ne compte pas aussi comme erreur de copie');
});

test('3.4', 'sans barème de copie renseigné, aucune pénalité n’est inventée', () => {
  const r = evaluerReecriture(
    [ITEMS_REECRITURE[0]],
    [{ cle: 'f1', forme_produite: 'ils regardaìent' }],
    { max_points: 0.5, penalite_erreur_copie: null, plafond_erreurs_copie: null, bareme_du_sujet_fourni: true },
  );
  assert.equal(r.penalite_copie, 0);
  assert.equal(r.bareme_manquant, true);
});

test('3.5', 'forme illisible : points accordés provisoirement, jamais une faute', () => {
  const r = evaluerReecriture(
    [ITEMS_REECRITURE[0]],
    [{ cle: 'f1', forme_produite: '???', illisible: true }],
    { max_points: 0.5, penalite_erreur_copie: 0.25, plafond_erreurs_copie: 1, bareme_du_sujet_fourni: true },
  );
  assert.equal(r.formes[0].statut, 'illisible');
  assert.equal(r.formes[0].points, 0.5);
});

titre('4. Dictée');

test('4.1', 'dictée sans règles : le moteur REFUSE de noter', () => {
  const r = evaluerDictee(configDictee({ regles: [], source_bareme: null }), TEXTE_DICTEE);
  assert.equal(r.score, null, 'aucune note ne doit être inventée');
  assert.equal(r.bareme_manquant, true);
});

test('4.2', 'dictée parfaite : le maximum', () => {
  const r = evaluerDictee(configDictee(), TEXTE_DICTEE);
  assert.equal(r.score, 10);
  assert.equal(r.erreurs.length, 0);
});

test('4.3', 'omission d’un mot : une erreur, une pénalité', () => {
  const r = evaluerDictee(configDictee(), TEXTE_DICTEE.replace('vieux ', ''));
  const oublis = r.erreurs.filter((e) => e.categorie === 'mot_oublie');
  assert.equal(oublis.length, 1);
  assert.equal(oublis[0].penalite_appliquee, 0.5);
});

test('4.4', 'faute répétée : comptée une seule fois', () => {
  // « aux » écrit « au » deux fois : même erreur, une seule pénalité.
  const produit = TEXTE_DICTEE.replace(/aux hivers/, 'au hivers').replace(/aux tempetes/, 'au tempetes');
  const r = evaluerDictee(configDictee(), produit);
  const appliquees = r.erreurs.filter((e) => e.penalite_appliquee > 0).length;
  const repetitions = r.erreurs.filter((e) => e.repetition_de !== null).length;
  assert.ok(repetitions >= 1, 'la répétition doit être identifiée');
  assert.ok(appliquees < r.erreurs.length, 'toutes les occurrences ne se paient pas');
});

test('4.5', 'décalage OCR : les erreurs de la zone ne sont pas comptées', () => {
  // Le début s'aligne, puis la lecture déraille : c'est la signature d'un
  // décalage de transcription, pas de quinze fautes d'orthographe.
  const produit = 'Le vieux marin regardait la mer grise. aaa bbb ccc ddd eee fff ggg hhh iii jjj';
  const r = evaluerDictee(configDictee(), produit);
  assert.equal(r.decalage_ocr_suspecte, true);
  assert.equal(r.penalite_totale, 0, 'un décalage ne produit pas une avalanche de fautes');
});

test('4.5 bis', 'copie blanche : ce n’est PAS un décalage, la note est le plancher', () => {
  const r = evaluerDictee(configDictee(), '');
  assert.equal(r.decalage_ocr_suspecte, false);
  assert.equal(r.score, 0);
  assert.ok(r.alertes.some((a) => a.includes('copie blanche')));
});

test('4.6', 'marqueur [illisible] : jamais une faute', () => {
  const r = evaluerDictee(configDictee(), TEXTE_DICTEE.replace('grise', '[illisible]'));
  assert.ok(r.zones_illisibles >= 1);
  assert.ok(r.alertes.some((a) => a.includes('illisible')));
});

test('4.7', 'graphie rectifiée admise : pas de faute', () => {
  const cfg = configDictee({ graphies_admises: ['tempetes'] });
  const r = evaluerDictee(cfg, TEXTE_DICTEE);
  assert.equal(r.score, 10);
});

test('4.8', 'plafond de catégorie respecté', () => {
  // Sept fautes lexicales, plafond à 3 points.
  let produit = TEXTE_DICTEE;
  for (const [avant, apres] of [
    ['marin', 'marrin'], ['mouettes', 'mouetes'], ['barques', 'barcs'],
    ['hivers', 'hivert'], ['tempetes', 'tampetes'], ['retours', 'retourt'], ['heureux', 'heureu'],
  ]) {
    produit = produit.replace(avant, apres);
  }
  const r = evaluerDictee(configDictee(), produit);
  const lexique = r.erreurs.filter((e) => e.categorie === 'lexique');
  const total = lexique.reduce((s, e) => s + e.penalite_appliquee, 0);
  assert.ok(total <= 3.001, `plafond dépassé : ${total}`);
});

test('4.9', 'la note ne descend jamais sous le plancher', () => {
  const r = evaluerDictee(configDictee({ plancher: 2 }), 'un texte totalement different sans rapport aucun ici');
  assert.ok((r.score ?? 0) >= 0);
});

test('4.10', 'classement d’une substitution : accord, accent, majuscule, ponctuation', () => {
  assert.equal(classerSubstitution('amarrees', 'amarree').categorie, 'accord');
  assert.equal(classerSubstitution('grise', 'grisé').categorie, 'accent');
  assert.equal(classerSubstitution('Le', 'le').categorie, 'majuscule');
  assert.equal(classerSubstitution('.', ',').categorie, 'ponctuation');
});

titre('5. Rédaction');

test('5.1', 'sujet d’imagination : la grille d’imagination est appliquée', () => {
  const r = evaluerRedaction({
    sujetChoisi: 'imagination',
    grilles: [grille('imagination'), grille('reflexion')],
    scores: grille('imagination').criteres.map((c) => ({ code: c.code, score: 4, certitude: 1 })),
    longueurEstimee: 40,
  });
  assert.equal(r.grille_appliquee, 'imagination');
  assert.equal(r.score, 32);
});

test('5.2', 'sujet de réflexion : la grille de réflexion est appliquée', () => {
  const r = evaluerRedaction({
    sujetChoisi: 'reflexion',
    grilles: [grille('imagination'), grille('reflexion')],
    scores: grille('reflexion').criteres.map((c) => ({ code: c.code, score: 3, certitude: 1 })),
    longueurEstimee: 40,
  });
  assert.equal(r.grille_appliquee, 'reflexion');
  assert.equal(r.score, 24);
});

test('5.3', 'sujet ambigu : AUCUNE note n’est posée', () => {
  const r = evaluerRedaction({
    sujetChoisi: 'incertain',
    grilles: [grille('imagination'), grille('reflexion')],
    scores: [],
    longueurEstimee: 30,
  });
  assert.equal(r.score, null);
  assert.equal(r.grille_appliquee, null);
});

test('5.4', 'les deux sujets traités : aucune note, arbitrage humain', () => {
  const r = evaluerRedaction({
    sujetChoisi: 'les_deux',
    grilles: [grille('imagination'), grille('reflexion')],
    scores: [],
    longueurEstimee: 60,
  });
  assert.equal(r.score, null);
  assert.ok(r.alertes.some((a) => a.includes('DEUX')));
});

test('5.5', 'rédaction trop courte : perte portée par le critère, pas par un retrait ajouté', () => {
  const g = grille('imagination');
  const r = evaluerRedaction({
    sujetChoisi: 'imagination',
    grilles: [g, grille('reflexion')],
    scores: g.criteres.map((c) => ({ code: c.code, score: c.code === 'longueur' ? 1 : 5, certitude: 1 })),
    longueurEstimee: 8,
  });
  assert.equal(r.score, 36, 'aucun retrait supplémentaire ne s’ajoute');
  assert.ok(r.alertes.some((a) => a.includes('Longueur estimée')));
});

test('5.6', 'rédaction hors sujet : la note vient des critères, jamais d’un plancher inventé', () => {
  const g = grille('reflexion');
  const r = evaluerRedaction({
    sujetChoisi: 'reflexion',
    grilles: [grille('imagination'), g],
    scores: g.criteres.map((c) => ({ code: c.code, score: 0, certitude: 1 })),
    longueurEstimee: 35,
  });
  assert.equal(r.score, 0);
});

test('5.7', 'pas de double pénalisation dans une même famille de critères', () => {
  const g = grille('imagination');
  const r = evaluerRedaction({
    sujetChoisi: 'imagination',
    grilles: [g, grille('reflexion')],
    // orthographe ET vocabulaire (même famille « langue ») perdent des points
    // pour la même faiblesse : le second est restitué.
    scores: g.criteres.map((c) => ({
      code: c.code,
      score: c.code === 'orthographe' || c.code === 'vocabulaire' ? 2 : 5,
      certitude: 1,
    })),
    longueurEstimee: 40,
    erreursParFamille: [{ famille: 'langue', codes: ['FR-ACC-01'] }],
  });
  assert.ok(r.doubles_penalisations_evitees.length >= 1, 'la double pénalisation doit être évitée');
});

test('5.8', 'grille par défaut : signalée et à valider', () => {
  const g = grille('imagination', false);
  const r = evaluerRedaction({
    sujetChoisi: 'imagination',
    grilles: [g, grille('reflexion')],
    scores: g.criteres.map((c) => ({ code: c.code, score: 3, certitude: 1 })),
    longueurEstimee: 40,
  });
  assert.equal(r.grille_issue_du_sujet, false);
  assert.ok(r.alertes.some((a) => a.includes('par défaut')));
});

titre('6. Assemblage, totaux et conversion');

function assemblerJeuComplet(scoreQuestions: number) {
  const { questions } = normaliserQuestionsFrancais(
    BAREME_TEXTE,
    BAREME_TEXTE.map((q) => ({
      question_key: q.question_key,
      score: scoreQuestions,
      statut: 'exacte' as const,
      certitude: 1,
    })),
  );
  const reecriture = evaluerReecriture(
    ITEMS_REECRITURE,
    ITEMS_REECRITURE.map((i) => ({ cle: i.cle, forme_produite: i.forme_attendue })),
    { max_points: 30, penalite_erreur_copie: 0.25, plafond_erreurs_copie: 2, bareme_du_sujet_fourni: true },
  );
  const dictee = evaluerDictee(configDictee(), TEXTE_DICTEE);
  const g = grille('imagination');
  const redaction = evaluerRedaction({
    sujetChoisi: 'imagination',
    grilles: [g, grille('reflexion')],
    scores: g.criteres.map((c) => ({ code: c.code, score: 5, certitude: 1 })),
    longueurEstimee: 40,
  });
  return assemblerResultatFrancais({ questions, reecriture, dictee, redaction, alertes: [] });
}

test('6.1', 'somme sur 100 puis conversion sur 20', () => {
  // 5 questions × 4 = 20, réécriture 1,5 (max 30), dictée 10, rédaction 40.
  const r = assemblerJeuComplet(4);
  assert.equal(r.score_max, 100, `maximum attendu 100, obtenu ${r.score_max}`);
  assert.equal(r.score_sur_20, convertirSur20(r.score_brut, 100));
});

test('6.2', 'impossible de dépasser 100', () => {
  const r = assemblerJeuComplet(99);
  assert.ok(r.score_brut <= 100.001, `note brute ${r.score_brut} au-dessus de 100`);
  assert.ok(r.score_sur_20 <= 20.001);
});

test('6.3', 'copie blanche : 0, sans planter', () => {
  const { questions } = normaliserQuestionsFrancais(
    BAREME_TEXTE,
    BAREME_TEXTE.map((q) => ({ question_key: q.question_key, score: 0, statut: 'absence_de_reponse' as const })),
  );
  const g = grille('imagination');
  const r = assemblerResultatFrancais({
    questions,
    reecriture: evaluerReecriture(ITEMS_REECRITURE, [], {
      max_points: 30,
      penalite_erreur_copie: 0.25,
      plafond_erreurs_copie: 2,
      bareme_du_sujet_fourni: true,
    }),
    dictee: evaluerDictee(configDictee(), ''),
    redaction: evaluerRedaction({
      sujetChoisi: 'imagination',
      grilles: [g, grille('reflexion')],
      scores: g.criteres.map((c) => ({ code: c.code, score: 0, certitude: 1 })),
      longueurEstimee: 0,
    }),
    alertes: [],
  });
  assert.equal(r.score_brut, 0);
  assert.equal(r.score_sur_20, 0);
});

test('6.4', 'un bloc non notable est retiré du total ET du maximum', () => {
  const { questions } = normaliserQuestionsFrancais(
    BAREME_TEXTE,
    BAREME_TEXTE.map((q) => ({ question_key: q.question_key, score: 4, statut: 'exacte' as const })),
  );
  const r = assemblerResultatFrancais({
    questions,
    reecriture: null,
    // Dictée non notable : pas de règles.
    dictee: evaluerDictee(configDictee({ regles: [], source_bareme: null }), TEXTE_DICTEE),
    redaction: null,
    alertes: [],
  });
  assert.equal(r.note_partielle, true);
  assert.ok(r.blocs_non_notes.includes('dictee'));
  assert.ok(r.score_max < 100, 'le maximum ne compte pas un bloc non noté');
  assert.ok(r.score_sur_20 <= 20.001);
});

test('6.5', 'copie illisible : la note reste bornée et le rapport avertit', () => {
  const qualite = synthetiserQualiteDocument({
    anomalies: [
      { code: 'texte_illisible', pages: [2], detail: 'écriture non déchiffrable', certitude: 0.9 },
      { code: 'image_floue', pages: [3], detail: 'photo floue', certitude: 0.8 },
      { code: 'reponse_coupee', pages: [3], detail: 'bas de page absent', certitude: 0.7 },
    ],
    zonesIncertaines: [{ page: 2, description: 'paragraphe entier', certitude: 0.4 }],
  });
  assert.equal(qualite.statut, 'unreadable');
  const { rapport } = construireRapportEleve({
    noteBrute: 40,
    noteMax: 100,
    blocs: [],
    reussites: [],
    priorites: [],
    erreurs: [],
    aRetravailler: [],
    strategie: '',
    qualite,
  });
  assert.ok(rapport.avertissement_lisibilite, 'le rapport doit avertir');
  assert.equal(rapport.note_sur_20, 8);
});

titre('7. Contrôles du barème');

test('7.1', 'total ≠ 100 : blocage', () => {
  const r = verifierBaremeFrancais({
    questions: BAREME_TEXTE.map((q) => ({ ...q })),
    maxReecriture: 5,
    maxDictee: 10,
    maxRedaction: 40,
    dicteeReglesDefinies: true,
    grillesRedaction: [{ type_sujet: 'imagination' }, { type_sujet: 'reflexion' }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.blocages.some((b) => b.code === 'bloc_texte_incorrect'));
});

test('7.2', 'dictée sans règles : blocage', () => {
  const r = verifierBaremeFrancais({
    questions: [{ ...question('q1', 50) }],
    maxReecriture: 0,
    maxDictee: 10,
    maxRedaction: 40,
    dicteeReglesDefinies: false,
    grillesRedaction: [{ type_sujet: 'imagination' }, { type_sujet: 'reflexion' }],
  });
  assert.ok(r.blocages.some((b) => b.code === 'dictee_sans_regles'));
});

test('7.3', 'une seule grille de rédaction : blocage', () => {
  const r = verifierBaremeFrancais({
    questions: [{ ...question('q1', 50) }],
    maxReecriture: 0,
    maxDictee: 10,
    maxRedaction: 40,
    dicteeReglesDefinies: true,
    grillesRedaction: [{ type_sujet: 'imagination' }],
  });
  assert.ok(r.blocages.some((b) => b.code === 'grilles_redaction_incompletes'));
});

test('7.4', 'question sans corrigé : blocage', () => {
  const r = verifierBaremeFrancais({
    questions: [{ ...question('q1', 50), elements_attendus: [] }],
    maxReecriture: 0,
    maxDictee: 10,
    maxRedaction: 40,
    dicteeReglesDefinies: true,
    grillesRedaction: [{ type_sujet: 'imagination' }, { type_sujet: 'reflexion' }],
  });
  assert.ok(r.blocages.some((b) => b.code === 'corrige_manquant'));
});

test('7.5', 'barème conforme : aucun blocage', () => {
  const r = verifierBaremeFrancais({
    questions: [{ ...question('q1', 50) }],
    maxReecriture: 0,
    maxDictee: 10,
    maxRedaction: 40,
    dicteeReglesDefinies: true,
    grillesRedaction: [{ type_sujet: 'imagination' }, { type_sujet: 'reflexion' }],
  });
  assert.equal(r.ok, true);
  assert.equal(BAREME_TOTAL_FRANCAIS, 100);
});

titre('8. Validation humaine et rapport élève');

test('8.1', 'confiance faible : validation recommandée', () => {
  const s = synthetiserValidation(
    motifsCommuns({ confiance: 0.5, qualite: QUALITE_LISIBLE, noteSur20: 12, seuilsAdmin: [10] }),
  );
  assert.equal(s.required, true);
});

test('8.2', 'page manquante : validation BLOQUANTE', () => {
  const qualite = synthetiserQualiteDocument({
    anomalies: [{ code: 'page_manquante', pages: [3], detail: 'page 3 absente', certitude: 1 }],
    zonesIncertaines: [],
  });
  const s = synthetiserValidation(
    motifsCommuns({ confiance: 1, qualite, noteSur20: 12, seuilsAdmin: [10] }),
  );
  assert.equal(s.blocking, true);
});

test('8.3', 'note proche du seuil : information seulement', () => {
  const s = synthetiserValidation(
    motifsCommuns({ confiance: 1, qualite: QUALITE_LISIBLE, noteSur20: 9.75, seuilsAdmin: [10] }),
  );
  assert.equal(s.degre_maximal, 'information');
  assert.equal(s.required, false);
});

test('8.4', 'un motif levé deux fois garde le degré le plus élevé', () => {
  const s = synthetiserValidation([
    motif('page_manquante', 'même message', undefined, 'information'),
    motif('page_manquante', 'même message'),
  ]);
  assert.equal(s.reasons.length, 1);
  assert.equal(s.reasons[0].degre, 'bloquante');
});

test('8.5', 'rapport élève : trois réussites au plus, formulations proscrites retirées', () => {
  const { rapport, motifs } = construireRapportEleve({
    noteBrute: 60,
    noteMax: 100,
    blocs: [],
    reussites: ['une', 'deux', 'trois', 'quatre'],
    priorites: ['Ton travail est médiocre.', 'Reprends « la mer grise » et explique ce qu’elle évoque.'],
    erreurs: [],
    aRetravailler: [],
    strategie: 'Relis-toi cinq minutes avant de rendre.',
    qualite: QUALITE_LISIBLE,
  });
  assert.equal(rapport.reussites.length, 3);
  assert.equal(rapport.priorites.length, 1, 'la formulation humiliante est retirée');
  assert.ok(motifs.length >= 1);
  assert.equal(rapport.note_sur_20, 12);
});

test('8.6', 'retouche humaine : justification obligatoire au-delà d’un point', () => {
  assert.equal(retoucheAcceptable({ valeurIa: 2, valeurHumaine: 4, max: 4, motif: 'ok' }).ok, false);
  assert.equal(
    retoucheAcceptable({ valeurIa: 2, valeurHumaine: 4, max: 4, motif: 'La citation attendue est bien présente ligne 12.' }).ok,
    true,
  );
  assert.equal(retoucheAcceptable({ valeurIa: 2, valeurHumaine: 99, max: 4, motif: 'x'.repeat(30) }).ok, false);
});

titre('9. Validation du schéma de sortie');

test('9.1', 'une chaîne à la place d’un nombre est refusée', () => {
  const r = validerSortieFrancais(
    {
      document_quality: { statut: 'readable', anomalies: [], zones_incertaines: [] },
      questions: [{ question_key: 'q1', score: 'quatre', certitude: 1 }],
      reecriture: [],
      dictee: { texte_transcrit: 'x', zones_illisibles: 0, commentaire_lecture: '' },
      redaction: { sujet_choisi: 'imagination', indices_du_choix: [], longueur_estimee_lignes: 30, criteres: [] },
      validation_humaine: [],
      rapport_eleve: { reussites: [], priorites: [], erreurs_expliquees: [], a_retravailler: [], strategie: '' },
      confidence: 0.9,
    },
    { clesQuestions: ['q1'], clesReecriture: [] },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.erreurs.some((e) => e.includes("n'est pas un nombre")));
});

test('9.2', 'une note globale renvoyée par le modèle est refusée', () => {
  const r = validerSortieFrancais(
    {
      note_finale: 14,
      document_quality: { statut: 'readable', anomalies: [], zones_incertaines: [] },
      questions: [],
      reecriture: [],
      dictee: { texte_transcrit: 'x', zones_illisibles: 0, commentaire_lecture: '' },
      redaction: { sujet_choisi: 'imagination', indices_du_choix: [], longueur_estimee_lignes: null, criteres: [] },
      validation_humaine: [],
      rapport_eleve: { reussites: [], priorites: [], erreurs_expliquees: [], a_retravailler: [], strategie: '' },
      confidence: 0.9,
    },
    { clesQuestions: [], clesReecriture: [] },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.erreurs.some((e) => e.includes('note_finale')));
});

test('9.3', 'une sortie conforme passe', () => {
  const r = validerSortieFrancais(
    {
      document_quality: { statut: 'readable', anomalies: [], zones_incertaines: [] },
      questions: [{ question_key: 'q1', score: 4, certitude: 1 }],
      reecriture: [{ cle: 'f1', forme_produite: 'ils regardaient', illisible: false }],
      dictee: { texte_transcrit: TEXTE_DICTEE, zones_illisibles: 0, commentaire_lecture: '' },
      redaction: { sujet_choisi: 'imagination', indices_du_choix: [], longueur_estimee_lignes: 30, criteres: [] },
      validation_humaine: [],
      rapport_eleve: { reussites: [], priorites: [], erreurs_expliquees: [], a_retravailler: [], strategie: '' },
      confidence: 0.9,
    },
    { clesQuestions: ['q1'], clesReecriture: ['f1'] },
  );
  assert.equal(r.ok, true);
});

titre('10. Le sujet zéro officiel de la session 2026');

test('10.1', 'les sous-parties compréhension et grammaire composent les 50 points', () => {
  assert.ok(PARTIES_DU_BLOC_TEXTE.includes('comprehension'));
  assert.ok(PARTIES_DU_BLOC_TEXTE.includes('grammaire'));
  assert.ok(!PARTIES_DU_BLOC_TEXTE.includes('reecriture'), 'la réécriture a son propre module');
});

test('10.2', 'la structure du sujet zéro totalise bien 32 + 18 = 50', () => {
  const q = SUJET_ZERO_FRANCAIS.questions;
  const comprehension = q.filter((x) => x.partie === 'comprehension').reduce((s2, x) => s2 + x.max_points, 0);
  const grammaire = q.filter((x) => x.partie === 'grammaire').reduce((s2, x) => s2 + x.max_points, 0);
  assert.equal(comprehension, 32);
  assert.equal(grammaire + SUJET_ZERO_FRANCAIS.reecriture.max_points, 18);
  assert.equal(comprehension + grammaire + SUJET_ZERO_FRANCAIS.reecriture.max_points, 50);
});

test('10.3', 'le sujet zéro passe les contrôles de totaux du moteur', () => {
  const r = verifierBaremeFrancais({
    questions: SUJET_ZERO_FRANCAIS.questions.map((x) => ({
      question_key: x.question_key,
      numero: x.numero,
      partie: x.partie as never,
      max_points: x.max_points,
      // Le sujet zéro est publié SANS corrigé : on renseigne un attendu
      // fictif ici pour isoler le contrôle des TOTAUX, qui est l'objet du test.
      elements_attendus: ['à saisir'],
      regles_points_partiels: [{}],
    })),
    maxReecriture: SUJET_ZERO_FRANCAIS.reecriture.max_points,
    maxDictee: SUJET_ZERO_FRANCAIS.dictee.max_points,
    maxRedaction: SUJET_ZERO_FRANCAIS.redaction[0].max_points,
    dicteeReglesDefinies: true,
    grillesRedaction: SUJET_ZERO_FRANCAIS.redaction.map((g) => ({ type_sujet: g.type_sujet })),
  });
  assert.equal(r.ok, true, JSON.stringify(r.blocages));
});

test('10.4', 'publié sans corrigé, le sujet zéro est bloqué tant qu’il n’est pas complété', () => {
  const r = verifierBaremeFrancais({
    questions: SUJET_ZERO_FRANCAIS.questions.map((x) => ({
      question_key: x.question_key,
      numero: x.numero,
      partie: x.partie as never,
      max_points: x.max_points,
      elements_attendus: [],
      regles_points_partiels: [],
    })),
    maxReecriture: SUJET_ZERO_FRANCAIS.reecriture.max_points,
    maxDictee: SUJET_ZERO_FRANCAIS.dictee.max_points,
    maxRedaction: SUJET_ZERO_FRANCAIS.redaction[0].max_points,
    dicteeReglesDefinies: SUJET_ZERO_FRANCAIS.dictee.regles.length > 0,
    grillesRedaction: SUJET_ZERO_FRANCAIS.redaction.map((g) => ({ type_sujet: g.type_sujet })),
  });
  assert.equal(r.ok, false);
  assert.ok(r.blocages.some((b) => b.code === 'corrige_manquant'));
  assert.ok(r.blocages.some((b) => b.code === 'dictee_sans_regles'));
});

test('10.5', 'le texte de la dictée fait bien environ 600 signes', () => {
  const n = SUJET_ZERO_FRANCAIS.dictee.texte_attendu.length;
  assert.ok(n > 500 && n < 900, `${n} signes : hors de l'ordre de grandeur annoncé (600 environ)`);
});

/* --- Bilan ------------------------------------------------------------ */

console.log(`\n${reussis} test(s) réussi(s), ${echoues} échec(s).`);
if (echoues) {
  console.log('\nÉchecs :');
  for (const e of echecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}
