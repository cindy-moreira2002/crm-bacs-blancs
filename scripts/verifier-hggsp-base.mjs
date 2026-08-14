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
//    2. les 2 grilles sont conformes au noyau, criteres et descripteurs
//       compris, ET la consigne systeme stockee est bien celle que le
//       noyau construit (sinon le correcteur lit un autre bareme) ;
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

console.log('\n═══ HGGSP v2 — vérification en base ═══');
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

// --- 2. Les grilles, comparées au noyau ------------------------------
console.log('\n2. Les grilles, comparées au noyau');

for (const g of GRILLES) {
  const enBase = await lire(
    `grilles_redigees?select=*&id=eq.${g.id}`,
  );
  const ligne = enBase.data?.[0];
  if (!ligne) {
    bilan(false, `${g.id} présente en base`, enBase.erreur ?? 'absente');
    continue;
  }

  bilan(
    Number(ligne.max_analytique) === g.max_analytique && Number(ligne.max_officiel) === g.max_officiel,
    `${g.id} : échelles`,
    `${ligne.max_analytique} analytiques → ${ligne.max_officiel} officiels (noyau : ${g.max_analytique} → ${g.max_officiel})`,
  );

  const criteres = await lire(`grille_criteres?select=id,code,max_points&grille_id=eq.${g.id}&order=ordre`);
  const codesBase = (criteres.data ?? []).map((c) => c.code).sort();
  const codesNoyau = g.criteres.map((c) => c.code).sort();
  bilan(
    JSON.stringify(codesBase) === JSON.stringify(codesNoyau),
    `${g.id} : ${codesNoyau.length} critères`,
    codesBase.length === codesNoyau.length ? '' : `base ${codesBase.length}, noyau ${codesNoyau.length}`,
  );

  // La somme des critères doit faire l'échelle analytique. Un écart d'un quart
  // de point suffit à ce qu'une copie parfaite ne puisse pas avoir 20.
  const somme = (criteres.data ?? []).reduce((n, c) => n + Number(c.max_points), 0);
  bilan(
    Math.abs(somme - g.max_analytique) < 0.001,
    `${g.id} : la somme des critères fait l'échelle`,
    `${somme} / ${g.max_analytique}`,
  );

  // Chaque critère du noyau a autant de paliers que de descripteurs en base.
  const idsCriteres = (criteres.data ?? []).map((c) => `"${c.id}"`).join(',');
  const descripteurs = idsCriteres
    ? await lire(`grille_descripteurs?select=critere_id&critere_id=in.(${idsCriteres})`)
    : { data: [] };
  const attendus = g.criteres.reduce((n, c) => n + c.paliers.length, 0);
  bilan(
    (descripteurs.data ?? []).length === attendus,
    `${g.id} : ${attendus} descripteurs de paliers`,
    `base ${(descripteurs.data ?? []).length}`,
  );

  // LE contrôle qui compte : la consigne remise au correcteur est-elle bien
  // celle que le noyau construit depuis cette grille ? Si elle a dérivé, le
  // correcteur applique un barème que le code ne décrit plus.
  const attendue = consigneSysteme(g);
  bilan(
    (ligne.system_prompt ?? '').trim() === attendue.trim(),
    `${g.id} : la consigne système est celle du noyau`,
    (ligne.system_prompt ?? '').trim() === attendue.trim()
      ? ''
      : 'la base a dérivé — rejouer node scripts/apply-hggsp.mjs',
  );

  // Statut : une grille non verrouillée produit des notes PROVISOIRES.
  if (STATUTS_VERROUILLES.includes(ligne.statut)) {
    bilan(true, `${g.id} : statut ${ligne.statut}`, 'les notes sont définitives');
  } else {
    noter(
      `${g.id} : statut « ${ligne.statut} »${ligne.valide_par ? `, validée par ${ligne.valide_par}` : ', jamais validée par un professeur'} — toute note produite est PROVISOIRE (voir GUIDE_HGGSP_V2.md §5).`,
    );
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
