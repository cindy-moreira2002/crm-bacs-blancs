/**
 * NON-RÉGRESSION DU BACCALAURÉAT après l'ajout du brevet. HORS LIGNE.
 *
 *   npm run test:brevet:nonregression
 *
 * L'ajout de deux matières de DNB ne doit RIEN changer au baccalauréat. Ces
 * tests le vérifient sur trois plans :
 *   1. le code — les moteurs du bac fonctionnent à l'identique et n'importent
 *      aucun fichier du brevet ;
 *   2. l'étanchéité — aucune matière, aucune compétence, aucun code d'erreur
 *      ne traverse la frontière, dans un sens comme dans l'autre ;
 *   3. les migrations — la contrainte de moteur reste ÉLARGIE (jamais
 *      rétrécie), l'aiguillage conserve ses deux branches d'origine, et le
 *      fichier 42 ne supprime aucune table ni aucune ligne.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  calculerNoteBrute,
  normaliserQuestions,
  peutOuvrirCorrections,
  profilCompetences,
  verifierBareme,
  NIVEAUX_ETALONS,
  type CompetenceReferentiel,
  type QuestionBareme,
} from '../src/lib/baremeNoyau';
import { LABELS_MATIERES } from '../src/lib/matieres';
import { MATIERES_BREVET, LABELS_MATIERES_BREVET } from '../src/lib/matieresBrevet';
import { estMatiereBrevet, verifierAppariementMatiere } from '../src/lib/brevetNoyau';
import { COMPETENCES, TAXONOMIE_FRANCAIS, TAXONOMIE_MATHS } from './brevet/referentiels.mjs';

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

const RACINE = join(new URL('.', import.meta.url).pathname, '..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

/* ==================================================================== */

console.log('\n═══ NON-RÉGRESSION DU BACCALAURÉAT ═══');

titre('1. Le moteur « barème par sujet » du bac est intact');

const BAREME_BAC: QuestionBareme[] = [
  {
    question_key: 'ex1_q1',
    numero: '1',
    libelle: 'Dériver la fonction',
    max_points: 10,
    competences: ['calculer'],
    codes_erreurs: [],
    depend_de: [],
    methodes_alternatives: [{ libelle: 'forme développée' }],
    reponse_attendue: 'f’(x) = 2x',
    etapes: [{ libelle: 'formule du produit' }],
  },
  {
    question_key: 'ex1_q2',
    numero: '2',
    libelle: 'Étudier les variations',
    max_points: 10,
    competences: ['raisonner'],
    codes_erreurs: [],
    depend_de: ['ex1_q1'],
    methodes_alternatives: [],
    reponse_attendue: 'croissante sur R+',
    etapes: [{ libelle: 'signe de la dérivée' }],
  },
];

const REFERENTIEL_BAC: CompetenceReferentiel[] = [
  { code: 'calculer', libelle: 'Calculer', toujours_mobilisee: true },
  { code: 'raisonner', libelle: 'Raisonner', toujours_mobilisee: true },
  { code: 'algorithmique', libelle: 'Algorithmique', toujours_mobilisee: false },
];

test('1.1', 'la note du bac reste la somme mécanique des questions', () => {
  const { questions } = normaliserQuestions(BAREME_BAC, [
    { question_key: 'ex1_q1', score: 7.5 },
    { question_key: 'ex1_q2', score: 4 },
  ]);
  assert.equal(calculerNoteBrute(questions), 11.5);
});

test('1.2', 'les contrôles du barème du bac exigent toujours le total annoncé', () => {
  const r = verifierBareme({
    questions: BAREME_BAC.map((q) => ({ ...q, paliers: [{ points: 5, cumulable: true }] })),
    maxScore: 20,
    competencesConnues: ['calculer', 'raisonner'],
  });
  assert.equal(r.ok, true);
  assert.equal(r.total, 20);

  const faux = verifierBareme({
    questions: BAREME_BAC.map((q) => ({ ...q, paliers: [{ points: 5, cumulable: true }] })),
    maxScore: 18,
    competencesConnues: ['calculer', 'raisonner'],
  });
  assert.equal(faux.ok, false);
});

test('1.3', 'une compétence non mobilisée reste non_applicable, jamais zéro', () => {
  const { questions } = normaliserQuestions(BAREME_BAC, [
    { question_key: 'ex1_q1', score: 10, preuves: [{ citation: 'x' }] },
    { question_key: 'ex1_q2', score: 10, preuves: [{ citation: 'y' }] },
  ]);
  const profil = profilCompetences(REFERENTIEL_BAC, BAREME_BAC, questions);
  assert.equal(profil.algorithmique, 'non_applicable');
  assert.equal(profil.calculer, 'very_satisfactory');
});

test('1.4', 'l’ouverture des corrections du bac exige toujours un barème verrouillé', () => {
  assert.equal(
    peutOuvrirCorrections({ statutExamen: 'validated', statutBareme: 'draft', controlesOk: true }).ok,
    false,
  );
  assert.equal(
    peutOuvrirCorrections({ statutExamen: 'validated', statutBareme: 'locked', controlesOk: true }).ok,
    true,
  );
});

test('1.5', 'les sept niveaux d’étalons du bac sont inchangés', () => {
  assert.equal(NIVEAUX_ETALONS.length, 7);
  assert.ok(NIVEAUX_ETALONS.some((n) => n.code === 'presque_blanche'));
});

titre('2. Étanchéité des matières');

test('2.1', 'aucune matière de brevet dans les libellés du bac', () => {
  for (const m of MATIERES_BREVET) {
    assert.ok(!(m in LABELS_MATIERES), `« ${m} » ne doit pas être une matière du bac`);
  }
});

test('2.2', 'aucune matière du bac dans les libellés du brevet', () => {
  for (const m of Object.keys(LABELS_MATIERES)) {
    assert.ok(
      !(m in LABELS_MATIERES_BREVET),
      `« ${m} » ne doit pas être une matière du brevet`,
    );
  }
});

test('2.3', 'estMatiereBrevet ne reconnaît que les deux matières du DNB', () => {
  assert.equal(estMatiereBrevet('brevet_francais'), true);
  assert.equal(estMatiereBrevet('brevet_mathematiques'), true);
  assert.equal(estMatiereBrevet('francais'), false);
  assert.equal(estMatiereBrevet('maths'), false);
  assert.equal(estMatiereBrevet(null), false);
});

test('2.4', 'un examen du bac ne peut pas être corrigé par un moteur du brevet', () => {
  for (const matiere of MATIERES_BREVET) {
    for (const bac of Object.keys(LABELS_MATIERES)) {
      const r = verifierAppariementMatiere({
        matiereAttendue: matiere,
        matiereExamen: bac,
        niveauExamen: 'BAC',
        moteurCorrection: matiere,
      });
      assert.equal(r.ok, false, `${matiere} ne doit pas accepter ${bac}`);
    }
  }
});

test('2.5', 'les référentiels du brevet ne portent que des matières de brevet', () => {
  // Le module de référentiels est en JavaScript : ses matières sont des
  // chaînes libres. C'est précisément ce qu'on vérifie ici.
  const attendues: readonly string[] = MATIERES_BREVET;
  for (const c of COMPETENCES) {
    assert.ok(attendues.includes(c.matiere), `compétence hors brevet : ${c.matiere}`);
  }
  for (const t of [...TAXONOMIE_FRANCAIS, ...TAXONOMIE_MATHS]) {
    assert.ok(attendues.includes(t.matiere), `code hors brevet : ${t.matiere}`);
  }
});

test('2.6', 'aucun code d’erreur commun entre les deux matières du brevet', () => {
  const fr = new Set(TAXONOMIE_FRANCAIS.map((t: { code: string }) => t.code));
  const communs = TAXONOMIE_MATHS.filter((t: { code: string }) => fr.has(t.code));
  assert.equal(communs.length, 0, `codes partagés : ${communs.map((c: { code: string }) => c.code).join(', ')}`);
});

titre('3. Les noyaux ne se contaminent pas');

test('3.1', 'le noyau du bac n’importe aucun fichier du brevet', () => {
  const src = lire('supabase/functions/_shared/bareme-noyau.ts');
  assert.ok(!src.includes('brevet'), 'bareme-noyau.ts ne doit rien savoir du brevet');
});

test('3.2', 'le noyau du brevet n’importe pas celui du bac', () => {
  for (const f of ['brevet-noyau.ts', 'brevet-francais-noyau.ts', 'brevet-maths-noyau.ts']) {
    const src = lire(`supabase/functions/_shared/${f}`);
    assert.ok(!/from ['"].*bareme-noyau/.test(src), `${f} ne doit pas importer bareme-noyau`);
  }
});

test('3.3', 'le noyau du français ne connaît pas les mathématiques, et l’inverse', () => {
  const fr = lire('supabase/functions/_shared/brevet-francais-noyau.ts');
  const ma = lire('supabase/functions/_shared/brevet-maths-noyau.ts');
  assert.ok(!/from ['"].*brevet-maths/.test(fr));
  assert.ok(!/from ['"].*brevet-francais/.test(ma));
});

test('3.4', 'les Edge Functions du bac n’ont pas été touchées par le brevet', () => {
  for (const f of ['correct-french-copy', 'correct-copy-bareme', 'correct-copy-redigee']) {
    const src = lire(`supabase/functions/${f}/index.ts`);
    assert.ok(!src.includes('brevet'), `${f} ne doit rien savoir du brevet`);
  }
});

titre('4. Migrations : additives, jamais destructrices');

const SQL42 = lire('supabase/sql/42_brevet_socle.sql');

test('4.1', 'AUCUN moteur autorisé par une migration antérieure n’est perdu', () => {
  // Le bug réel : le SQL 33 autorisait deux moteurs, le SQL 40 en a ajouté un
  // troisième, et une liste réécrite à la main dans le 42 les invalidait.
  // On relit donc les migrations et on exige que le 42 les cite toutes.
  const anterieures = readdirSync(join(RACINE, 'supabase/sql'))
    .filter((f) => /^(3[0-9]|4[01])_/.test(f))
    .map((f) => lire(`supabase/sql/${f}`))
    .join('\n');

  const moteurs = new Set<string>();
  for (const m of anterieures.matchAll(/moteur in \(([^)]*)\)/g)) {
    for (const v of m[1].matchAll(/'([a-z_]+)'/g)) moteurs.add(v[1]);
  }
  assert.ok(moteurs.size >= 3, `attendu au moins 3 moteurs antérieurs, trouvé ${[...moteurs]}`);

  const bloc = SQL42.split('BLOC 12')[0];
  for (const m of moteurs) {
    assert.ok(bloc.includes(`'${m}'`), `le moteur « ${m} » disparaîtrait de la contrainte`);
  }
  assert.ok(bloc.includes("'brevet_francais'"));
  assert.ok(bloc.includes("'brevet_mathematiques'"));
});

test('4.1 bis', 'la contrainte est reconstruite depuis la base, pas depuis une liste figée', () => {
  const bloc = SQL42.split('BLOC 12')[0];
  assert.ok(
    /select coalesce\(array_agg\(distinct moteur\)/.test(bloc),
    'le 42 doit prendre l’union des valeurs déjà présentes en base',
  );
});

test('4.1 ter', 'la contrainte de COHÉRENCE apprend les deux moteurs du brevet', () => {
  // Sans cela, aucune copie de brevet ne pourrait être insérée : elle porte
  // un exam_id mais ni subject_id ni rubric_id.
  const bloc = SQL42.split('BLOC 12')[0];
  assert.ok(bloc.includes('corrections_coherence_moteur'), 'la contrainte doit être reprise');
  assert.ok(
    /moteur in \('brevet_francais', 'brevet_mathematiques'\) and exam_id is not null/.test(bloc),
    'la branche du brevet manque',
  );
  // Et les trois branches du bac doivent survivre, mot pour mot.
  for (const branche of [
    "moteur = 'grille_generique' and subject_id is not null and rubric_id is not null",
    "moteur = 'bareme_sujet' and exam_id is not null",
    "moteur = 'criteres_rediges' and subject_id is not null and rubric_id is not null",
  ]) {
    assert.ok(bloc.includes(branche), `branche du bac perdue : ${branche}`);
  }
});

test('4.2', 'aucun DROP TABLE ni DELETE hors bloc de retour arrière commenté', () => {
  const actif = SQL42.split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .toLowerCase();
  assert.ok(!actif.includes('drop table'), 'aucune table ne doit être supprimée');
  assert.ok(!/\bdelete\s+from\b/.test(actif), 'aucune ligne ne doit être effacée');
  assert.ok(!actif.includes('truncate'));
  assert.ok(!/\bdrop\s+column\b/.test(actif), 'aucune colonne ne doit être supprimée');
});

test('4.3', 'l’aiguillage conserve TOUTES les branches du bac', () => {
  // Le SQL 40 avait ajouté 'criteres_rediges' → correct-copy-redigee.
  // Réécrire l'aiguillage sans cette branche enverrait silencieusement les
  // copies d'HGGSP v2 vers le mauvais moteur.
  for (const attendu of [
    "when v_moteur = 'bareme_sujet'",
    "'correct-copy-bareme'",
    "when v_moteur = 'criteres_rediges'",
    "'correct-copy-redigee'",
    "else 'correct-french-copy'",
  ]) {
    assert.ok(SQL42.includes(attendu), `branche du bac perdue dans l'aiguillage : ${attendu}`);
  }
  assert.ok(SQL42.includes("'correct-brevet-francais'"));
  assert.ok(SQL42.includes("'correct-brevet-maths'"));
});

test('4.3 bis', 'aucune Edge Function du bac n’est oubliée par l’aiguillage', () => {
  // Toutes les fonctions citées par les migrations antérieures doivent
  // encore l'être : c'est ce qui rend la réécriture sûre.
  const anterieures = readdirSync(join(RACINE, 'supabase/sql'))
    .filter((f) => /^(3[0-9]|4[01])_/.test(f))
    .map((f) => lire(`supabase/sql/${f}`))
    .join('\n');
  const fonctions = new Set(
    [...anterieures.matchAll(/'(correct-[a-z-]+)'/g)].map((m) => m[1]),
  );
  assert.ok(fonctions.size >= 3, `attendu au moins 3 fonctions, trouvé ${[...fonctions]}`);
  for (const f of fonctions) {
    assert.ok(SQL42.includes(`'${f}'`), `la fonction « ${f} » disparaîtrait de l'aiguillage`);
  }
});

test('4.4', 'pipeline_diagnostic reprend la version du SQL 35, pas celle du SQL 33', () => {
  // Le SQL 35 avait assoupli la règle pour les copies ÉTALONS : elles se
  // corrigent AVANT verrouillage, sinon la calibration est impossible.
  // Repartir du SQL 33 aurait silencieusement cassé la calibration du bac.
  assert.ok(SQL42.includes("'moteur', 'grille_generique'"));
  assert.ok(SQL42.includes("'moteur', 'bareme_sujet'"));
  assert.ok(
    SQL42.includes("then v_version.statut in ('draft', 'calibrating', 'ready_for_validation', 'validated', 'locked')"),
    'la règle « un étalon se corrige avant verrouillage » a disparu',
  );
  assert.ok(
    SQL42.includes("'bareme_controles_ok', coalesce((v_version.controles ->> 'ok')::boolean, false)"),
    'le diagnostic ne remonte plus l’état des contrôles du barème',
  );
});

test('4.4 bis', 'les branches du bac sont reprises mot pour mot du SQL 35', () => {
  const sql35 = lire('supabase/sql/35_bareme_correctifs.sql');
  const debut = sql35.indexOf('  -- --- Ancien moteur : grille generique (inchange) --------------------');
  const brancheGenerique = sql35.slice(debut, sql35.indexOf('end;', debut));
  assert.ok(brancheGenerique.length > 400, 'branche du SQL 35 introuvable');
  assert.ok(
    SQL42.includes(brancheGenerique),
    'la branche « grille générique » du SQL 35 n’est pas reprise à l’identique',
  );
});

test('4.5', 'les colonnes ajoutées le sont toutes en IF NOT EXISTS', () => {
  const ajouts = SQL42.match(/add column [^\n,;]*/g) ?? [];
  assert.ok(ajouts.length > 0);
  for (const a of ajouts) {
    assert.ok(a.includes('if not exists'), `ajout non idempotent : ${a}`);
  }
});

test('4.6', 'le SQL du brevet est intégralement en ASCII', () => {
  for (const f of ['42_brevet_socle.sql', '43_brevet_referentiels.sql']) {
    const src = lire(`supabase/sql/${f}`);
    const mauvais = src.match(/[^\x00-\x7F]/g);
    assert.equal(mauvais, null, `${f} contient des caractères non-ASCII : ${mauvais?.slice(0, 5)}`);
  }
});

test('4.7', 'les migrations déjà jouées n’ont pas été modifiées', () => {
  // Elles doivent conserver leur en-tête et leur numérotation : le brevet
  // ajoute 42 et 43, il ne réécrit pas 33 à 41.
  const fichiers = readdirSync(join(RACINE, 'supabase/sql')).filter((f) => /^\d\d_/.test(f));
  const numeros = fichiers.map((f) => Number(f.slice(0, 2)));
  assert.ok(numeros.includes(42) && numeros.includes(43), 'les deux nouvelles migrations existent');
  const trentetrois = lire('supabase/sql/33_bareme_par_sujet.sql');
  assert.ok(
    !trentetrois.includes('brevet'),
    '33_bareme_par_sujet.sql ne doit pas avoir été retouché',
  );
});

titre('5. Routes et écrans : rien du bac n’a bougé');

test('5.1', 'les routes du bac existent toujours', () => {
  for (const f of [
    'src/app/api/admin/bareme/route.ts',
    'src/app/api/admin/bareme/[examId]/route.ts',
    'src/app/api/admin/bareme/[examId]/bareme/route.ts',
    'src/app/admin/bareme/page.tsx',
  ]) {
    assert.ok(lire(f).length > 0, `${f} manquant`);
  }
});

test('5.2', 'les routes du bac ne connaissent pas le brevet', () => {
  for (const f of [
    'src/app/api/admin/bareme/route.ts',
    'src/app/api/admin/bareme/[examId]/route.ts',
    'src/lib/bareme.ts',
  ]) {
    assert.ok(!lire(f).includes('brevet'), `${f} ne doit rien savoir du brevet`);
  }
});

test('5.3', 'chaque matière du brevet a ses propres routes, séparées', () => {
  for (const m of ['francais', 'mathematiques']) {
    for (const f of [
      `src/app/api/admin/brevet/${m}/route.ts`,
      `src/app/api/admin/brevet/${m}/[examId]/route.ts`,
      `src/app/api/admin/brevet/${m}/[examId]/bareme/route.ts`,
      `src/app/api/admin/brevet/${m}/copies/route.ts`,
      `src/app/api/admin/brevet/${m}/copies/[correctionId]/route.ts`,
      `src/app/api/admin/brevet/${m}/statistiques/route.ts`,
      `src/app/api/admin/brevet/${m}/calibration/route.ts`,
    ]) {
      assert.ok(lire(f).length > 0, `${f} manquant`);
    }
  }
});

test('5.4', 'la route d’une matière ne cite jamais l’identifiant de l’autre', () => {
  const fr = lire('src/app/api/admin/brevet/francais/route.ts');
  const ma = lire('src/app/api/admin/brevet/mathematiques/route.ts');
  assert.ok(!fr.includes("'brevet_mathematiques'"));
  assert.ok(!ma.includes("'brevet_francais'"));
});

/* --- Bilan ------------------------------------------------------------ */

console.log(`\n${reussis} test(s) réussi(s), ${echoues} échec(s).`);
if (echoues) {
  console.log('\nÉchecs :');
  for (const e of echecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}
