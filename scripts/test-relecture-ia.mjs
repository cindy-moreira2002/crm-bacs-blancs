/**
 * Deuxième lecture par l'IA, règle du drapeau, plafond de dépense —
 * contrôles hors ligne (aucun appel au modèle, aucune base).
 *
 *   npm run test:relecture-ia
 *
 * Ce qui est testé est le code qui tourne en production : le noyau vit dans
 * supabase/functions/_shared/relecture-ia-noyau.ts et l'Edge Function
 * review-copy l'importe tel quel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const N = await import('../src/lib/relectureIaNoyau.ts');
const { echelleFeuille } = await import('../src/lib/importGrille.ts');

const COPIE = {
  overall_confidence: 0.95,
  requires_human_review: false,
  pages: [
    { page_number: 1, text: "Le progrès technique, c'est-à-dire l'ensemble des innovations, favorise la croissance économique." },
    { page_number: 2, text: 'Selon le document 1, la productivité globale des facteurs augmente de 2 % par an entre 1950 et 1973.' },
  ],
};

const GRILLE = {
  maximum_score: 10,
  criteria: [
    { code: 'A', name: 'Connaissances', maximum_score: 4 },
    { code: 'B', name: 'Document', maximum_score: 4 },
    { code: 'C', name: 'Expression', maximum_score: 2 },
  ],
};

const PREMIER = {
  note_finale: 5,
  appreciation_generale: 'Copie correcte.',
  criteria: [
    { code: 'A', score: 2, maximum: 4, justification: 'Définition présente.', evidence: [] },
    { code: 'B', score: 1, maximum: 4, justification: 'Document peu exploité.', evidence: [] },
    { code: 'C', score: 2, maximum: 2, justification: 'Clair.', evidence: [] },
  ],
  human_review_required: true,
  human_review_reasons: [
    'Note du modèle (15) remplacée par la somme analytique (5).',
    'Le critère B semble sévère.',
  ],
};

function relecture(over = {}) {
  return {
    criteres: [
      { code: 'A', verdict: 'confirme', score: 2, citation: "l'ensemble des innovations", motif: '' },
      { code: 'B', verdict: 'ajuste', score: 2.5, citation: 'la productivité globale des facteurs augmente de 2 %', motif: 'Donnée chiffrée bien reprise.' },
      { code: 'C', verdict: 'confirme', score: 2, citation: 'favorise la croissance économique', motif: '' },
    ],
    motifs_premiere_lecture: [{ index: 0, resolu: true, explication: 'Le document est exploité.' }],
    doutes_persistants: [],
    lecture_douteuse: [],
    appreciation_corrigee: '',
    synthese: 'B relevé.',
    confiance: 0.9,
    ...over,
  };
}

// --- Périmètre --------------------------------------------------------

test('périmètre : les 5 matières sans prof, et elles seules', () => {
  for (const m of ['ses', 'hlp', 'anglais', 'svt', 'physique-chimie', 'SVT']) {
    assert.equal(N.relectureIaConcernee(m), true, m);
  }
  for (const m of ['francais', 'philosophie', 'maths', 'hggsp', '', null]) {
    assert.equal(N.relectureIaConcernee(m), false, String(m));
  }
});

test('la liste du SQL 58 est la même que celle du code', () => {
  const sql = readFileSync(new URL('../supabase/sql/58_relecture_ia_sans_prof.sql', import.meta.url), 'utf8');
  const listes = [...sql.matchAll(/array\[([^\]]+)\]/g)].map((m) =>
    m[1].split(',').map((x) => x.trim().replace(/'/g, '')),
  );
  assert.ok(listes.length >= 2);
  for (const l of listes) assert.deepEqual(l, [...N.MATIERES_RELECTURE_IA]);
});

test('le SQL 58 est 100 % ASCII (éditeur Supabase)', () => {
  const sql = readFileSync(new URL('../supabase/sql/58_relecture_ia_sans_prof.sql', import.meta.url), 'utf8');
  assert.equal(/[^\x00-\x7f]/.test(sql), false);
});

// --- Citations --------------------------------------------------------

test('citation : retrouvée malgré accents, apostrophes et ponctuation', () => {
  const t = N.texteTranscription(COPIE);
  assert.equal(N.citationPresente('le progres technique, c’est-a-dire', t), true);
  assert.equal(N.citationPresente('« la productivité globale des facteurs »', t), true);
});

test('citation : coupée par « … », chaque morceau doit exister', () => {
  const t = N.texteTranscription(COPIE);
  assert.equal(N.citationPresente('Le progrès technique … favorise la croissance', t), true);
  assert.equal(N.citationPresente('Le progrès technique … détruit des emplois', t), false);
});

test('citation : une paraphrase ou une invention ne passe pas', () => {
  const t = N.texteTranscription(COPIE);
  assert.equal(N.citationPresente("l'élève explique bien le rôle de l'innovation", t), false);
  assert.equal(N.citationPresente('', t), false);
  assert.equal(N.citationPresente('le progrès', ''), false);
});

test('citation : une petite faute de recopie sur une longue citation passe', () => {
  const t = N.texteTranscription(COPIE);
  assert.equal(
    N.citationPresente('Selon le document 1, la productivité globale des facteurs augmente de 2 % chaque an entre 1950 et 1973', t),
    true,
  );
});

// --- Deuxième lecture, grille commune ---------------------------------

test('grille : l’ajustement est appliqué, borné, sommé et journalisé', () => {
  const r = N.appliquerRelectureGrille({ resultat: PREMIER, rubricJson: GRILLE, relecture: relecture(), transcription: COPIE });
  assert.equal(r.noteAvant, 5);
  assert.equal(r.noteApres, 6.5);
  assert.equal(r.resultat.note_finale, 6.5);
  assert.equal(r.resultat.analytic_sum, 6.5);
  assert.deepEqual(r.changements.map((c) => [c.cible, c.avant, c.apres]), [['B', 1, 2.5]]);
  // Le motif réglé par la normalisation n'est pas soumis ; celui résolu par le relecteur disparaît.
  assert.equal(r.motifs.length, 0);
  assert.equal(r.resultat.human_review_required, false);
});

test('grille : un score hors barème est ramené au maximum du critère', () => {
  const rel = relecture();
  rel.criteres[2] = { code: 'C', verdict: 'ajuste', score: 7, citation: 'favorise la croissance économique', motif: 'x' };
  const r = N.appliquerRelectureGrille({ resultat: PREMIER, rubricJson: GRILLE, relecture: rel, transcription: COPIE });
  assert.equal(r.resultat.criteria.find((c) => c.code === 'C').score, 2);
});

test('grille : un critère oublié garde son score et lève un doute', () => {
  const rel = relecture();
  rel.criteres = rel.criteres.filter((c) => c.code !== 'A');
  const r = N.appliquerRelectureGrille({ resultat: PREMIER, rubricJson: GRILLE, relecture: rel, transcription: COPIE });
  assert.equal(r.resultat.criteria.find((c) => c.code === 'A').score, 2);
  assert.ok(r.motifs.some((m) => m.code === 'critere_non_relu' && m.nature === 'correction'));
});

test('grille : des points sans passage de la copie lèvent un doute', () => {
  const rel = relecture();
  rel.criteres[0] = { code: 'A', verdict: 'confirme', score: 2, citation: 'une phrase qui n’existe pas du tout dans la copie', motif: '' };
  const r = N.appliquerRelectureGrille({ resultat: PREMIER, rubricJson: GRILLE, relecture: rel, transcription: COPIE });
  assert.ok(r.motifs.some((m) => m.code === 'citation_introuvable' && m.cible === 'A'));
  assert.equal(r.resultat.human_review_required, true);
});

test('grille : un doute non résolu du premier passage persiste', () => {
  const r = N.appliquerRelectureGrille({
    resultat: PREMIER, rubricJson: GRILLE, transcription: COPIE,
    relecture: relecture({ motifs_premiere_lecture: [{ index: 0, resolu: false, explication: 'Impossible à trancher.' }] }),
  });
  assert.equal(r.motifs.length, 1);
  assert.equal(r.motifs[0].code, 'doute_premier_passage');
});

test('grille : un écart de plus de 25 % du barème entre les deux lectures lève un doute', () => {
  const rel = relecture();
  rel.criteres[1] = { code: 'B', verdict: 'ajuste', score: 4, citation: 'la productivité globale des facteurs', motif: 'x' };
  rel.criteres[0] = { code: 'A', verdict: 'ajuste', score: 4, citation: "l'ensemble des innovations", motif: 'x' };
  const r = N.appliquerRelectureGrille({ resultat: PREMIER, rubricJson: GRILLE, relecture: rel, transcription: COPIE });
  assert.equal(r.noteApres, 10);
  assert.ok(r.motifs.some((m) => m.code === 'ecart_important'));
});

test('grille : lecture de copie douteuse → doute « transcription », sauf si Cindy a forcé', () => {
  const douteuse = { ...COPIE, overall_confidence: 0.6 };
  const r = N.appliquerRelectureGrille({ resultat: PREMIER, rubricJson: GRILLE, relecture: relecture(), transcription: douteuse });
  assert.ok(r.motifs.every((m) => m.nature === 'transcription'));
  assert.ok(r.motifs.length >= 1);
  const f = N.appliquerRelectureGrille({
    resultat: PREMIER, rubricJson: GRILLE, relecture: relecture(), transcription: douteuse, transcriptionForcee: true,
  });
  assert.equal(f.motifs.length, 0);
});

test('grille : l’appréciation corrigée remplace l’ancienne, sinon elle reste', () => {
  const r1 = N.appliquerRelectureGrille({ resultat: PREMIER, rubricJson: GRILLE, relecture: relecture(), transcription: COPIE });
  assert.equal(r1.resultat.appreciation_generale, 'Copie correcte.');
  const r2 = N.appliquerRelectureGrille({
    resultat: PREMIER, rubricJson: GRILLE, transcription: COPIE,
    relecture: relecture({ appreciation_corrigee: 'Ta copie exploite bien le document.' }),
  });
  assert.equal(r2.resultat.appreciation_generale, 'Ta copie exploite bien le document.');
});

test('grille : un enjeu minime sans citation (≤ 0,5 pt sur 20) ne dérange personne', () => {
  const grille = { maximum_score: 20, criteria: [{ code: 'L', maximum_score: 0.5 }, { code: 'A', maximum_score: 19.5 }] };
  const premier = { criteria: [{ code: 'L', score: 0.25 }, { code: 'A', score: 10, evidence: [{ quote: "l'ensemble des innovations" }] }], human_review_reasons: [] };
  const r = N.appliquerRelectureGrille({
    resultat: premier, rubricJson: grille, transcription: COPIE,
    relecture: relecture({ criteres: [
      { code: 'L', verdict: 'confirme', score: 0.5, citation: '', motif: '' },
      { code: 'A', verdict: 'confirme', score: 10, citation: '', motif: '' },
    ] }),
  });
  assert.deepEqual(r.motifs.map((m) => m.code), []);
  assert.equal(N.motifsCitationsBareme([{ question_key: 'l', points: 0.5, preuves: [] }], 'x', 20).length, 0);
  assert.equal(N.motifsCitationsBareme([{ question_key: 'q', points: 1, preuves: [] }], 'x', 20).length, 1);
});

// --- Deuxième lecture, barème par sujet --------------------------------

test('barème : la sortie reconstruite porte les scores relus et valide une méthode alternative', () => {
  const premier = [
    { question_key: 'q1', points: 1, max_points: 2, preuves: [{ citation: 'x' }], methode_alternative: true, relecture_humaine: true },
    { question_key: 'q2', points: 3, max_points: 3, preuves: [], relecture_humaine: false },
  ];
  const { sortie, changements, nonRelues } = N.sortieDepuisRelecture(premier, [
    { question_key: 'q1', verdict: 'ajuste', score: 2, citation: 'méthode par récurrence', motif: 'Méthode valide.', relecture_humaine: false, transcription_incertaine: false, methode_alternative_validee: true },
  ]);
  assert.equal(sortie[0].score, 2);
  assert.equal(sortie[0].methode_alternative, false);
  assert.equal(sortie[0].relecture_humaine, false);
  assert.equal(sortie[0].preuves.length, 2);
  assert.deepEqual(nonRelues, ['q2']);
  assert.deepEqual(changements.map((c) => c.cible), ['q1']);
});

test('barème : nature des motifs du noyau', () => {
  assert.equal(N.natureMotifBareme('formule_illisible'), 'transcription');
  assert.equal(N.natureMotifBareme('total_incoherent'), 'systeme');
  assert.equal(N.natureMotifBareme('double_sanction_possible'), 'correction');
});

// --- Règle du drapeau ---------------------------------------------------

const doute = (nature = 'correction') => ({ nature, code: 'x', message: 'doute' });

test('drapeau : plus de doute → terminer', () => {
  assert.equal(N.deciderSuite({ motifs: [], recorrectionsFaites: 0, budgetDisponible: true }).suite, 'terminer');
  assert.equal(N.deciderSuite({ motifs: [], recorrectionsFaites: 1, budgetDisponible: false }).suite, 'terminer');
});

test('drapeau : doute de correction → UNE recorrection', () => {
  assert.equal(N.deciderSuite({ motifs: [doute()], recorrectionsFaites: 0, budgetDisponible: true }).suite, 'recorriger');
});

test('drapeau : jamais deux recorrections — la seconde fois, file Cindy', () => {
  for (const n of [1, 2, 50]) {
    assert.equal(N.deciderSuite({ motifs: [doute()], recorrectionsFaites: n, budgetDisponible: true }).suite, 'file_cindy');
  }
  assert.equal(N.MAX_RECORRECTIONS, 1);
});

test('drapeau : un doute de lecture ou de barème ne se recorrige pas', () => {
  assert.equal(N.deciderSuite({ motifs: [doute('transcription')], recorrectionsFaites: 0, budgetDisponible: true }).suite, 'file_cindy');
  assert.equal(N.deciderSuite({ motifs: [doute('systeme'), doute('transcription')], recorrectionsFaites: 0, budgetDisponible: true }).suite, 'file_cindy');
  // Un seul doute de correction suffit à tenter la recorrection.
  assert.equal(N.deciderSuite({ motifs: [doute('transcription'), doute()], recorrectionsFaites: 0, budgetDisponible: true }).suite, 'recorriger');
});

test('drapeau : plafond atteint → file Cindy, pas de recorrection', () => {
  const d = N.deciderSuite({ motifs: [doute()], recorrectionsFaites: 0, budgetDisponible: false });
  assert.equal(d.suite, 'file_cindy');
  assert.match(d.raison, /[Pp]lafond/);
});

test('drapeau : une simulation de boucle s’arrête toujours (≤ 2 corrections, ≤ 2 relectures)', () => {
  let recorrections = 0;
  let relectures = 0;
  for (let tour = 0; tour < 10; tour++) {
    relectures++;
    const d = N.deciderSuite({ motifs: [doute()], recorrectionsFaites: recorrections, budgetDisponible: true });
    if (d.suite !== 'recorriger') {
      assert.equal(d.suite, 'file_cindy');
      break;
    }
    recorrections++;
  }
  assert.equal(recorrections, 1);
  assert.equal(relectures, 2);
});

test('transcription : une relance, puis file Cindy', () => {
  assert.equal(N.deciderTranscription({ douteuse: false, relancesFaites: 0, budgetDisponible: true }), 'corriger');
  assert.equal(N.deciderTranscription({ douteuse: true, relancesFaites: 0, budgetDisponible: true }), 'retranscrire');
  assert.equal(N.deciderTranscription({ douteuse: true, relancesFaites: 1, budgetDisponible: true }), 'file_cindy');
  assert.equal(N.deciderTranscription({ douteuse: true, relancesFaites: 0, budgetDisponible: false }), 'file_cindy');
});

// --- Plafond --------------------------------------------------------------

test('plafond : on refuse ce qui dépasserait, pas ce qui l’atteint', () => {
  assert.equal(N.decisionPlafond(398, 2, 400), true);
  assert.equal(N.decisionPlafond(399, 2, 400), false);
  assert.equal(N.decisionPlafond(400, 1, 400), false);
  assert.equal(N.decisionPlafond(0, 0, 400), true); // une action compte au moins une unité
  assert.equal(N.decisionPlafond(400, 0, 400), false);
});

test('plafond : dépôt et relance valent 2 unités (transcription + correction), le reste 1', () => {
  assert.equal(N.UNITES_IA.depot, 2);
  assert.equal(N.UNITES_IA.relance, 2);
  for (const k of ['dossier', 'relecture', 'recorrection', 'retranscription', 'forcage']) assert.equal(N.UNITES_IA[k], 1);
});

test('plafond : le SQL 58 a le même plafond par défaut que le code', () => {
  const sql = readFileSync(new URL('../supabase/sql/58_relecture_ia_sans_prof.sql', import.meta.url), 'utf8');
  assert.match(sql, new RegExp(`plafond_jour\\s+integer not null default ${N.PLAFOND_JOUR_DEFAUT}`));
});

// --- Import de classeur : l'échelle de la matière -----------------------

test('import : une feuille de SVT sur 15 reste sur 15', () => {
  assert.deepEqual(echelleFeuille('svt', 15), { cible: 15, convertir: false });
});

test('import : une partie de SES sur 4 reste sur 4', () => {
  assert.deepEqual(echelleFeuille('ses', 4), { cible: 4, convertir: false });
});

test('import : un barème inconnu est ramené sur l’échelle de la matière, pas sur 20', () => {
  assert.deepEqual(echelleFeuille('svt', 12), { cible: 15, convertir: true });
  assert.deepEqual(echelleFeuille('physique-chimie', 15), { cible: 20, convertir: true });
});

test('import : sans matière, la règle d’avant (20) tient', () => {
  assert.deepEqual(echelleFeuille(null, 20), { cible: 20, convertir: false });
  assert.deepEqual(echelleFeuille(undefined, 15), { cible: 20, convertir: true });
});
