/**
 * Tests de la publication automatique du sujet aux élèves. HORS LIGNE.
 *
 *   npm run test:sujets
 *
 * Aucun accès à Supabase. Ce qui est testé, c'est le code réellement exécuté :
 * les fonctions de `src/lib/bacsBlancs.ts` qui décident QUAND un sujet s'ouvre
 * et à QUI, plus la présence des garde-fous dans `supabase/sql/44_...`.
 *
 * La règle la plus importante tient en une ligne : un corrigé ne s'ouvre
 * jamais aux élèves. Elle est écrite trois fois — contrainte SQL, filtre du
 * planificateur, code de lecture — et vérifiée ici les trois fois.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  heureTexteEnMinutes,
  normaliserMatiere,
  publicationPrevue,
  sujetAPublier,
} from '../src/lib/bacsBlancs';

let reussis = 0;
const tests: [string, () => void][] = [];
const test = (nom: string, fn: () => void) => tests.push([nom, fn]);

// --- 1. Lecture de l'heure texte -------------------------------------
//
// `heure_debut` est saisi à la main : '9h', '9 h 30', parfois '09:30'. Une
// heure illisible doit donner null — et surtout pas une valeur inventée, qui
// publierait un sujet à la mauvaise heure.

test('heure texte — formats acceptés', () => {
  assert.equal(heureTexteEnMinutes('9h'), 9 * 60);
  assert.equal(heureTexteEnMinutes('9 h 30'), 9 * 60 + 30);
  assert.equal(heureTexteEnMinutes('09:30'), 9 * 60 + 30);
  assert.equal(heureTexteEnMinutes('14h00'), 14 * 60);
  assert.equal(heureTexteEnMinutes('8h05'), 8 * 60 + 5);
  assert.equal(heureTexteEnMinutes(' 10H15 '), 10 * 60 + 15);
});

test('heure texte — illisible ou absurde donne null', () => {
  for (const brut of ['', null, undefined, 'matin', 'le matin à 9', '25h', '9h75', 'h30']) {
    assert.equal(heureTexteEnMinutes(brut as string), null, `« ${brut} » aurait dû être refusé`);
  }
});

// --- 2. Heure d'ouverture --------------------------------------------

const DEBUT = '2027-03-12T08:00:00.000Z'; // 9 h à Paris en hiver

test('ouverture — dix minutes avant par défaut', () => {
  const prevue = publicationPrevue({ minutes_avant: 10, publier_le: null }, DEBUT);
  assert.equal(prevue?.toISOString(), '2027-03-12T07:50:00.000Z');
});

test('ouverture — le délai est réglable', () => {
  const prevue = publicationPrevue({ minutes_avant: 45, publier_le: null }, DEBUT);
  assert.equal(prevue?.toISOString(), '2027-03-12T07:15:00.000Z');
});

test('ouverture — une heure imposée à la main prime sur le calcul', () => {
  const prevue = publicationPrevue(
    { minutes_avant: 10, publier_le: '2027-03-12T06:00:00.000Z' },
    DEBUT,
  );
  assert.equal(prevue?.toISOString(), '2027-03-12T06:00:00.000Z');
});

test('ouverture — sans heure de début, rien n’est deviné', () => {
  assert.equal(publicationPrevue({ minutes_avant: 10, publier_le: null }, null), null);
});

// --- 3. La décision de publier ---------------------------------------

const SUJET_PRET = {
  type: 'sujet',
  publication_active: true,
  visible_eleve: false,
  fichier_path: '2027/sujet.pdf',
  publier_le: null,
  minutes_avant: 10,
};

const A = (iso: string) => new Date(iso);

test('publication — pile à l’heure prévue', () => {
  assert.equal(sujetAPublier(SUJET_PRET, DEBUT, A('2027-03-12T07:50:00.000Z')), true);
});

test('publication — une minute trop tôt, on attend', () => {
  assert.equal(sujetAPublier(SUJET_PRET, DEBUT, A('2027-03-12T07:49:00.000Z')), false);
});

test('publication — en retard, on publie quand même', () => {
  assert.equal(sujetAPublier(SUJET_PRET, DEBUT, A('2027-03-12T07:58:00.000Z')), true);
});

test('publication — un corrigé ne s’ouvre JAMAIS aux élèves', () => {
  for (const type of ['corrige', 'bareme', 'annexe']) {
    assert.equal(
      sujetAPublier({ ...SUJET_PRET, type }, DEBUT, A('2027-03-12T09:00:00.000Z')),
      false,
      `un « ${type} » a été publié aux élèves`,
    );
  }
});

test('publication — rien ne part sans avoir été armé', () => {
  assert.equal(
    sujetAPublier({ ...SUJET_PRET, publication_active: false }, DEBUT, A('2027-03-12T09:00:00.000Z')),
    false,
  );
});

test('publication — un sujet déjà ouvert n’est pas rouvert', () => {
  assert.equal(
    sujetAPublier({ ...SUJET_PRET, visible_eleve: true }, DEBUT, A('2027-03-12T09:00:00.000Z')),
    false,
  );
});

test('publication — pas de fichier, pas de publication', () => {
  assert.equal(
    sujetAPublier({ ...SUJET_PRET, fichier_path: null }, DEBUT, A('2027-03-12T09:00:00.000Z')),
    false,
  );
});

test('publication — session sans heure de début : jamais', () => {
  assert.equal(sujetAPublier(SUJET_PRET, null, A('2027-03-12T09:00:00.000Z')), false);
  assert.equal(sujetAPublier(SUJET_PRET, undefined, A('2030-01-01T00:00:00.000Z')), false);
});

// --- 4. Rattachement des inscriptions anciennes ----------------------

test('matières — accents, casse et tirets ne séparent pas', () => {
  assert.equal(normaliserMatiere('Histoire-Géo'), normaliserMatiere('histoire geo'));
  assert.equal(normaliserMatiere('Physique-Chimie'), normaliserMatiere('PHYSIQUE CHIMIE'));
  assert.notEqual(normaliserMatiere('Maths'), normaliserMatiere('Philosophie'));
});

// --- 5. Les garde-fous sont bien dans le SQL --------------------------
//
// Le code TypeScript peut être irréprochable : si quelqu'un ouvre un corrigé
// directement en base, seule la contrainte SQL l'arrête. On vérifie qu'elle
// est toujours là — ces trois lignes ont déjà failli sauter à la relecture.

const SQL = readFileSync(join(process.cwd(), 'supabase/sql/44_sujets_eleves.sql'), 'utf8');

test('SQL — contrainte « seul un sujet s’ouvre aux élèves »', () => {
  assert.match(SQL, /check \(visible_eleve = false or type = 'sujet'\)/);
});

test('SQL — le planificateur filtre lui aussi sur le type', () => {
  assert.match(SQL, /where s\.type = 'sujet'/);
});

test('SQL — la tâche tourne chaque minute, pas toutes les cinq', () => {
  assert.match(SQL, /'sujets-publication',\s*\n?\s*'\* \* \* \* \*'/);
});

test('SQL — l’heure de début est calculée en heure de Paris', () => {
  assert.match(SQL, /at time zone 'Europe\/Paris'/);
});

// --- Le sujet de l'épreuve EST le sujet de correction ------------------
//
// Règle posée par Cindy le 5 septembre 2026 : la copie se corrige sur le sujet
// déposé pour le bac blanc, jamais sur un autre. Elle tient à trois endroits —
// le rattachement en base (`session_sujets.subject_card_id`), le menu qui le
// pose côté administration, et le refus au dépôt d'une copie. On vérifie les
// trois : sans le dernier, la règle ne serait qu'un confort d'écran.

const DEPOSER = readFileSync(
  join(process.cwd(), 'src/app/api/pipeline/deposer/route.ts'),
  'utf8',
);
const ADMIN_SUJETS = readFileSync(
  join(process.cwd(), 'src/app/direction/bacs-blancs/TableauBacsBlancs.tsx'),
  'utf8',
);
const LIB = readFileSync(join(process.cwd(), 'src/lib/bacsBlancs.ts'), 'utf8');

test('le dépôt d’une copie refuse un autre sujet que celui du bac blanc', () => {
  assert.match(DEPOSER, /sujetDeCorrection/);
  assert.match(DEPOSER, /status:\s*409/);
});

test('l’administration propose de relier le sujet à sa fiche de correction', () => {
  assert.match(ADMIN_SUJETS, /Sujet de correction/);
  assert.match(ADMIN_SUJETS, /subject_card_id/);
});

test('un bac blanc à deux sujets rattachés ne tranche pas tout seul', () => {
  // `sujetDeCorrection` ne renvoie une fiche que si UNE seule fait foi :
  // en choisir une au hasard corrigerait la moitié des copies sur le mauvais
  // énoncé, sans que rien ne le signale.
  assert.match(LIB, /fiches\.length === 1 \? fiches\[0\] : null/);
});

// --- Les deux bases n'écrivent pas la matière pareil -------------------
//
// Vécu le 5 septembre 2026 : le CRM range « Français », le pipeline
// « francais ». La route qui génère les dossiers comparait les deux tels
// quels — aucune copie ne se rapprochait jamais, tous les élèves
// ressortaient « sans copie », et AUCUN dossier n'était produit. Le bug ne
// se voyait pas : la route répondait `success: true`.

const GENERER = readFileSync(
  join(process.cwd(), 'src/app/api/prof/sessions/[id]/generer/route.ts'),
  'utf8',
);

test('la génération des dossiers cherche la copie sous les deux écritures de la matière', () => {
  assert.match(GENERER, /cleMatiere\(session\.matiere\)/);
  assert.match(GENERER, /\.in\('matiere', matieres\)/);
  assert.doesNotMatch(GENERER, /\.eq\('matiere', session\.matiere\)/);
});

// --- Le professeur voit le dossier qu'il a fait produire ---------------
//
// Deux circuits coexistent : la table `copies` du CRM (ancien dépôt manuel) et
// le pipeline de correction. La console ne lisait que la première — une copie
// corrigée par le pipeline restait « Copie attendue » indéfiniment, et le
// dossier n'était accessible par aucun écran.

const ESPACE_PROF = readFileSync(join(process.cwd(), 'src/lib/espaceProf.ts'), 'utf8');
const CONSOLE_PROF = readFileSync(join(process.cwd(), 'src/components/SessionProf.tsx'), 'utf8');

test('la console lit aussi les copies du pipeline, sous les deux écritures de la matière', () => {
  assert.match(ESPACE_PROF, /chargerCorrectionsPipeline/);
  assert.match(ESPACE_PROF, /cleMatiere\(matiereSession\)/);
  assert.match(ESPACE_PROF, /\.in\('matiere', matieres\)/);
});

test('un pipeline en panne ne casse pas la console du jour J', () => {
  // La console est l'écran du professeur pendant l'épreuve : une correction
  // automatique indisponible ne doit jamais l'empêcher de s'afficher.
  assert.match(ESPACE_PROF, /if \(pipelineManquant\(\)\.length\) return par;/);
  assert.match(ESPACE_PROF, /\} catch \{/);
});

test('le dossier de l’élève a un bouton dans la console', () => {
  assert.match(CONSOLE_PROF, /Son dossier/);
  assert.match(CONSOLE_PROF, /e\.correction\?\.dossier_url/);
});

test('les compteurs de l’en-tête comptent les deux circuits', () => {
  assert.match(CONSOLE_PROF, /e\.copie \|\| e\.correction/);
});

// --- Exécution --------------------------------------------------------

console.log('\n🧪 Publication du sujet aux élèves — tests hors ligne\n');
for (const [nom, fn] of tests) {
  try {
    fn();
    reussis++;
    console.log(`  ✅ ${nom}`);
  } catch (err) {
    console.error(`  ❌ ${nom}`);
    console.error(`     ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
console.log(`\n${reussis}/${tests.length} tests réussis\n`);
