#!/usr/bin/env node
// =====================================================================
//  LIEN D'ACCES ADMINISTRATRICE
//
//  Usage :
//    node scripts/lien-acces-admin.mjs cindy@exemple.fr
//    node scripts/lien-acces-admin.mjs cindy@exemple.fr --jours 7
//
//  Genere l'URL /admin/acces?t=<jeton> ou l'administratrice choisit
//  elle-meme son mot de passe (voir src/lib/accesAdmin.ts — meme
//  signature HMAC, garder les deux implementations alignees).
//
//  Le jeton est signe avec PIPELINE_INTERNAL_SECRET (.env / .env.local),
//  identique en local et sur Vercel : le lien genere ici vaut en prod.
//  Il expire (72 h par defaut) et ne permet QUE de definir le mot de
//  passe du compte portant l'email donne. Ne pas le publier.
// =====================================================================

import { createHmac } from 'node:crypto';
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

const email = (process.argv[2] ?? '').toLowerCase().trim();
if (!email.includes('@')) {
  console.error('Usage : node scripts/lien-acces-admin.mjs <email> [--jours N]');
  process.exit(1);
}
const idxJours = process.argv.indexOf('--jours');
const jours = idxJours > -1 ? Number(process.argv[idxJours + 1]) : 3;
if (!Number.isFinite(jours) || jours <= 0 || jours > 30) {
  console.error('--jours doit etre entre 1 et 30.');
  process.exit(1);
}

const secret = chargerEnv().PIPELINE_INTERNAL_SECRET;
if (!secret) {
  console.error('PIPELINE_INTERNAL_SECRET introuvable dans .env / .env.local');
  process.exit(1);
}

const exp = Date.now() + jours * 24 * 3600 * 1000;
const signature = createHmac('sha256', secret)
  .update(`acces-admin:${email}:${exp}`)
  .digest('hex')
  .slice(0, 24);
const jeton = `${Buffer.from(email).toString('base64url')}.${exp}.${signature}`;

console.log(`\nLien d'acces administratrice pour ${email} (valable ${jours} j) :\n`);
console.log(`  https://espaces.matineesdubac.fr/admin/acces?t=${jeton}\n`);
console.log('A ouvrir soi-meme, ne pas le publier : quiconque a ce lien peut');
console.log("definir le mot de passe du compte admin tant qu'il est valable.");
