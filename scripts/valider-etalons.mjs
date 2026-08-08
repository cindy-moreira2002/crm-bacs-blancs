#!/usr/bin/env node
// =====================================================================
//  PASSER LES ETALONS EN validation_status = 'validated'
//
//  Usage :
//    node scripts/valider-etalons.mjs            (verification)
//    node scripts/valider-etalons.mjs --apply    (ecriture)
//
//  DECISION D'EXPLOITATION (Cindy, 6 aout 2026) : les etalons ne seront
//  pas relus un par un par des professeurs. Le statut 'candidate'
//  n'attendait que cette relecture ; il est donc leve.
//
//  CE QUE CELA CHANGE POUR LE MOTEUR : rien. correct-french-copy lit
//  .in('validation_status', ['validated','candidate']) : les deux sont
//  deja traites a egalite. Le seul effet est l'affichage du tableau de
//  bord, qui cesse d'alerter "0 etalon valide".
//
//  CE QUE CELA NE CHANGE PAS : card_json.origin. Un profil synthetique
//  reste marque 'synthetic_calibration_profile', et le tableau de bord
//  continue d'alerter "etalons tous synthetiques" sur les matieres qui
//  n'ont aucune copie reelle. On perd le signal "relu par un prof", on
//  ne perd pas le signal "invente".
//
//  EXCLUS DE LA BASCULE : les 9 profils de methode S01 a S09. Ils sont
//  en 'synthetic', SANS note, et le moteur les ignore pour cette raison.
//  Les passer en 'validated' les rendrait visibles avec un score nul,
//  donc lus comme des copies a 0/20 : ils tireraient toute l'echelle
//  vers le bas. Ils restent 'synthetic'.
// =====================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function chargerEnv() {
  const env = {};
  for (const fichier of ['.env', '.env.local']) {
    let texte;
    try {
      texte = readFileSync(`${ROOT}/${fichier}`, 'utf8');
    } catch {
      continue;
    }
    for (const ligne of texte.split('\n')) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = chargerEnv();
const URL_BASE = env.PIPELINE_SUPABASE_URL;
const CLE = env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CLE) {
  console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
  process.exit(1);
}
const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}` };

async function lire(chemin) {
  const r = await fetch(`${URL_BASE}/rest/v1/${chemin}`, { headers: entetes });
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`);
  return r.json();
}
async function poser(table, lignes) {
  if (!lignes.length) return 0;
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: { ...entetes, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(lignes),
  });
  if (!r.ok) throw new Error(`${table} : ${r.status} ${await r.text()}`);
  return lignes.length;
}

const NOTE =
  "Passe en 'validated' le 6 aout 2026 par decision d'exploitation : les etalons ne seront pas relus un par un par des professeurs. Ce statut ne signifie donc PAS qu'un professeur a relu cette copie. La nature de l'etalon reste lisible dans card_json.origin.";

// select=* : l'upsert reecrit la ligne entiere. Une colonne absente de la
// lecture reviendrait a null et casserait la contrainte not-null (track).
const etalons = await lire('benchmark_cards?select=*&limit=3000');

const aBasculer = etalons.filter(
  (b) => b.validation_status !== 'validated' && b.validation_status !== 'synthetic' && b.score !== null,
);
const sansNote = etalons.filter((b) => b.score === null);
const dejaValides = etalons.filter((b) => b.validation_status === 'validated');
const gardesSynthetiques = etalons.filter((b) => b.validation_status === 'synthetic');

const lignes = aBasculer.map((b) => ({
  ...b,
  validation_status: 'validated',
  card_json: { ...(b.card_json ?? {}), validation_note: NOTE, validated_le: '2026-08-06' },
}));

console.log(`${etalons.length} etalons en base.`);
console.log(`  a basculer en 'validated'      : ${lignes.length}`);
console.log(`  deja 'validated'               : ${dejaValides.length}`);
console.log(`  laisses en 'synthetic'         : ${gardesSynthetiques.length} (profils de methode sans note, ignores du moteur)`);
if (sansNote.length) console.log(`  sans note (jamais basculables) : ${sansNote.map((b) => b.id).join(', ')}`);

if (process.argv.includes('--apply')) {
  console.log('\nEcriture en base…');
  // Par paquets : PostgREST n'aime pas les corps trop gros.
  let ecrits = 0;
  for (let i = 0; i < lignes.length; i += 100) {
    ecrits += await poser('benchmark_cards', lignes.slice(i, i + 100));
  }
  console.log(`  benchmark_cards : ${ecrits}`);
  const restants = await lire('benchmark_cards?select=id&validation_status=eq.candidate');
  console.log(`  encore en 'candidate' : ${restants.length}`);
} else {
  console.log('\n(verification seule — relancer avec --apply pour ecrire)');
}
