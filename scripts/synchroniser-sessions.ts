/**
 * SYNCHRONISER LES SESSIONS ET RATTACHER LES INSCRIPTIONS
 *
 *   npm run sessions:verifier      (rapport seul, n'écrit rien)
 *   npm run sessions:synchroniser  (écrit)
 *
 * Deux écarts, hérités de l'époque où les dates de bacs blancs vivaient dans un
 * tableau écrit en dur (`src/lib/sessions.ts`) :
 *
 *  1. LES SESSIONS DU FICHIER QUI N'EXISTENT PAS EN BASE. Les six brevets
 *     blancs étaient proposés aux familles sans qu'aucune ligne ne leur
 *     corresponde dans `sessions_bacs_blancs` : impossible d'y assigner un
 *     prof, d'y déposer un sujet, ou de les voir dans le pilotage.
 *
 *  2. LES INSCRIPTIONS SANS `session_id`. Le formulaire n'enregistrait que la
 *     matière et la date : le tableau de bord comptait « 0 élève » sur des
 *     épreuves pleines. La route d'inscription rattache désormais toute
 *     nouvelle inscription ; ce script s'occupe des anciennes.
 *
 * Idempotent : rejouable sans risque, il ne touche que ce qui manque.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { SESSIONS_PLATEFORME } from '../src/lib/sessions';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const APPLIQUER = process.argv.includes('--apply');

function chargerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const fichier of ['.env', '.env.local']) {
    let texte: string;
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

const env = { ...chargerEnv(), ...process.env } as Record<string, string>;
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires.');
  process.exit(1);
}
const db = createClient(url, cle);

/** Comparaison de matières tolérante aux accents et à la casse. */
const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** '9h — 13h' → ['9h', '13h']. Une plage sans fin garde une fin vide. */
function decouperHeure(plage: string): [string, string | null] {
  const m = plage.split(/—|–|-/).map((x) => x.trim());
  return [m[0] || '9h', m[1] || null];
}

async function main() {
  console.log(APPLIQUER ? '✍️  Mode écriture\n' : '👀 Rapport seul (ajouter --apply pour écrire)\n');

  // --- 1. Sessions du fichier absentes de la base ---------------------
  const { data: enBase, error: errSessions } = await db
    .from('sessions_bacs_blancs')
    .select('id, matiere, date_epreuve');
  if (errSessions) throw errSessions;

  const cle_ = (matiere: unknown, date: unknown) => `${norm(matiere)}|${String(date)}`;
  const connues = new Set((enBase ?? []).map((s) => cle_(s.matiere, s.date_epreuve)));

  const manquantes = SESSIONS_PLATEFORME.filter((s) => !connues.has(cle_(s.matiere, s.date)));
  console.log(`Sessions en base : ${enBase?.length ?? 0}`);
  console.log(`Sessions du fichier absentes de la base : ${manquantes.length}`);
  for (const s of manquantes) console.log(`   · ${s.matiere} — ${s.date} (${s.heure}, ${s.places} places)`);

  if (APPLIQUER && manquantes.length) {
    const lignes = manquantes.map((s) => {
      const [debut, fin] = decouperHeure(s.heure);
      return {
        matiere: s.matiere,
        date_epreuve: s.date,
        heure_debut: debut,
        heure_fin: fin,
        places: s.places,
        coachs_recherches: 1,
        statut: 'ouverte',
      };
    });
    const { error } = await db.from('sessions_bacs_blancs').insert(lignes);
    if (error) throw error;
    console.log(`   ✅ ${lignes.length} session(s) créée(s).`);
  }

  // --- 2. Inscriptions sans session ------------------------------------
  const { data: toutes, error: errSessions2 } = await db
    .from('sessions_bacs_blancs')
    .select('id, matiere, date_epreuve');
  if (errSessions2) throw errSessions2;
  const parCle = new Map((toutes ?? []).map((s) => [cle_(s.matiere, s.date_epreuve), s.id as string]));

  const { data: inscriptions, error: errInsc } = await db
    .from('inscriptions')
    .select('id, matiere, date_epreuve, session_id')
    .is('session_id', null);
  if (errInsc) throw errInsc;

  const rattachables = (inscriptions ?? [])
    .map((i) => ({ i, sessionId: i.date_epreuve ? parCle.get(cle_(i.matiere, i.date_epreuve)) : undefined }))
    .filter((x): x is { i: (typeof inscriptions)[number]; sessionId: string } => Boolean(x.sessionId));

  const orphelines = (inscriptions ?? []).length - rattachables.length;
  console.log(`\nInscriptions sans session : ${(inscriptions ?? []).length}`);
  console.log(`   · rattachables (matière + date connues) : ${rattachables.length}`);
  console.log(`   · sans date ou sans session correspondante : ${orphelines}`);

  if (APPLIQUER && rattachables.length) {
    let faits = 0;
    for (const { i, sessionId } of rattachables) {
      const { error } = await db.from('inscriptions').update({ session_id: sessionId }).eq('id', i.id);
      if (error) {
        console.error(`   ⚠️ ${i.id} : ${error.message}`);
        continue;
      }
      faits++;
    }
    console.log(`   ✅ ${faits} inscription(s) rattachée(s).`);
  }

  console.log(APPLIQUER ? '\nTerminé.' : '\nRien n’a été écrit. Relancer avec --apply.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
