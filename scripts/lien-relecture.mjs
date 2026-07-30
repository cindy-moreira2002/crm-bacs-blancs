#!/usr/bin/env node
/**
 * Imprime le lien signé du dossier de relecture prof d'une matière.
 *
 *   node scripts/lien-relecture.mjs francais
 *   node scripts/lien-relecture.mjs ses https://crm-bacs-blancs-ihgf.vercel.app
 *
 * Le jeton est un HMAC de PIPELINE_INTERNAL_SECRET : le même secret étant
 * posé sur Vercel, le lien imprimé ici est aussi valable en production.
 * Le secret lui-même n'est jamais affiché.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const fichier of ['.env', '.env.local']) {
  try {
    for (const ligne of readFileSync(join(racine, fichier), 'utf8').split('\n')) {
      const m = ligne.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  } catch {}
}

const matiere = (process.argv[2] ?? '').toLowerCase().trim();
const base = (process.argv[3] ?? 'https://crm-bacs-blancs-ihgf.vercel.app').replace(/\/$/, '');

if (!matiere) {
  console.error('Usage : node scripts/lien-relecture.mjs <matiere> [url-de-base]');
  process.exit(1);
}
if (!env.PIPELINE_INTERNAL_SECRET) {
  console.error('PIPELINE_INTERNAL_SECRET introuvable dans .env / .env.local');
  process.exit(1);
}

const jeton = createHmac('sha256', env.PIPELINE_INTERNAL_SECRET)
  .update(`relecture-prof:${matiere}`)
  .digest('hex')
  .slice(0, 20);

console.log(`${base}/relecture/${matiere}?t=${jeton}`);
console.log(`http://localhost:3000/relecture/${matiere}?t=${jeton}`);
