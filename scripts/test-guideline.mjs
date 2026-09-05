/**
 * Lecture des guidelines de correction — contrôles hors ligne.
 *
 * Les fixtures sont de VRAIS exports du classeur des profs
 * (`scripts/fixtures/guideline-hggsp-v0*.csv`) : si le format des classeurs
 * change, ces tests tombent, ce qui est exactement le but.
 *
 *   npm run test:guideline
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ici = dirname(fileURLToPath(import.meta.url));
const lireFixture = (nom) => readFileSync(join(ici, 'fixtures', nom), 'utf8');

const { lireCsv } = await import('../src/lib/importGrille.ts');
const { lireGuideline, lireFeuilleACocher, estFeuilleACocher, nombreFr } = await import(
  '../src/lib/guidelineSheet.ts'
);

// --- 1. La page de barème --------------------------------------------

const guideline = lireGuideline(lireCsv(lireFixture('guideline-hggsp-v0.csv')));

test('les deux parties de l’épreuve sont reconnues', () => {
  assert.equal(guideline.parties.length, 2);
  assert.match(guideline.parties[0].libelle, /DISSERTATION/i);
  assert.equal(guideline.parties[0].points, 10);
  assert.match(guideline.parties[1].libelle, /ÉTUDE CRITIQUE/i);
  assert.equal(guideline.parties[1].points, 10);
});

test('le total des critères vaut le barème annoncé', () => {
  const dissertation = guideline.criteres.filter((c) => /DISSERTATION/i.test(c.partie));
  const etude = guideline.criteres.filter((c) => /ÉTUDE CRITIQUE/i.test(c.partie));
  const somme = (l) => Math.round(l.reduce((s, c) => s + c.max, 0) * 100) / 100;
  assert.equal(somme(dissertation), 10, 'dissertation sur 10');
  assert.equal(somme(etude), 10, 'étude critique sur 10');
  assert.equal(guideline.total, 20);
});

test('les critères portent bloc, code stable et paliers', () => {
  const analyse = guideline.criteres.find((c) => /Analyse du sujet/i.test(c.libelle));
  assert.ok(analyse, 'le critère « Analyse du sujet » est trouvé');
  assert.equal(analyse.code, 'P1.A.1');
  assert.match(analyse.bloc, /^A\. Compréhension/);
  assert.equal(analyse.max, 1);
  assert.deepEqual(
    analyse.niveaux.map((n) => n.points),
    [0, 0.25, 0.5, 0.75, 1],
  );
  assert.match(analyse.niveaux[4].libelle, /Analyse précise du sujet/);
});

test('les paliers écrits sur une seule cellule sont lus aussi', () => {
  const reponse = guideline.criteres.find((c) => /Réponse au sujet/i.test(c.libelle));
  assert.ok(reponse);
  assert.equal(reponse.max, 0.5);
  assert.deepEqual(
    reponse.niveaux.map((n) => n.points),
    [0, 0.25, 0.5],
  );
  assert.match(reponse.niveaux[0].libelle, /hors sujet/i);
});

test('les critères sans palier gardent au moins ce qu’il faut évaluer', () => {
  const plan = guideline.criteres.find((c) => /Pertinence du plan/i.test(c.libelle));
  assert.ok(plan);
  assert.equal(plan.niveaux.length, 0);
  assert.ok(plan.evaluer.length >= 3, 'les puces « évaluer » sont conservées');
  assert.ok(plan.evaluer.some((e) => /progression logique/i.test(e)));
});

test('aucun critère n’est vide', () => {
  for (const c of guideline.criteres) {
    assert.ok(c.libelle.trim() !== '', `critère sans libellé : ${c.code}`);
    assert.ok(c.max > 0, `critère sans points : ${c.libelle}`);
  }
});

test('un palier qui dépasse le maximum de son critère est remonté, pas avalé', () => {
  // Cas réel du classeur HGGSP V0 : « 2. Problématique » de l'étude critique
  // est sur 0,75 mais reprend les cinq paliers de la dissertation, qui vont
  // jusqu'à 1. La lecture ne corrige pas le fichier : elle le signale.
  assert.ok(
    guideline.remarques.some((r) => /Problématique/i.test(r) && /palier/i.test(r)),
    `remarques : ${JSON.stringify(guideline.remarques)}`,
  );
});

test('l’échelle globale et les règles de correction sont récupérées', () => {
  assert.ok(guideline.echelle.length >= 8);
  assert.ok(guideline.echelle.some((e) => e.plage === '19-20'));
  assert.ok(guideline.regles.length >= 1);
});

// --- 2. La page à cocher ---------------------------------------------

const csvCoche = lireFixture('guideline-hggsp-v0-coche.csv');
const copies = lireFeuilleACocher(lireCsv(csvCoche));

test('la feuille à cocher est reconnue comme telle', () => {
  assert.equal(estFeuilleACocher(lireCsv(csvCoche)), true);
  assert.equal(estFeuilleACocher(lireCsv('Élève,Note /20,Analyse\nEmma,14,Bien')), false);
});

test('un bloc par élève', () => {
  assert.deepEqual(
    copies.map((c) => c.eleve),
    ['Camille', 'Marc', 'Julien', 'Bertrand'],
  );
});

test('le palier le plus haut coché fait la note', () => {
  const camille = copies[0];
  const analyse = camille.criteres.find((c) => /Analyse du sujet/i.test(c.libelle));
  assert.deepEqual(analyse.cochees, [0, 0.25, 0.5, 0.75]);
  assert.equal(analyse.points, 0.75);
  assert.equal(camille.total, 0.75);
  assert.equal(camille.bareme, 2.5, 'les trois critères du bloc A pèsent 2,5');
});

test('un critère sans aucune case cochée est signalé, pas deviné', () => {
  const marc = copies[1];
  // Seul le premier critère est coché : les deux autres doivent rester vides
  // et remonter en avertissement, jamais compter 0 en silence.
  assert.equal(marc.total, 0.75);
  assert.equal(marc.avertissements.filter((a) => /Aucun niveau coché/i.test(a)).length, 2);
  assert.equal(marc.criteres.filter((c) => c.points === null).length, 2);
});

// --- 3. Petites briques ----------------------------------------------

test('les nombres à la française sont lus', () => {
  assert.equal(nombreFr('0,75'), 0.75);
  assert.equal(nombreFr('0.75'), 0.75);
  assert.equal(nombreFr('12'), 12);
  assert.equal(nombreFr('Niveau'), null);
  assert.equal(nombreFr(''), null);
});

// --- 4. Bout en bout : ce que reçoit l'espace prof ---------------------

const { analyserGrille } = await import('../src/lib/importGrille.ts');

const inscrits = [
  { id: 'i1', nom: 'Camille Dupont', email: 'camille@ex.fr', matiere: 'hggsp', created_at: '', salon_url: null },
  { id: 'i2', nom: 'Marc Nguyen', email: null, matiere: 'hggsp', created_at: '', salon_url: null },
  { id: 'i3', nom: 'Julien Barre', email: null, matiere: 'hggsp', created_at: '', salon_url: null },
  { id: 'i4', nom: 'Bertrand Sow', email: null, matiere: 'hggsp', created_at: '', salon_url: null },
];

test('la feuille à cocher ressort au format habituel', () => {
  const rapport = analyserGrille(csvCoche, inscrits);
  assert.equal(rapport.format, 'cochee');
  assert.equal(rapport.lignes.length, 4);
  assert.equal(rapport.colonnes.filter((c) => c.role === 'critere').length, 3);
  assert.equal(rapport.erreursFichier.length, 0);
});

test('un prénom seul retrouve l’élève inscrit sous son nom complet', () => {
  const rapport = analyserGrille(csvCoche, inscrits);
  assert.deepEqual(
    rapport.lignes.map((l) => l.eleveNom),
    ['Camille Dupont', 'Marc Nguyen', 'Julien Barre', 'Bertrand Sow'],
  );
  assert.equal(rapport.resume.nonReconnues, 0);
});

test('deux Camille : on ne tranche pas à la place du prof', () => {
  const ambigu = [...inscrits, { id: 'i5', nom: 'Camille Roy', email: null, matiere: 'hggsp', created_at: '', salon_url: null }];
  const rapport = analyserGrille(csvCoche, ambigu);
  const ligne = rapport.lignes[0];
  assert.equal(ligne.eleveId, null);
  assert.ok(ligne.problemes.some((p) => /Plusieurs élèves/i.test(p)));
});

test('la note est calculée et ramenée sur 20 quand le barème ne fait pas 20', () => {
  const rapport = analyserGrille(csvCoche, inscrits);
  const camille = rapport.lignes[0];
  // 0,75 point sur un barème de 2,5 -> 6 sur 20.
  assert.equal(camille.note, 6);
  assert.ok(camille.problemes.some((p) => /ramenée sur 20/i.test(p)));
  assert.match(Object.values(camille.criteres)[0], /^0,75 \/ 1/);
});

test('la grille à plat continue de passer par le même point d’entrée', () => {
  const plat = 'Élève,Email,Note /20,Analyse du texte\nCamille Dupont,camille@ex.fr,14,Solide\n';
  const rapport = analyserGrille(plat, inscrits);
  assert.equal(rapport.format, 'plat');
  assert.equal(rapport.lignes.length, 1);
  assert.equal(rapport.lignes[0].note, 14);
  assert.equal(rapport.lignes[0].eleveId, 'i1');
  assert.equal(rapport.lignes[0].prete, true);
});

// --- 5. Les classeurs réels des professeurs ---------------------------
//
// Fixtures : les exports des 6 classeurs par matière (Drive de Maël, août
// 2026). Ces contrôles disent ce que le CRM comprend de CHAQUE barème réel —
// si un classeur change de forme, ils tombent.

const lireGuidelineFixture = (nom) =>
  lireGuideline(lireCsv(readFileSync(join(ici, 'fixtures', 'guidelines', nom), 'utf8')));

const BAREMES_ATTENDUS = [
  ['francais-commentaire.csv', 14, 20],
  ['francais-dissertation.csv', 14, 20],
  ['philo.csv', 25, 40],
  ['ses.csv', 21, 40],
  ['hggsp-v0-2.csv', 20, 20],
  ['maths-specialite.csv', 6, 20],
  ['maths-1ere.csv', 6, 14],
];

for (const [fichier, nbCriteres, total] of BAREMES_ATTENDUS) {
  test(`barème lu tel quel : ${fichier}`, () => {
    const g = lireGuidelineFixture(fichier);
    assert.equal(g.criteres.length, nbCriteres, 'nombre de critères');
    assert.equal(g.total, total, 'somme des points');
    for (const c of g.criteres) {
      assert.ok(c.libelle.trim() !== '', `critère sans libellé (${c.code})`);
      assert.ok(c.max > 0, `critère sans points : ${c.libelle}`);
    }
  });

  test(`aucun code de critère en double : ${fichier}`, () => {
    // Le code d'un critère est son identifiant : il sert de clé aux cases
    // cochées par le prof et de clé primaire à l'import en base. Deux critères
    // qui le partagent, c'est un critère qui en écrase un autre — c'est arrivé
    // dans l'étude critique de l'HGGSP, dont le bloc F n'était pas reconnu
    // comme un bloc (RE_BLOC s'arrêtait à la lettre E) : le rang repartait à 1
    // pendant que la lettre restait sur C.
    const g = lireGuidelineFixture(fichier);
    const codes = g.criteres.map((c) => c.code);
    const doublons = codes.filter((code, i) => codes.indexOf(code) !== i);
    assert.deepEqual(doublons, [], `codes en double : ${[...new Set(doublons)].join(', ')}`);
  });
}

test('le plancher du barème est annoncé quand les paliers bas sont en fourchette', () => {
  // 15 critères sur 20 de l'HGGSP n'ont pas de palier à 0 : une copie cochée
  // partout au plus bas obtient 5 sur 20. Personne ne l'a décidé — c'est la
  // fourchette « 0–0,5 », lue au plus haut. Il faut que ça se voie.
  const g = lireGuidelineFixture('hggsp-v0-2.csv');
  const dit = g.remarques.find((r) => r.includes('aucun palier à 0'));
  assert.ok(dit, 'le plancher doit être remonté en remarque');
  assert.match(dit, /15 critère\(s\) sur 20/);
  assert.match(dit, /obtient 5 sur 20/);
});

test('un barème dont tous les critères peuvent valoir 0 ne dit rien', () => {
  const g = lireGuidelineFixture('maths-1ere.csv');
  const plancher = g.criteres
    .filter((c) => c.niveaux.length)
    .every((c) => Math.min(...c.niveaux.map((n) => n.points)) > 0);
  // Les maths de première sont dans le même cas : la remarque doit être là.
  assert.equal(plancher, true);
  assert.ok(g.remarques.some((r) => r.includes('aucun palier à 0')));
});

test('un bloc au-delà de la lettre E reste un bloc', () => {
  // L'étude critique de l'HGGSP va jusqu'au bloc F.
  const g = lireGuidelineFixture('hggsp-v0-2.csv');
  const f = g.criteres.filter((c) => c.code.startsWith('P2.F.'));
  assert.equal(f.length, 2, 'les deux critères du bloc F sont codés sous F');
  assert.equal(f[0].bloc, 'F. Expression et présentation');
});

test('les deux parties d’une épreuve gardent leur barème', () => {
  const hggsp = lireGuidelineFixture('hggsp-v0-2.csv');
  const somme = (p) =>
    Math.round(
      hggsp.criteres.filter((c) => c.partie === p).reduce((s, c) => s + c.max, 0) * 100,
    ) / 100;
  assert.equal(hggsp.parties.length, 2);
  assert.equal(somme(hggsp.parties[0].libelle), 10, 'dissertation /10');
  assert.equal(somme(hggsp.parties[1].libelle), 10, 'étude critique /10');
});

test('une partie annoncée sans critère détaillé est signalée', () => {
  // Maths de première : le QCM d'automatismes vaut 6 points mais n'a pas de
  // grille — ses points ne sont pas dans le total, et il faut le dire.
  const g = lireGuidelineFixture('maths-1ere.csv');
  assert.ok(g.remarques.some((r) => /QCM/i.test(r) && /6 points/.test(r)));
});

// --- 6. Élèves en colonnes -------------------------------------------

const { repererElevesColonnes, lireGuidelineCorrigee, estGuidelineACorriger } = await import(
  '../src/lib/guidelineSheet.ts'
);

const tableSes = lireCsv(
  readFileSync(join(ici, 'fixtures', 'guidelines', 'ses.csv'), 'utf8'),
);

test('les colonnes d’élèves sont repérées avec leur nom', () => {
  const colonnes = repererElevesColonnes(tableSes);
  assert.equal(colonnes.length, 3);
  assert.deepEqual(colonnes.map((c) => c.nom), ['timothé 1', 'timothé 2', 'timothé 3']);
  assert.equal(colonnes[0].colonneCommentaire, colonnes[0].colonneCase + 1);
  assert.equal(estGuidelineACorriger(tableSes), true);
});

test('une case à cocher au-dessus de l’en-tête n’est pas un nom d’élève', () => {
  // Vécu le 5 septembre 2026 : entre le nom de l'élève et la ligne
  // « niveau ? », le classeur portait une ligne de cases. Le lecteur remontait
  // jusqu'à la première cellule non vide et retenait « FALSE » comme nom —
  // la copie ne se rapprochait alors d'aucun inscrit.
  const table = [
    ['', '', '', 'Elèves', ''],
    ['', '', '', 'Camille Roux', ''],
    ['', '', '', 'FALSE', ''],
    ['Critère', 'Barème', 'Descripteur', 'niveau ?', 'commentaire (optionnel)'],
    ['A. Compréhension', '', '— /2', 'FALSE', ''],
    ['1. Sens global', '— /2', '', 'FALSE', ''],
    ['', '0', 'Contresens.', 'FALSE', ''],
    ['', '2', 'Sens compris.', 'TRUE', ''],
  ];
  const colonnes = repererElevesColonnes(table);
  assert.equal(colonnes.length, 1);
  assert.equal(colonnes[0].nom, 'Camille Roux');
});

test('les colonnes d’élèves ne sont pas lues comme du barème', () => {
  const { guideline } = lireGuidelineCorrigee(tableSes);
  assert.equal(guideline.total, 40);
  assert.ok(!guideline.criteres.some((c) => /false|true/i.test(c.libelle)));
});

test('classeur non coché : rien n’est deviné, tout est signalé', () => {
  const { copies } = lireGuidelineCorrigee(tableSes);
  assert.equal(copies.length, 3);
  for (const c of copies) {
    assert.equal(c.total, 0);
    assert.equal(c.bareme, 40);
    assert.equal(c.avertissements.length, c.criteres.length);
  }
});

test('cases cochées en colonne : le palier le plus haut fait la note', () => {
  // On coche à la main dans le CSV de SES : deux paliers du premier critère
  // pour le premier élève, un seul pour le deuxième.
  const table = tableSes.map((l) => [...l]);
  const { guideline } = lireGuidelineCorrigee(tableSes);
  const colonnes = repererElevesColonnes(tableSes);
  const premier = guideline.criteres[0];
  const paliers = premier.niveaux;

  table[paliers[0].ligne][colonnes[0].colonneCase] = 'TRUE';
  table[paliers[1].ligne][colonnes[0].colonneCase] = 'TRUE';
  table[paliers[1].ligne][colonnes[0].colonneCommentaire] = 'Sujet compris à moitié.';
  table[paliers[paliers.length - 1].ligne][colonnes[1].colonneCase] = 'TRUE';

  const { copies } = lireGuidelineCorrigee(table);
  const a = copies[0].criteres[0];
  const b = copies[1].criteres[0];
  assert.equal(a.points, paliers[1].points);
  assert.equal(a.commentaire, 'Sujet compris à moitié.');
  assert.equal(b.points, premier.max);
  assert.equal(copies[0].total, paliers[1].points);
  assert.equal(copies[2].total, 0);
});

test('épreuve au choix : la partie non traitée ne divise pas la note', () => {
  // SES : dissertation OU épreuve composée, les deux dans le même classeur.
  // Un élève qui traite la dissertation est noté sur 20, pas sur 40.
  const table = tableSes.map((l) => [...l]);
  const { guideline } = lireGuidelineCorrigee(tableSes);
  const colonnes = repererElevesColonnes(tableSes);
  const partie1 = guideline.parties[0].libelle;
  const criteresP1 = guideline.criteres.filter((c) => c.partie === partie1);

  for (const c of criteresP1) {
    const haut = c.niveaux[c.niveaux.length - 1];
    if (haut) table[haut.ligne][colonnes[0].colonneCase] = 'TRUE';
  }

  const { copies } = lireGuidelineCorrigee(table);
  const eleve = copies[0];
  // Le haut de chaque palier ne vaut pas toujours le maximum du critère (des
  // critères sont jugés à l'appréciation entre deux paliers) : on compare donc
  // à la somme des paliers cochés, pas au barème.
  const attendu =
    Math.round(
      criteresP1.reduce((s, c) => s + (c.niveaux[c.niveaux.length - 1]?.points ?? 0), 0) * 100,
    ) / 100;
  assert.equal(eleve.bareme, 20, 'barème ramené à la partie traitée');
  assert.equal(eleve.total, attendu, 'somme des paliers les plus hauts');
  assert.ok(eleve.avertissements.some((a) => /partie ignorée/i.test(a)));
  assert.ok(!eleve.criteres.some((c) => c.partie !== partie1));
});
