#!/usr/bin/env node
// =====================================================================
//  VERIFICATION DE L'INSTALLATION HGGSP v2, CONTRE LA VRAIE BASE
//
//    node scripts/verifier-hggsp-base.mjs
//    npm run hggsp:verifier
//
//  STRICTEMENT EN LECTURE. Ce script n'ecrit rien, ne cree rien, ne
//  supprime rien : il lit, il compare, et il dit ce qui manque. On peut
//  le rejouer autant de fois qu'on veut, y compris en production.
//
//  Le NOYAU fait foi. Tout est compare a
//  supabase/functions/_shared/hggsp-noyau.ts : si la base a derive du
//  noyau, la note appliquee n'est plus celle que le code decrit, et c'est
//  exactement ce que ce script doit attraper.
//
//  Il verifie, dans cet ordre :
//    1. les tables de la couche redigee repondent ;
//    2. la grille ACTIVE de chaque exercice (V3 depuis le 2026-09-29) :
//       echelle, paliers 0 et max, taxonomie lisible, consigne stockee =
//       celle du noyau, grille_verifier() ; et les V2 du noyau, conformes
//       et archivees ;
//    3. la taxonomie des 43 erreurs types est complete ;
//    4. le routage : une seule grille active par exercice, moteur
//       'criteres_rediges', v1 archivee ;
//    5. l'etat REEL de la calibration — combien d'etalons sont de vraies
//       copies, combien ont ete corrigees par un professeur ;
//    6. le bac blanc complet : ses exercices, et s'il a deja servi ;
//    7. les relectures humaines en attente.
// =====================================================================

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import {
  GRILLE_DISSERTATION,
  GRILLE_ETUDE_CRITIQUE,
  TAXONOMIE,
  consigneSysteme,
  critereResolu,
  criterePrincipal,
  taxonomiePour,
} from '../supabase/functions/_shared/hggsp-noyau.ts';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const GRILLES = [GRILLE_DISSERTATION, GRILLE_ETUDE_CRITIQUE];

/** Statuts qui rendent une note definitive. Tout le reste = note provisoire. */
const STATUTS_VERROUILLES = ['locked', 'in_use'];

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
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = chargerEnv();
if (!env.PIPELINE_SUPABASE_URL || !env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
  process.exit(1);
}

const BASE = env.PIPELINE_SUPABASE_URL.replace(/\/$/, '');
const CLE = env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY;

let ok = 0;
let ko = 0;
const problemes = [];
const remarques = [];

function bilan(vert, libelle, detail = '') {
  if (vert) {
    ok += 1;
    console.log(`  ✓ ${libelle}${detail ? ` — ${detail}` : ''}`);
  } else {
    ko += 1;
    problemes.push(`${libelle}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Ni vert ni rouge : un fait a savoir, qui ne fait pas echouer le script. */
function noter(libelle) {
  remarques.push(libelle);
  console.log(`  · ${libelle}`);
}

async function lire(chemin) {
  const r = await fetch(`${BASE}/rest/v1/${chemin}`, {
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}` },
  });
  if (!r.ok) return { erreur: `HTTP ${r.status} ${(await r.text()).slice(0, 200)}` };
  return { data: await r.json() };
}

/** Compte les lignes d'une table sans en rapatrier une seule. */
async function compter(table, filtre = '') {
  const r = await fetch(`${BASE}/rest/v1/${table}?select=*${filtre}`, {
    method: 'HEAD',
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}`, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!r.ok) return { erreur: `HTTP ${r.status}` };
  const total = Number((r.headers.get('content-range') ?? '').split('/')[1]);
  return { total: Number.isFinite(total) ? total : 0 };
}

/* ------------------------------------------------------------------ */

console.log('\n═══ HGGSP — vérification en base ═══');
console.log(`Projet : ${BASE.replace(/^https:\/\//, '').split('.')[0]}\n`);

// --- 1. Les tables ---------------------------------------------------
console.log('1. Les tables de la couche rédigée');

const TABLES = [
  'grilles_redigees', 'grille_criteres', 'grille_descripteurs', 'taxonomie_redigee',
  'exam_exercices', 'correction_criteres', 'relectures_humaines',
  'etalon_copies', 'etalon_corrections_humaines', 'etalon_correction_humaine_criteres',
  'v_notes_examen_redige',
];
const manquantes = [];
for (const t of TABLES) {
  const r = await compter(t);
  if (r.erreur) manquantes.push(`${t} (${r.erreur})`);
}
bilan(
  manquantes.length === 0,
  `${TABLES.length - manquantes.length} / ${TABLES.length} tables répondent`,
  manquantes.length ? `manquantes : ${manquantes.join(', ')}` : '',
);

// --- 2. Les grilles ---------------------------------------------------
//
// Depuis le 2026-09-29 (SQL 57), la grille ACTIVE de chaque exercice est la
// V3 (classeur des profs, sur 10). Les V2 du noyau restent en base, archivées :
// les anciennes copies les désignent encore. On vérifie donc :
//   • la grille désignée par la grille de dépôt active, quelle qu'elle soit ;
//   • les grilles du noyau, contre le noyau, où qu'elles en soient.
console.log('\n2. Les grilles');

const depots = await lire('rubrics?select=id,exercise_type,status,grille_id&matiere=eq.hggsp&status=eq.active');
const idsActifs = new Set((depots.data ?? []).map((r) => r.grille_id).filter(Boolean));

/** La grille telle que la lit l'Edge Function, depuis la base. */
async function grilleDepuisBase(ligne) {
  const criteres = await lire(`grille_criteres?select=id,code,libelle,evaluer,max_points,ordre&grille_id=eq.${ligne.id}&order=ordre`);
  const ids = (criteres.data ?? []).map((c) => `"${c.id}"`).join(',');
  const descripteurs = ids
    ? await lire(`grille_descripteurs?select=critere_id,points,niveau,description&critere_id=in.(${ids})&order=points`)
    : { data: [] };
  return {
    id: ligne.id,
    matiere: 'hggsp',
    exercise_type: ligne.exercise_type,
    version: ligne.version,
    libelle: ligne.libelle,
    principe: ligne.principe,
    max_analytique: Number(ligne.max_analytique),
    max_officiel: Number(ligne.max_officiel),
    garde_fous: ligne.garde_fous ?? [],
    criteres: (criteres.data ?? []).map((c) => ({
      code: c.code,
      libelle: c.libelle,
      evaluer: Array.isArray(c.evaluer) ? c.evaluer : [],
      max_points: Number(c.max_points),
      ordre: Number(c.ordre),
      paliers: (descripteurs.data ?? [])
        .filter((d) => d.critere_id === c.id)
        .map((d) => ({ points: Number(d.points), niveau: d.niveau, description: d.description })),
    })),
  };
}

for (const exercice of ['hggsp_dissertation', 'hggsp_etude_critique']) {
  const depot = (depots.data ?? []).find((r) => r.exercise_type === exercice);
  if (!depot?.grille_id) {
    bilan(false, `${exercice} : une grille active`, 'aucune grille de dépôt active ne désigne de grille rédigée');
    continue;
  }
  const enBase = await lire(`grilles_redigees?select=*&id=eq.${depot.grille_id}`);
  const ligne = enBase.data?.[0];
  if (!ligne) {
    bilan(false, `${depot.grille_id} présente en base`, enBase.erreur ?? 'absente');
    continue;
  }
  const g = await grilleDepuisBase(ligne);
  bilan(true, `${exercice} : grille active ${g.id} (version ${g.version})`, `${g.criteres.length} critères, ${g.max_analytique} analytiques → ${g.max_officiel} officiels`);

  const somme = g.criteres.reduce((n, c) => n + c.max_points, 0);
  bilan(Math.abs(somme - g.max_analytique) < 0.001, `${g.id} : la somme des critères fait l'échelle`, `${somme} / ${g.max_analytique}`);

  const sansZero = g.criteres.filter((c) => !c.paliers.some((p) => p.points === 0)).map((c) => c.code);
  bilan(sansZero.length === 0, `${g.id} : chaque critère peut valoir 0`, sansZero.join(', '));
  const sansMax = g.criteres.filter((c) => !c.paliers.some((p) => p.points === c.max_points)).map((c) => c.code);
  bilan(sansMax.length === 0, `${g.id} : chaque critère a son palier maximum`, sansMax.join(', '));
  const muets = g.criteres.filter((c) => c.paliers.some((p) => /^[\d\s,.–-]*$/.test(p.description))).map((c) => c.code);
  bilan(muets.length === 0, `${g.id} : aucun palier sans descripteur`, muets.join(', '));

  // Chaque code de la taxonomie doit tomber sur un critère de CETTE grille.
  const perdus = taxonomiePour(exercice)
    .map((e) => [e.code, criterePrincipal(e, exercice)])
    .filter(([, c]) => c && !critereResolu(c, g))
    .map(([code, c]) => `${code}→${c}`);
  bilan(perdus.length === 0, `${g.id} : la taxonomie vise des critères de la grille`, perdus.join(', '));

  // LE contrôle qui compte : la consigne remise au correcteur est-elle bien
  // celle que le noyau construit depuis cette grille ?
  const noyau = GRILLES.find((x) => x.id === g.id);
  const attendue = noyau ? consigneSysteme(noyau) : consigneSysteme(g, { taxonomie: TAXONOMIE });
  const stockee = (ligne.system_prompt ?? '').trim();
  bilan(
    stockee === attendue.trim(),
    `${g.id} : la consigne système est celle du noyau`,
    stockee === attendue.trim() ? '' : stockee ? 'la base a dérivé du noyau' : 'aucune consigne stockée',
  );

  // Le contrôle de la base elle-même (utilisé par grille_verrouiller).
  const rpc = await fetch(`${BASE}/rest/v1/rpc/grille_verifier`, {
    method: 'POST',
    headers: { apikey: CLE, Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_grille: g.id }),
  });
  const verdict = rpc.ok ? await rpc.json() : null;
  bilan(
    verdict?.ok === true,
    `${g.id} : grille_verifier() en base`,
    verdict ? (verdict.blocages ?? []).map((b) => b.message).slice(0, 3).join(' · ') : `HTTP ${rpc.status}`,
  );

  if (STATUTS_VERROUILLES.includes(ligne.statut)) {
    bilan(true, `${g.id} : statut ${ligne.statut}`, 'les notes sont définitives');
  } else {
    noter(
      `${g.id} : statut « ${ligne.statut} »${ligne.valide_par ? `, validée par ${ligne.valide_par}` : ', jamais validée par un professeur'} — toute note produite est PROVISOIRE (voir GUIDE_HGGSP_V2.md §5).`,
    );
  }
}

// Les grilles du noyau (V2) : toujours conformes, et archivées si une autre note.
for (const g of GRILLES) {
  const enBase = await lire(`grilles_redigees?select=*&id=eq.${g.id}`);
  const ligne = enBase.data?.[0];
  if (!ligne) {
    bilan(false, `${g.id} présente en base`, enBase.erreur ?? 'absente');
    continue;
  }
  const criteres = await lire(`grille_criteres?select=code&grille_id=eq.${g.id}`);
  const codesBase = (criteres.data ?? []).map((c) => c.code).sort();
  const codesNoyau = g.criteres.map((c) => c.code).sort();
  bilan(
    JSON.stringify(codesBase) === JSON.stringify(codesNoyau) &&
      (ligne.system_prompt ?? '').trim() === consigneSysteme(g).trim(),
    `${g.id} : conforme au noyau (critères + consigne)`,
    'les anciennes copies qui la désignent se re-corrigent à l’identique',
  );
  if (!idsActifs.has(g.id)) {
    bilan(ligne.statut === 'archived', `${g.id} : archivée, plus aucune nouvelle copie`, `statut « ${ligne.statut} »`);
  }
}

// --- 3. La taxonomie -------------------------------------------------
console.log('\n3. La taxonomie des erreurs types');

const taxo = await lire('taxonomie_redigee?select=code,portee,type_impact&matiere=eq.hggsp');
const enBase = (taxo.data ?? []).map((t) => t.code).sort();
const auNoyau = TAXONOMIE.map((t) => t.code).sort();
bilan(
  JSON.stringify(enBase) === JSON.stringify(auNoyau),
  `${auNoyau.length} codes d'erreur`,
  enBase.length === auNoyau.length ? '' : `base ${enBase.length}, noyau ${auNoyau.length}`,
);

const parPortee = {};
for (const t of taxo.data ?? []) parPortee[t.portee] = (parPortee[t.portee] ?? 0) + 1;
const porteesNoyau = {};
for (const t of TAXONOMIE) porteesNoyau[t.portee] = (porteesNoyau[t.portee] ?? 0) + 1;
bilan(
  JSON.stringify(parPortee) === JSON.stringify(porteesNoyau),
  'répartition par portée (transversale / dissertation / étude critique)',
  Object.entries(parPortee).map(([p, n]) => `${p} ${n}`).join(' · '),
);

// Seuls deux types d'impact touchent la note. Le savoir évite de croire qu'une
// erreur « signalée » a coûté des points.
const agissants = (taxo.data ?? []).filter((t) =>
  ['criterion_score_cap', 'criterion_level_cap'].includes(t.type_impact),
).length;
noter(`${agissants} code(s) sur ${enBase.length} agissent réellement sur la note (plafond de score ou de niveau).`);

// --- 4. Le routage ---------------------------------------------------
console.log('\n4. Le routage vers le moteur rédigé');

const rubrics = await lire('rubrics?select=id,track,exercise_type,status,moteur,grille_id&matiere=eq.hggsp');
const actives = (rubrics.data ?? []).filter((r) => r.status === 'active');
bilan(
  actives.length === GRILLES.length,
  `${GRILLES.length} grille(s) de dépôt active(s)`,
  `${actives.length} active(s) sur ${(rubrics.data ?? []).length}`,
);
bilan(
  actives.every((r) => r.moteur === 'criteres_rediges' && r.grille_id),
  'chaque grille active pointe vers le moteur rédigé et sa grille',
  actives.map((r) => `${r.id} → ${r.moteur}/${r.grille_id ?? '∅'}`).join(' · '),
);
// Deux grilles actives sur le même exercice = la copie serait notée au hasard
// de l'ordre de lecture.
const doublons = {};
for (const r of actives) {
  const cle = `${r.track}|${r.exercise_type}`;
  doublons[cle] = (doublons[cle] ?? 0) + 1;
}
const enDouble = Object.entries(doublons).filter(([, n]) => n > 1);
bilan(
  enDouble.length === 0,
  'une seule grille active par (filière, exercice)',
  enDouble.map(([c, n]) => `${c} ×${n}`).join(' · '),
);

// La décision « qui note quoi » vit dans src/lib/moteurs.ts. Si la base s'en
// écarte, les copies sont notées par un autre moteur que celui qui est écrit —
// sans que rien ne plante, et c'est précisément ce qui rend l'écart coûteux.
const { MOTEUR_ATTENDU } = await import('../src/lib/moteurs.ts');
bilan(
  MOTEUR_ATTENDU.hggsp === 'criteres_rediges',
  'le moteur attendu pour HGGSP est bien la grille rédigée',
  `moteurs.ts dit « ${MOTEUR_ATTENDU.hggsp} »`,
);

const gabarits = await lire('dossier_templates?select=id,status,audience&matiere=eq.hggsp&audience=eq.eleve');
const gabActifs = (gabarits.data ?? []).filter((t) => t.status === 'active');
bilan(gabActifs.length >= GRILLES.length, 'dossiers élève actifs', `${gabActifs.length} actif(s)`);

// --- 5. La calibration -----------------------------------------------
console.log('\n5. La calibration : ce sur quoi la note s’appuie vraiment');

const etalons = await lire('etalon_copies?select=id,libelle,grille_id,benchmark_card_id,statut&matiere=eq.hggsp');
const listeEtalons = etalons.data ?? [];
const bench = await lire('benchmark_cards?select=id,origin:card_json->>origin&limit=2000');
const origines = new Map((bench.data ?? []).map((b) => [b.id, b.origin]));
const synthetiques = listeEtalons.filter((e) =>
  (origines.get(e.benchmark_card_id) ?? '').includes('synthetic'),
).length;

const humaines = await lire('etalon_corrections_humaines?select=etalon_copie_id,prof_nom,grille_id');
const idsHumaines = new Set((humaines.data ?? []).map((h) => h.etalon_copie_id));
const etalonsHumains = listeEtalons.filter((e) => idsHumaines.has(e.id)).length;

noter(`${listeEtalons.length} copie(s) étalon en base, dont ${synthetiques} profil(s) inventé(s) pour caler l'échelle.`);
bilan(
  etalonsHumains > 0,
  'des copies étalons corrigées par un professeur',
  etalonsHumains > 0
    ? `${etalonsHumains} copie(s), ${(humaines.data ?? []).length} correction(s) humaine(s)`
    : "aucune : l'échelle n'a jamais été confrontée à un correcteur humain (GUIDE_HGGSP_V2.md §4)",
);

const copies = await lire('corrections?select=id,status,grille_id,score_analytique,score_officiel&moteur=eq.criteres_rediges&est_etalon=is.false');
const listeCopies = copies.data ?? [];
noter(`${listeCopies.length} copie(s) d'élève notée(s) par le moteur rédigé.`);
// Une note analytique sans note officielle = la conversion n'a pas eu lieu.
const sansConversion = listeCopies.filter((c) => c.score_analytique !== null && c.score_officiel === null);
bilan(
  sansConversion.length === 0,
  'toute note analytique a bien été convertie en note officielle',
  sansConversion.length ? `${sansConversion.length} copie(s) sans note officielle` : '',
);

// --- 6. Le bac blanc complet -----------------------------------------
console.log('\n6. Le bac blanc complet (deux exercices, note finale sur 20)');

const examens = await lire('exams?select=id,code,titre,statut,exam_format&matiere=eq.hggsp&exam_format=eq.full_exam');
const listeExamens = examens.data ?? [];
bilan(listeExamens.length > 0, 'au moins un bac blanc complet préparé', `${listeExamens.length}`);

for (const e of listeExamens) {
  const exos = await lire(`exam_exercices?select=exercise_type,grille_id,subject_id,max_officiel&exam_id=eq.${e.id}&order=ordre`);
  const liste = exos.data ?? [];
  const total = liste.reduce((n, x) => n + Number(x.max_officiel), 0);
  bilan(
    liste.length >= 2 && total === 20,
    `${e.code} : ${liste.length} exercice(s), ${total} points au total`,
    liste.map((x) => `${x.exercise_type} /${x.max_officiel}`).join(' + '),
  );
  // Un exercice dont le sujet n'est pas visible rend le bac blanc indéposable.
  for (const x of liste) {
    const s = await lire(`subject_cards?select=id,status&id=eq.${x.subject_id}`);
    const statut = s.data?.[0]?.status ?? 'absent';
    if (statut !== 'active') {
      bilan(false, `${e.code} · ${x.exercise_type} : sujet ${x.subject_id}`, `statut « ${statut} » — le bac blanc complet ne sera pas proposé au dépôt`);
    }
  }
}

const groupes = await compter('v_notes_examen_redige');
if ((groupes.total ?? 0) === 0) {
  noter("aucune copie n'a encore été déposée en bac blanc complet : la note finale sur 20 n'a jamais été produite pour de vrai.");
} else {
  bilan(true, 'des bacs blancs complets ont déjà été notés', `${groupes.total} élève(s)`);
}

// --- 7. Les relectures humaines --------------------------------------
console.log('\n7. Les relectures humaines');

const relectures = await lire('relectures_humaines?select=id,code_motif,statut,correction_id');
const idsCopies = new Set(listeCopies.map((c) => c.id));
const ouvertes = (relectures.data ?? []).filter((r) => r.statut === 'ouverte' && idsCopies.has(r.correction_id));
if (ouvertes.length === 0) {
  bilan(true, 'aucune relecture en attente sur une copie HGGSP');
} else {
  const parMotif = {};
  for (const r of ouvertes) parMotif[r.code_motif] = (parMotif[r.code_motif] ?? 0) + 1;
  bilan(false, `${ouvertes.length} relecture(s) en attente`, Object.entries(parMotif).map(([m, n]) => `${m} ×${n}`).join(' · '));
}

/* ------------------------------------------------------------------ */

console.log(`\n${ok} contrôle(s) vert(s), ${ko} problème(s), ${remarques.length} remarque(s).`);
if (remarques.length) {
  console.log('\nÀ savoir :');
  for (const r of remarques) console.log(`  · ${r}`);
}
if (ko) {
  console.log('\nÀ regarder :');
  for (const p of problemes) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\nInstallation conforme au noyau.');
