/**
 * Tests du moteur de correction par barème propre au sujet — HORS LIGNE.
 *
 *   npm run test:bareme
 *
 * Aucun accès à Supabase, aucun appel à Anthropic : tout est joué sur un
 * barème fabriqué. Ces tests portent sur le code RÉELLEMENT exécuté en
 * production, puisque l'Edge Function importe le même fichier
 * (supabase/functions/_shared/bareme-noyau.ts).
 *
 * Les tests qui exigent la base (verrouillage, versions, RLS, contraintes)
 * sont dans scripts/test-bareme-supabase.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { moteurAttendu } from '../src/lib/moteurs';
import {
  REGLES_TRANSVERSALES,
  arrondi,
  calculerNoteBrute,
  comparerEtalon,
  construireResultat,
  couvertureEtalons,
  evenementsTaxonomie,
  motifsRelectureHumaine,
  normaliserQuestions,
  peutOuvrirCorrections,
  profilCompetences,
  statistiquesCalibration,
  verifierBareme,
  verifierNonDoubleSanction,
  type CompetenceReferentiel,
  type QuestionBareme,
  type ReponseQuestionIA,
} from '../src/lib/baremeNoyau';

// --- Petit harnais ----------------------------------------------------

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

// --- Jeu d'essai ------------------------------------------------------
//
// Un exercice de mathématiques en quatre questions, sur 20 points.
// q2 reprend le résultat de q1 : c'est le cas de la poursuite après erreur.
// q4 est la seule question d'algorithmique — retirée dans certains tests
// pour vérifier le cas « compétence non applicable ».

const REFERENTIEL: CompetenceReferentiel[] = [
  { code: 'chercher', libelle: 'Chercher', toujours_mobilisee: true },
  { code: 'modeliser', libelle: 'Modéliser', toujours_mobilisee: true },
  { code: 'representer', libelle: 'Représenter', toujours_mobilisee: true },
  { code: 'raisonner', libelle: 'Raisonner', toujours_mobilisee: true },
  { code: 'calculer', libelle: 'Calculer', toujours_mobilisee: true },
  { code: 'communiquer', libelle: 'Communiquer', toujours_mobilisee: true },
  { code: 'algorithmique', libelle: 'Algorithmique', toujours_mobilisee: false },
];

const BAREME: QuestionBareme[] = [
  {
    question_key: 'ex1_q1a',
    numero: '1.a',
    libelle: 'Calculer la dérivée de f',
    max_points: 5,
    competences: ['calculer'],
    codes_erreurs: ['MA-DERIV-01'],
    depend_de: [],
    methodes_alternatives: [{ libelle: 'Passage par la forme développée' }],
    reponse_attendue: "f'(x) = 2x e^x + x^2 e^x",
    raisonnement_attendu: 'Règle du produit appliquée puis factorisation.',
    etapes: [{ libelle: 'Formule du produit posée' }],
  },
  {
    question_key: 'ex1_q1b',
    numero: '1.b',
    libelle: 'En déduire les variations de f',
    max_points: 5,
    competences: ['raisonner', 'communiquer'],
    codes_erreurs: ['MA-VAR-01'],
    depend_de: ['ex1_q1a'],
    methodes_alternatives: [],
    reponse_attendue: 'f croissante sur [0 ; +inf[, décroissante sur ]-inf ; -2].',
    raisonnement_attendu: "Étude du signe de f' puis tableau de variations.",
    etapes: [{ libelle: "Signe de f' étudié" }],
    regle_poursuite:
      "Si l'élève étudie correctement le signe de SA dérivée, même fausse, il garde les points de méthode.",
  },
  {
    question_key: 'ex1_q2',
    numero: '2',
    libelle: 'Démontrer par récurrence',
    max_points: 6,
    competences: ['raisonner'],
    codes_erreurs: ['MA-RECUR-01'],
    depend_de: [],
    methodes_alternatives: [],
    reponse_attendue: 'La propriété est vraie pour tout n.',
    raisonnement_attendu: 'Initialisation, hypothèse, hérédité, conclusion.',
    etapes: [{ libelle: 'Initialisation' }, { libelle: 'Hérédité' }],
  },
  {
    question_key: 'ex1_q3',
    numero: '3',
    libelle: 'Compléter le script Python',
    max_points: 4,
    competences: ['algorithmique'],
    codes_erreurs: ['MA-ALGO-01'],
    depend_de: [],
    methodes_alternatives: [],
    reponse_attendue: 'while u > 0.001 :',
    raisonnement_attendu: "Condition d'arrêt cohérente avec le seuil.",
    etapes: [{ libelle: 'Condition posée' }],
  },
];

const SANS_ALGO = BAREME.filter((q) => q.question_key !== 'ex1_q3').map((q) =>
  q.question_key === 'ex1_q2' ? { ...q, max_points: 10 } : q,
);

/** Réponse minimale du modèle pour une question, avec une preuve. */
function reponse(cle: string, score: number, extra: Partial<ReponseQuestionIA> = {}): ReponseQuestionIA {
  return {
    question_key: cle,
    score,
    elements_observes: [],
    elements_manquants: [],
    erreurs: [],
    preuves: score > 0 ? [{ page: 1, citation: 'extrait de la copie', explication: 'ok' }] : [],
    transcription_incertaine: false,
    relecture_humaine: false,
    motifs_relecture: [],
    methode_alternative: false,
    poursuite_depuis: null,
    competences: [],
    ...extra,
  };
}

const CONTEXTE_SAIN = { noteBrute: 0, maxBareme: 20, confiance: 0.95 };

// =====================================================================
//  1. Le barème lui-même
// =====================================================================

titre('1 · Le barème');

test('1.1', 'le total des questions doit valoir exactement 20', () => {
  const paliers = [{ points: 1, cumulable: true }];
  const ok = verifierBareme({
    questions: BAREME.map((q) => ({ ...q, paliers })),
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.equal(ok.total, 20);
  assert.equal(ok.blocages.filter((b) => b.code === 'total_incorrect').length, 0);
});

test('1.2', 'un total différent de 20 est un blocage', () => {
  const r = verifierBareme({
    questions: [{ ...BAREME[0], max_points: 4, paliers: [{ points: 1, cumulable: true }] }],
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.equal(r.ok, false);
  assert.ok(r.blocages.some((b) => b.code === 'total_incorrect'));
});

test('1.3', 'une question sans réponse attendue bloque', () => {
  const r = verifierBareme({
    questions: BAREME.map((q, i) => ({
      ...q,
      reponse_attendue: i === 0 ? '' : q.reponse_attendue,
      paliers: [{ points: 1, cumulable: true }],
    })),
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.ok(r.blocages.some((b) => b.code === 'reponse_attendue_manquante' && b.question_key === 'ex1_q1a'));
});

test('1.4', 'une question sans règle d’attribution des points bloque', () => {
  const r = verifierBareme({
    questions: BAREME.map((q) => ({ ...q, etapes: [], paliers: [] })),
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.equal(r.blocages.filter((b) => b.code === 'attribution_manquante').length, BAREME.length);
});

test('1.5', 'des paliers cumulables au-dessus du maximum bloquent', () => {
  const r = verifierBareme({
    questions: BAREME.map((q) => ({
      ...q,
      paliers: q.question_key === 'ex1_q1a' ? [{ points: 4, cumulable: true }, { points: 3, cumulable: true }] : [{ points: 1, cumulable: true }],
    })),
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.ok(r.blocages.some((b) => b.code === 'paliers_hors_max' && b.question_key === 'ex1_q1a'));
});

test('1.6', 'une compétence hors référentiel bloque', () => {
  const r = verifierBareme({
    questions: BAREME.map((q) => ({
      ...q,
      competences: q.question_key === 'ex1_q2' ? ['telepathie'] : q.competences,
      paliers: [{ points: 1, cumulable: true }],
    })),
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.ok(r.blocages.some((b) => b.code === 'competence_inconnue'));
});

test('1.7', 'une dépendance vers une question inexistante bloque', () => {
  const r = verifierBareme({
    questions: BAREME.map((q) => ({
      ...q,
      depend_de: q.question_key === 'ex1_q1b' ? ['ex9_q9'] : q.depend_de,
      paliers: [{ points: 1, cumulable: true }],
    })),
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.ok(r.blocages.some((b) => b.code === 'dependance_inconnue'));
});

test('1.8', 'les fractions de points vont au quart de point sans dérive', () => {
  assert.equal(arrondi(0.25 + 0.25 + 0.25), 0.75);
  assert.equal(calculerNoteBrute([{ points: 0.25 }, { points: 0.5 }, { points: 11 }]), 11.75);
});

// =====================================================================
//  2. Ouverture des corrections
// =====================================================================

titre('2 · Ouverture des corrections');

test('2.1', 'impossible d’ouvrir avec un barème incomplet', () => {
  const r = peutOuvrirCorrections({ statutExamen: 'validated', statutBareme: 'locked', controlesOk: false });
  assert.equal(r.ok, false);
  assert.match(r.raison!, /blocages/);
});

test('2.2', 'impossible d’ouvrir avec un barème non verrouillé', () => {
  const r = peutOuvrirCorrections({ statutExamen: 'validated', statutBareme: 'validated', controlesOk: true });
  assert.equal(r.ok, false);
  assert.match(r.raison!, /verrouillé/);
});

test('2.3', 'impossible d’ouvrir sans aucun barème', () => {
  assert.equal(peutOuvrirCorrections({ statutExamen: 'draft', statutBareme: null, controlesOk: true }).ok, false);
});

test('2.4', 'un barème verrouillé et sans blocage ouvre les corrections', () => {
  assert.equal(peutOuvrirCorrections({ statutExamen: 'validated', statutBareme: 'locked', controlesOk: true }).ok, true);
});

// =====================================================================
//  3. La note, question par question
// =====================================================================

titre('3 · La note');

test('3.1', 'la note est la somme mécanique des points', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 2.5),
    reponse('ex1_q2', 3),
    reponse('ex1_q3', 1.25),
  ]);
  assert.equal(calculerNoteBrute(questions), 11.75);
});

test('3.2', 'un score au-dessus du maximum est ramené au maximum et signalé', () => {
  const { questions, motifs } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 9),
    reponse('ex1_q1b', 0),
    reponse('ex1_q2', 0),
    reponse('ex1_q3', 0),
  ]);
  assert.equal(questions[0].points, 5);
  assert.ok(motifs.some((m) => m.code === 'points_hors_bareme'));
});

test('3.3', 'une question absente de la réponse du modèle vaut 0 et part en relecture', () => {
  const { questions, motifs } = normaliserQuestions(BAREME, [reponse('ex1_q1a', 5)]);
  assert.equal(questions.length, 4);
  assert.equal(questions[1].points, 0);
  assert.equal(questions[1].relecture_humaine, true);
  assert.ok(motifs.some((m) => m.code === 'cas_non_couvert' && m.question_key === 'ex1_q1b'));
});

test('3.4', 'une question renvoyée hors barème ne compte pas dans la note', () => {
  const { questions, motifs } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
    reponse('ex1_q99', 10),
  ]);
  assert.equal(calculerNoteBrute(questions), 20);
  assert.ok(motifs.some((m) => m.code === 'cas_non_couvert' && m.question_key === 'ex1_q99'));
});

test('3.5', 'un score négatif est ramené à zéro', () => {
  const { questions } = normaliserQuestions([BAREME[0]], [reponse('ex1_q1a', -3)]);
  assert.equal(questions[0].points, 0);
});

// =====================================================================
//  4. Les règles de correction en mathématiques
// =====================================================================

titre('4 · Règles de correction');

test('4.1', 'poursuite correcte après un résultat antérieur faux : les points de méthode restent', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 1), // dérivée fausse
    reponse('ex1_q1b', 4, { poursuite_depuis: 'ex1_q1a' }), // suite menée correctement
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  assert.equal(questions[1].points, 4);
  assert.equal(questions[1].poursuite_depuis, 'ex1_q1a');
  // Aucun motif de double sanction : la poursuite est déclarée et prévue au barème.
  assert.equal(verifierNonDoubleSanction(BAREME, questions).length, 0);
});

test('4.2', 'double sanction possible : zéro sur une question qui dépend d’une question ratée', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 1),
    reponse('ex1_q1b', 0),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const motifs = verifierNonDoubleSanction(BAREME, questions);
  assert.equal(motifs.length, 1);
  assert.equal(motifs[0].code, 'double_sanction_possible');
  assert.equal(motifs[0].question_key, 'ex1_q1b');
});

test('4.3', 'une poursuite déclarée sur une dépendance non prévue est signalée', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 3, { poursuite_depuis: 'ex1_q1a' }),
    reponse('ex1_q3', 4),
  ]);
  assert.ok(verifierNonDoubleSanction(BAREME, questions).some((m) => m.question_key === 'ex1_q2'));
});

test('4.4', 'la vérification de non-double-sanction ne modifie jamais les points', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 1),
    reponse('ex1_q1b', 0),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const avant = calculerNoteBrute(questions);
  verifierNonDoubleSanction(BAREME, questions);
  assert.equal(calculerNoteBrute(questions), avant);
});

test('4.5', 'résultat juste sans justification : le barème décide, pas le résultat', () => {
  // Le modèle n'attribue que la part « résultat » du barème de q2.
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 1.5, { elements_manquants: ['hérédité non démontrée'] }),
    reponse('ex1_q3', 4),
  ]);
  assert.equal(questions[2].points, 1.5);
  assert.equal(calculerNoteBrute(questions), 15.5);
});

test('4.6', 'raisonnement correct avec erreur de calcul : les points de raisonnement restent', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 5, {
      elements_observes: ['initialisation, hypothèse et hérédité correctes'],
      erreurs: [{ code: 'MA-CALC-01', citation: '2^k + 1 = 2^(k+1)' }],
    }),
    reponse('ex1_q3', 4),
  ]);
  assert.equal(questions[2].points, 5);
});

test('4.7', 'méthode alternative valide non prévue au barème : relecture, jamais zéro d’office', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 4, { methode_alternative: true }),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const motifs = motifsRelectureHumaine(BAREME, questions, { ...CONTEXTE_SAIN, noteBrute: 19 });
  assert.ok(motifs.some((m) => m.code === 'methode_alternative_non_prevue' && m.question_key === 'ex1_q1b'));
  assert.equal(questions[1].points, 4, 'les points ne sont pas retirés');
});

test('4.8', 'méthode alternative prévue au barème : aucune relecture déclenchée', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5, { methode_alternative: true }),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const motifs = motifsRelectureHumaine(BAREME, questions, { ...CONTEXTE_SAIN, noteBrute: 20 });
  assert.equal(motifs.filter((m) => m.code === 'methode_alternative_non_prevue').length, 0);
});

test('4.9', 'transcription incertaine : relecture, et ce n’est pas une erreur de l’élève', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5, { transcription_incertaine: true }),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const motifs = motifsRelectureHumaine(BAREME, questions, { ...CONTEXTE_SAIN, noteBrute: 20 });
  assert.ok(motifs.some((m) => m.code === 'transcription_incertaine'));
  assert.equal(questions[0].erreurs.length, 0, 'aucune erreur imputée à l’élève');
});

// =====================================================================
//  5. Relecture humaine
// =====================================================================

titre('5 · Déclenchement de la relecture humaine');

const complet = () => [
  reponse('ex1_q1a', 5),
  reponse('ex1_q1b', 5),
  reponse('ex1_q2', 6),
  reponse('ex1_q3', 4),
];

function motifsPour(sortie: ReponseQuestionIA[], contexte: Partial<typeof CONTEXTE_SAIN> & { noteAnnoncee?: number } = {}) {
  const { questions } = normaliserQuestions(BAREME, sortie);
  return motifsRelectureHumaine(BAREME, questions, {
    ...CONTEXTE_SAIN,
    noteBrute: calculerNoteBrute(questions),
    ...contexte,
  });
}

test('5.1', 'formule illisible (code de transcription) déclenche une relecture', () => {
  const s = complet();
  s[0].erreurs = [{ code: 'TR-ILLISIBLE-01', citation: 'exposant illisible' }];
  assert.ok(motifsPour(s).some((m) => m.code === 'formule_illisible'));
});

test('5.2', 'anomalie du sujet déclenche une relecture', () => {
  const s = complet();
  s[2].erreurs = [{ code: 'SU-ANOMALIE-01', citation: 'énoncé contradictoire' }];
  assert.ok(motifsPour(s).some((m) => m.code === 'anomalie_sujet'));
});

test('5.3', 'règles du barème contradictoires déclenchent une relecture', () => {
  const s = complet();
  s[1].erreurs = [{ code: 'SU-BAREME-CONTRADICTION-01', citation: '' }];
  assert.ok(motifsPour(s).some((m) => m.code === 'regles_contradictoires'));
});

test('5.4', 'des points attribués sans citation localisable déclenchent une relecture', () => {
  const s = complet();
  s[0].preuves = [];
  assert.ok(motifsPour(s).some((m) => m.code === 'justification_non_localisee'));
});

test('5.5', 'une note annoncée différente du détail déclenche une relecture', () => {
  assert.ok(motifsPour(complet(), { noteAnnoncee: 17 }).some((m) => m.code === 'total_incoherent'));
});

test('5.6', 'une confiance sous le seuil déclenche une relecture', () => {
  assert.ok(motifsPour(complet(), { confiance: 0.6 }).some((m) => m.code === 'confiance_insuffisante'));
});

test('5.7', 'une copie parfaitement corrigée ne déclenche aucune relecture', () => {
  assert.equal(motifsPour(complet()).length, 0);
});

test('5.8', 'les onze motifs sont distincts et dédupliqués', () => {
  const s = complet();
  s[0].transcription_incertaine = true;
  s[1].transcription_incertaine = true;
  const motifs = motifsPour(s);
  const cles = motifs.map((m) => `${m.code}|${m.question_key}|${m.message}`);
  assert.equal(new Set(cles).size, cles.length);
});

// =====================================================================
//  6. Le diagnostic de compétences
// =====================================================================

titre('6 · Diagnostic de compétences');

test('6.1', 'compétence absente du sujet → non_applicable, jamais zéro', () => {
  const { questions } = normaliserQuestions(SANS_ALGO, [
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 10),
  ]);
  const profil = profilCompetences(REFERENTIEL, SANS_ALGO, questions);
  assert.equal(profil.algorithmique, 'non_applicable');
  assert.equal(profil.chercher, 'non_applicable');
  assert.equal(calculerNoteBrute(questions), 20, 'la note reste pleine malgré les non_applicable');
});

test('6.2', 'compétence mobilisée mais non évaluable → non_observe', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 0, { transcription_incertaine: true }),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const profil = profilCompetences(REFERENTIEL, BAREME, questions);
  assert.equal(profil.calculer, 'non_observe');
});

test('6.3', 'le niveau observé suit le taux de réussite réel', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 1),
    reponse('ex1_q2', 2),
    reponse('ex1_q3', 4),
  ]);
  const profil = profilCompetences(REFERENTIEL, BAREME, questions);
  assert.equal(profil.calculer, 'very_satisfactory'); // 5/5
  assert.equal(profil.raisonner, 'insufficient'); // 3/11
  assert.equal(profil.algorithmique, 'very_satisfactory'); // 4/4
});

test('6.4', 'le modèle peut nuancer d’un cran, pas davantage', () => {
  const { questions } = normaliserQuestions(BAREME, complet());
  const nuance = profilCompetences(REFERENTIEL, BAREME, questions, { calculer: 'satisfactory' });
  assert.equal(nuance.calculer, 'satisfactory', 'un cran en dessous est accepté');
  const abusif = profilCompetences(REFERENTIEL, BAREME, questions, { calculer: 'insufficient' });
  assert.equal(abusif.calculer, 'very_satisfactory', 'trois crans sont refusés');
});

test('6.5', 'le diagnostic ne peut pas modifier la note', () => {
  const { questions } = normaliserQuestions(BAREME, complet());
  const avant = calculerNoteBrute(questions);
  profilCompetences(REFERENTIEL, BAREME, questions, {
    calculer: 'insufficient',
    raisonner: 'insufficient',
    communiquer: 'insufficient',
    algorithmique: 'insufficient',
  });
  assert.equal(calculerNoteBrute(questions), avant);
});

test('6.6', 'une compétence non déclarée au barème pour une question est ignorée', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5, { competences: ['calculer', 'communiquer'] }),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  assert.deepEqual(questions[0].competences, ['calculer']);
});

// =====================================================================
//  7. Taxonomie d'erreurs
// =====================================================================

titre('7 · Taxonomie d’erreurs');

test('7.1', 'l’effet réel sur les points est enregistré, pas la gravité', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 3, { erreurs: [{ code: 'MA-DERIV-01', citation: 'dérivée fausse', certitude: 0.9 }] }),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const evenements = evenementsTaxonomie(questions);
  assert.equal(evenements.length, 1);
  assert.equal(evenements[0].effet_points, 2); // 5 - 3
  assert.equal(evenements[0].question_key, 'ex1_q1a');
  assert.equal(evenements[0].certitude, 0.9);
});

test('7.2', 'une erreur sans perte de points a un effet nul', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5, { erreurs: [{ code: 'MA-REDAC-01', citation: 'pas de phrase de conclusion' }] }),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  assert.equal(evenementsTaxonomie(questions)[0].effet_points, 0);
});

test('7.3', 'l’erreur source est conservée pour tracer l’enchaînement', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 1, { erreurs: [{ code: 'MA-DERIV-01', citation: 'x' }] }),
    reponse('ex1_q1b', 3, {
      poursuite_depuis: 'ex1_q1a',
      erreurs: [{ code: 'MA-VAR-01', citation: 'y', erreur_source: 'ex1_q1a' }],
    }),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const e = evenementsTaxonomie(questions).find((x) => x.code === 'MA-VAR-01');
  assert.equal(e?.erreur_source, 'ex1_q1a');
});

// =====================================================================
//  8. Résultat structuré complet
// =====================================================================

titre('8 · Résultat structuré');

function resultat(sortie: ReponseQuestionIA[], options: Partial<Parameters<typeof construireResultat>[0]> = {}) {
  return construireResultat({
    examId: 'exam-1',
    rubricId: null,
    baremeVersionId: 'version-1',
    version: '1.0',
    bareme: BAREME,
    sortie,
    referentiel: REFERENTIEL,
    maxBareme: 20,
    confiance: 0.95,
    baremeVerrouille: true,
    baremeCalibre: true,
    etalonsCompares: 7,
    ...options,
  });
}

test('8.1', 'le résultat porte la note brute, la note validée et le maximum', () => {
  const r = resultat([
    reponse('ex1_q1a', 0.25),
    reponse('ex1_q1b', 5),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 0.5),
  ]);
  assert.equal(r.score_raw, 11.75);
  assert.equal(r.score_validated, 11.75);
  assert.equal(r.max_score, 20);
  assert.equal(r.moteur, 'bareme_sujet');
});

test('8.2', 'le résultat porte la version exacte du barème employée', () => {
  const r = resultat(complet());
  assert.equal(r.rubric_version, '1.0');
  assert.equal(r.bareme_version_id, 'version-1');
  assert.equal(r.calibration_metadata.rubric_locked, true);
  assert.equal(r.calibration_metadata.etalons_compares, 7);
});

test('8.3', 'human_review_required suit les motifs, pas l’humeur du modèle', () => {
  const propre = resultat(complet());
  assert.equal(propre.human_review_required, false);
  const s = complet();
  s[0].preuves = [];
  assert.equal(resultat(s).human_review_required, true);
});

test('8.4', 'chaque question porte ses motifs de relecture, là où le doute se pose', () => {
  const s = complet();
  s[1].transcription_incertaine = true;
  const r = resultat(s);
  const q = r.questions.find((x) => x.question_key === 'ex1_q1b')!;
  assert.equal(q.relecture_humaine, true);
  assert.ok(q.motifs_relecture.some((m) => m.code === 'transcription_incertaine'));
});

test('8.5', 'le profil sépare non_applicable, non_observe et les niveaux observés', () => {
  const r = resultat([
    reponse('ex1_q1a', 5),
    reponse('ex1_q1b', 2, { transcription_incertaine: true }),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  assert.equal(r.competency_profile.chercher, 'non_applicable');
  assert.equal(r.competency_profile.communiquer, 'non_observe');
  assert.equal(r.competency_profile.calculer, 'very_satisfactory');
});

test('8.6', 'la note ne bouge pas quand le profil est catastrophique', () => {
  const s = complet();
  const r = resultat(s, {
    profilPropose: { calculer: 'insufficient', raisonner: 'insufficient', algorithmique: 'insufficient' },
  });
  assert.equal(r.score_raw, 20);
});

// =====================================================================
//  9. Calibration par copies étalons
// =====================================================================

titre('9 · Calibration');

const CLES = BAREME.map((q) => q.question_key);

test('9.1', 'comparaison IA / humain sur une copie', () => {
  const c = comparerEtalon({
    etalonId: 'e1',
    libelle: 'Copie moyenne',
    humaines: [
      { prof: 'A', note_totale: 13, parQuestion: { ex1_q1a: 5, ex1_q1b: 3, ex1_q2: 3, ex1_q3: 2 } },
      { prof: 'B', note_totale: 12, parQuestion: { ex1_q1a: 5, ex1_q1b: 2, ex1_q2: 3, ex1_q3: 2 } },
    ],
    ia: { note: 10, parQuestion: { ex1_q1a: 4, ex1_q1b: 2, ex1_q2: 2, ex1_q3: 2 } },
    clesQuestions: CLES,
  });
  assert.equal(c.note_humaine_moyenne, 12.5);
  assert.equal(c.note_humaine_mediane, 12.5);
  assert.equal(c.amplitude_humaine, 1);
  assert.equal(c.ecart_total, -2.5);
  assert.deepEqual(c.questions_en_desaccord_entre_profs, ['ex1_q1b']);
  assert.equal(c.reference_fiable, true);
});

test('9.2', 'deux professeurs trop éloignés : la référence n’est pas présentée comme objective', () => {
  const c = comparerEtalon({
    etalonId: 'e2',
    libelle: 'Copie litigieuse',
    humaines: [
      { prof: 'A', note_totale: 15, parQuestion: {} },
      { prof: 'B', note_totale: 9, parQuestion: {} },
    ],
    ia: { note: 12, parQuestion: {} },
    clesQuestions: CLES,
  });
  assert.equal(c.amplitude_humaine, 6);
  assert.equal(c.reference_fiable, false);
});

test('9.3', 'le biais moyen dit si le barème est systématiquement sévère', () => {
  const comparaisons = [10, 11, 12].map((noteIa, i) =>
    comparerEtalon({
      etalonId: `e${i}`,
      libelle: `Copie ${i}`,
      humaines: [{ prof: 'A', note_totale: noteIa + 3, parQuestion: { ex1_q1a: 5 } }],
      ia: { note: noteIa, parQuestion: { ex1_q1a: 3 } },
      clesQuestions: ['ex1_q1a'],
    }),
  );
  const stats = statistiquesCalibration(comparaisons);
  assert.equal(stats.copies_testees, 3);
  assert.equal(stats.biais_moyen, -3);
  assert.equal(stats.ecart_absolu_moyen, 3);
  assert.equal(stats.taux_accord_exact, 0);
});

test('9.4', 'les questions qui concentrent les désaccords remontent en tête', () => {
  const comparaisons = [
    comparerEtalon({
      etalonId: 'e1',
      libelle: 'c1',
      humaines: [{ prof: 'A', note_totale: 20, parQuestion: { ex1_q1a: 5, ex1_q1b: 5, ex1_q2: 6, ex1_q3: 4 } }],
      ia: { note: 16, parQuestion: { ex1_q1a: 5, ex1_q1b: 1, ex1_q2: 6, ex1_q3: 4 } },
      clesQuestions: CLES,
    }),
  ];
  const stats = statistiquesCalibration(comparaisons);
  assert.equal(stats.questions_en_desaccord[0].question_key, 'ex1_q1b');
  assert.equal(stats.questions_en_desaccord[0].ecart_absolu_moyen, 4);
  assert.equal(stats.taux_accord_025, 0.75);
});

test('9.5', 'une copie sans correction IA n’entre pas dans les statistiques', () => {
  const c = comparerEtalon({
    etalonId: 'e1',
    libelle: 'Pas encore corrigée',
    humaines: [{ prof: 'A', note_totale: 13, parQuestion: {} }],
    ia: null,
    clesQuestions: CLES,
  });
  assert.equal(c.ecart_total, null);
  assert.equal(statistiquesCalibration([c].filter((x) => x.ecart_total !== null)).copies_testees, 0);
});

test('9.6', 'la couverture des niveaux dit ce qui manque', () => {
  const c = couvertureEtalons(['moyen', 'excellent', null]);
  assert.deepEqual(c.couverts.sort(), ['excellent', 'moyen']);
  assert.equal(c.manquants.length, 5);
  assert.ok(c.manquants.some((m) => m.code === 'presque_blanche'));
});

// =====================================================================
//  10. Étanchéité entre les couches
// =====================================================================

titre('10 · Étanchéité des couches');

test('10.1', 'aucune fonction du noyau ne renvoie une note différente de la somme', () => {
  for (const scores of [
    [5, 5, 6, 4],
    [0, 0, 0, 0],
    [2.5, 1.25, 3.75, 0.5],
  ]) {
    const r = resultat(BAREME.map((q, i) => reponse(q.question_key, scores[i])));
    assert.equal(
      r.score_raw,
      arrondi(scores.reduce((a, b) => a + b, 0)),
      `note ≠ somme pour ${scores.join('+')}`,
    );
    assert.equal(r.score_validated, r.score_raw);
  }
});

test('10.2', 'une copie blanche vaut 0, pas une note « au vu du niveau »', () => {
  const r = resultat(BAREME.map((q) => reponse(q.question_key, 0)));
  assert.equal(r.score_raw, 0);
  assert.equal(r.max_score, 20);
});

test('10.3', 'un barème dont les maximums ne font pas 20 est signalé, pas rattrapé', () => {
  const tronque = BAREME.slice(0, 2); // 10 points
  const { questions } = normaliserQuestions(tronque, [reponse('ex1_q1a', 5), reponse('ex1_q1b', 5)]);
  const motifs = motifsRelectureHumaine(tronque, questions, {
    noteBrute: 10,
    maxBareme: 20,
    confiance: 0.95,
  });
  assert.ok(motifs.some((m) => m.code === 'total_incoherent'));
  assert.equal(calculerNoteBrute(questions), 10, 'la note n’est pas gonflée pour atteindre 20');
});

// =====================================================================
//  11. Les règles transversales des épreuves à calculs
//
//  Elles s'appliquent à toutes les questions de tous les barèmes. Le
//  correcteur reçoit la consigne ; ces contrôles vérifient qu'elle a été
//  suivie, parce qu'une consigne n'est pas une garantie.
// =====================================================================

titre('11 · Les règles transversales');

test('11.1', 'chaque règle est réellement demandée au correcteur', () => {
  const consigne = readFileSync(
    new URL('../supabase/functions/correct-copy-bareme/index.ts', import.meta.url),
    'utf8',
  );
  for (const r of REGLES_TRANSVERSALES) {
    assert.ok(
      consigne.includes(r.dans_consigne),
      `la règle « ${r.titre} » ne figure pas dans la consigne (marque « ${r.dans_consigne} » absente)`,
    );
  }
});

test('11.2', 'zéro sur une question où des éléments justes sont relevés part en relecture', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 0, { elements_observes: ['dérivée correctement calculée'] }),
    reponse('ex1_q1b', 4),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const motifs = motifsRelectureHumaine(BAREME, questions, { ...CONTEXTE_SAIN, noteBrute: 14 });
  assert.ok(
    motifs.some((m) => m.code === 'cas_non_couvert' && m.question_key === 'ex1_q1a'),
    'un résultat final faux ne doit jamais mettre la question à zéro en silence',
  );
});

test('11.3', 'le maximum malgré des manques, sur une question qui demande une justification', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 6, { elements_manquants: ['aucune étude de signe'] }),
    reponse('ex1_q1b', 4),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const motifs = motifsRelectureHumaine(BAREME, questions, { ...CONTEXTE_SAIN, noteBrute: 20 });
  assert.ok(
    motifs.some((m) => m.code === 'cas_non_couvert' && m.question_key === 'ex1_q1a'),
    'un bon résultat sans la démonstration demandée ne vaut pas tous les points',
  );
});

test('11.4', 'une correction propre ne déclenche aucune de ces deux alertes', () => {
  const { questions } = normaliserQuestions(BAREME, [
    reponse('ex1_q1a', 5, { elements_observes: ['dérivée juste'] }),
    reponse('ex1_q1b', 4),
    reponse('ex1_q2', 6),
    reponse('ex1_q3', 4),
  ]);
  const motifs = motifsRelectureHumaine(BAREME, questions, { ...CONTEXTE_SAIN, noteBrute: 19 });
  assert.equal(motifs.filter((m) => m.code === 'cas_non_couvert').length, 0);
});

test('11.5', 'des étapes attendues sans aucun palier de points bloquent le verrouillage', () => {
  const controles = verifierBareme({
    questions: BAREME.map((q) => ({ ...q, paliers: [] })),
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.ok(controles.blocages.some((b) => b.code === 'etapes_sans_points'));
  assert.equal(controles.ok, false);
});

test('11.6', 'une question à plusieurs points sans réponse alternative est signalée', () => {
  const controles = verifierBareme({
    questions: BAREME.map((q) => ({ ...q, paliers: [{ points: 1, cumulable: true }] })),
    maxScore: 20,
    competencesConnues: REFERENTIEL.map((c) => c.code),
  });
  assert.ok(
    controles.avertissements.some((a) => a.code === 'aucune_reponse_acceptee_alternative'),
    'un écart de formulation partirait en relecture sans que personne ne l’ait dit',
  );
});

test('11.7', 'les épreuves à calculs se notent bien au barème du sujet', () => {
  for (const m of ['maths', 'physique-chimie', 'svt']) {
    assert.equal(moteurAttendu(m), 'bareme_sujet', `${m} devrait se noter au barème du sujet`);
  }
  for (const m of ['francais', 'philosophie', 'histoire-geo', 'ses', 'hlp']) {
    assert.equal(moteurAttendu(m), 'grille_generique', `${m} devrait se noter à la grille commune`);
  }
});

// --- Bilan ------------------------------------------------------------

console.log(`\n${reussis} test(s) réussi(s), ${echoues} échec(s).`);
if (echecs.length) {
  console.log('\nÉchecs :');
  for (const e of echecs) console.log(`  • ${e}`);
  process.exit(1);
}
