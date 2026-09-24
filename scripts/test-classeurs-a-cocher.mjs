/**
 * Classeurs V1 « à cocher » : français, philo, maths spé, SES, HLP, LLCER anglais.
 *
 * Les fixtures sont l'export CSV des classeurs produits par
 * `scripts/faire-classeurs-a-cocher.py`, tels que Google Sheets les rend
 * (cases à cocher = TRUE / FALSE). Chaque test coche des cases dans une
 * copie de la table, puis la fait lire par le CRM.
 *
 *   node --import tsx --test scripts/test-classeurs-a-cocher.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
const { lireCsv } = await import('../src/lib/importGrille.ts');
const { lireGuidelineCorrigee, repererElevesColonnes } = await import('../src/lib/guidelineSheet.ts');

const table = (nom) => lireCsv(readFileSync(join(ici, 'fixtures', 'guidelines', nom), 'utf8'));

const CLASSEURS = [
  { nom: 'francais-v1-a-cocher.csv', criteres: 28, parties: [/COMMENTAIRE/, /DISSERTATION/] },
  { nom: 'philo-v1-a-cocher.csv', criteres: 25, parties: [/DISSERTATION/, /EXPLICATION/] },
  { nom: 'maths-specialite-v1-a-cocher.csv', criteres: 6, parties: [/COMPÉTENCES/] },
  { nom: 'ses-v1-a-cocher.csv', criteres: 21, parties: [/DISSERTATION/, /COMPOSÉE/] },
  // HLP et LLCER : l'élève traite les deux parties, qui font 20 ensemble.
  { nom: 'hlp-v1-a-cocher.csv', criteres: 15, parties: [/INTERPRÉTATION/, /ESSAI/], points: [10, 10] },
  { nom: 'anglais-llcer-v1-a-cocher.csv', criteres: 15, parties: [/SYNTHÈSE/, /TRADUCTION/], points: [16, 4] },
];

/** Coche, pour l'élève `k`, le palier choisi par `choisir` dans chaque critère de `partie`. */
function cocher(t, k, choisir, partie = /./) {
  const copie = t.map((l) => [...l]);
  const colonne = repererElevesColonnes(copie)[k].colonneCase;
  const { guideline } = lireGuidelineCorrigee(copie);
  for (const c of guideline.criteres) {
    if (!partie.test(c.partie)) continue;
    const n = choisir(c.niveaux);
    copie[n.ligne][colonne] = 'TRUE';
  }
  return copie;
}
const haut = (niveaux) => niveaux.reduce((a, b) => (b.points > a.points ? b : a));
const bas = (niveaux) => niveaux.reduce((a, b) => (b.points < a.points ? b : a));

for (const cl of CLASSEURS) {
  const t = table(cl.nom);

  test(`${cl.nom} : barème lu en entier, parties sur 20`, () => {
    const { guideline } = lireGuidelineCorrigee(t);
    assert.equal(guideline.criteres.length, cl.criteres);
    assert.equal(guideline.parties.length, cl.parties.length);
    cl.parties.forEach((re, i) => {
      assert.match(guideline.parties[i].libelle, re);
      const somme = guideline.criteres
        .filter((c) => c.partie === guideline.parties[i].libelle)
        .reduce((s, c) => s + c.max, 0);
      assert.equal(Math.round(somme * 100) / 100, cl.points?.[i] ?? 20);
    });
    const codes = guideline.criteres.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length, 'codes uniques');
  });

  test(`${cl.nom} : 12 colonnes d'élèves, un vrai palier 0 partout`, () => {
    assert.equal(repererElevesColonnes(t).length, 12);
    const { guideline } = lireGuidelineCorrigee(t);
    for (const c of guideline.criteres) {
      assert.ok(c.niveaux.some((n) => n.points === 0), `${c.libelle} a un palier 0`);
      assert.equal(haut(c.niveaux).points, c.max, `${c.libelle} atteint son maximum`);
    }
  });

  test(`${cl.nom} : colonnes « Élève N » vides ignorées`, () => {
    assert.equal(lireGuidelineCorrigee(t).copies.length, 0);
    const copies = lireGuidelineCorrigee(cocher(t, 2, haut)).copies;
    assert.equal(copies.length, 1);
    assert.equal(copies[0].eleve, 'Élève 3');
  });

  test(`${cl.nom} : tout en haut = 20, tout en bas = 0, sur la partie traitée`, () => {
    // Épreuve au choix : on ne coche que la première partie. Sinon, tout.
    const premiere = cl.points ? /./ : cl.parties[0];
    const [h] = lireGuidelineCorrigee(cocher(t, 0, haut, premiere)).copies;
    assert.equal(h.total, 20);
    assert.equal(h.bareme, 20, 'la partie non traitée est ignorée');
    const [b] = lireGuidelineCorrigee(cocher(t, 0, bas, premiere)).copies;
    assert.equal(b.total, 0);
    assert.equal(b.bareme, 20);
  });
}

test('un vrai nom sans case cochée reste, avec ses avertissements', () => {
  const t = table('philo-v1-a-cocher.csv').map((l) => [...l]);
  const colonne = repererElevesColonnes(t)[0].colonneCase;
  const ligneNom = t.findIndex((l) => l[colonne] === 'Élève 1');
  t[ligneNom][colonne] = 'Jeanne Dupont';
  const { copies } = lireGuidelineCorrigee(t);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].eleve, 'Jeanne Dupont');
  assert.ok(copies[0].avertissements.length > 0);
});
