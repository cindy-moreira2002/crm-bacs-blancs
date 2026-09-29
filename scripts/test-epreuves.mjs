/**
 * Les échelles de notation — contrôles hors ligne.
 *
 * Une copie de SVT ou de physique-chimie se note SUR 15, pas sur 20 : les cinq
 * points qui manquent sont ceux de l'ECE, qui se passe en salle de TP devant un
 * examinateur. Ces tests existent pour qu'on ne « répare » jamais ce /15 en
 * croyant corriger un bug.
 *
 *   npm run test:epreuves
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { COMPOSITIONS, ECHELLES, compositionDe, partieDe, expliquerEchelle } = await import(
  '../src/lib/epreuves.ts'
);

test('SVT : l’écrit vaut 15 points, 6 + 7 + 2 (session 2027)', () => {
  const ecrit = COMPOSITIONS.svt[0];
  assert.equal(ecrit.total, 15);
  assert.deepEqual(
    ecrit.parties.map((p) => p.points),
    [6, 7, 2],
  );
  assert.equal(
    ecrit.parties.reduce((s, p) => s + p.points, 0),
    ecrit.total,
  );
  assert.match(ecrit.note, /ECE/);
});

test('SVT : un exercice rendu seul s’explique sur 6 ou sur 7', () => {
  assert.equal(partieDe('svt', 'svt_exercice_1').points, 6);
  assert.equal(partieDe('svt', 'svt_exercice_2').points, 7);
  assert.match(expliquerEchelle('svt', 'svt_exercice_1'), /6 points/);
  assert.match(expliquerEchelle('svt', 'svt_exercice_1'), /15 points/);
});

test('physique-chimie : l’écrit se note sur 20 depuis la session 2027', () => {
  // Note de service du 11-9-2026 (NOR MENE2622644N) : l'écrit est noté sur 20,
  // l'ECE sur 20, et la note finale vaut 0,8 × écrit + 0,2 × ECE. Une copie se
  // note donc sur 20 comme les autres — il n'y a plus d'échelle à expliquer, et
  // ce test existe pour qu'on ne remette pas le /15 de l'ancien texte.
  assert.equal(compositionDe('physique-chimie', 'pc_probleme'), null);
  assert.equal(ECHELLES['physique-chimie'], undefined);
  assert.equal(expliquerEchelle('physique-chimie', 'pc_probleme'), null);
});

test('SVT : l’épreuve entière, sans partie reconnue, dit aussi le /15', () => {
  assert.match(expliquerEchelle('svt', 'full_exam'), /notée sur 15/);
});

test('les matières notées sur 20 n’affichent aucune explication', () => {
  assert.equal(expliquerEchelle('francais', 'dissertation'), null);
  assert.equal(expliquerEchelle('philosophie', 'philo_dissertation'), null);
  assert.equal(ECHELLES.francais, undefined);
});

test('les échelles déjà en place ne bougent pas', () => {
  assert.match(expliquerEchelle('ses', 'epreuve_composee_partie_1'), /sur 4/);
  assert.match(expliquerEchelle('hggsp', 'hggsp_dissertation'), /10 points/);
  assert.match(expliquerEchelle('anglais', 'llcer_traduction'), /sur 4/);
});
