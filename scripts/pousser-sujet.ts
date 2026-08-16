/**
 * DÉPOSER UN SUJET ET SON BARÈME DANS L'ESPACE, SANS PASSER PAR L'API PAYANTE.
 *
 *   npm run sujet:pousser -- fichiers/MDB-MATH-2027-01-bareme.json
 *   npm run sujet:pousser -- <bareme.json> --sujet <sujet.md> --corrige <dossier.md>
 *   npm run sujet:pousser -- <bareme.json> --verifier-seulement
 *
 * Pourquoi ce script existe. Les sujets et leurs barèmes s'écrivent dans Claude
 * Code, sur l'abonnement déjà payé — jamais par l'Edge Function
 * `propose-bareme`, qui appelle l'API Anthropic et la facture. Restait à les
 * faire entrer en base : c'était un script jeté après usage à chaque fois.
 *
 * Il n'écrit AUCUN SQL à la main : il appelle exactement les fonctions
 * qu'emploient les routes /api/admin/bareme. Les colonnes jsonb, les paliers et
 * les clés étrangères sont donc traités par le même code que l'interface, et il
 * n'y a pas deux façons d'écrire un barème dans ce projet.
 *
 * Ce qu'il ne fait pas, volontairement : il ne verrouille rien et n'ouvre
 * aucune correction. Le sujet reste en brouillon jusqu'à ce qu'un professeur
 * l'ait relu, et c'est l'écran qui sert à le verrouiller — pas une commande.
 *
 * Format d'entrée : le JSON produit par le skill `generer-sujet-bac`
 * (voir references/bareme-export.md) — { exam, version, exercices, questions }.
 */
import './_env'; // EN PREMIER : voir le commentaire de ce fichier.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  chargerVueExamen,
  creerExamen,
  enregistrerBareme,
  listerExamens,
  majExamen,
  verifierEnBase,
  type SaisieQuestion,
} from '../src/lib/bareme';
import { LABELS_MATIERES } from '../src/lib/matieres';
import { CE_QUI_SE_DEFINIT, moteurAttendu } from '../src/lib/moteurs';

type FichierBareme = {
  exam: {
    code: string;
    matiere: string;
    titre: string;
    track?: string;
    exercise_type?: string | null;
    session?: string | null;
    date_epreuve?: string | null;
  };
  exercices?: { code: string; titre?: string | null; ordre?: number }[];
  questions: SaisieQuestion[];
};

const AUTEUR = 'claude-code:generer-sujet-bac';

function argument(nom: string): string | null {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 ? process.argv[i + 1] ?? null : null;
}

function lireTexte(chemin: string | null): string | null {
  return chemin ? readFileSync(resolve(chemin), 'utf8') : null;
}

async function principal() {
  const chemin = process.argv[2];
  if (!chemin || chemin.startsWith('--')) {
    console.error(
      'Usage : npm run sujet:pousser -- <bareme.json> [--sujet <fichier>] [--corrige <fichier>] [--verifier-seulement]',
    );
    process.exit(1);
  }

  const f = JSON.parse(readFileSync(resolve(chemin), 'utf8')) as FichierBareme;
  const { code, matiere, titre } = f.exam;
  if (!code || !matiere || !titre) {
    throw new Error('Le fichier doit contenir exam.code, exam.matiere et exam.titre.');
  }

  // Garde-fou : un barème par sujet ne se dépose que là où il en faut un.
  // Ailleurs, la matière se note à sa grille et cet examen resterait un
  // brouillon que personne ne pourrait verrouiller.
  if (!(matiere in LABELS_MATIERES)) {
    throw new Error(`« ${matiere} » n'est pas une matière du baccalauréat.`);
  }
  const moteur = moteurAttendu(matiere);
  if (moteur !== 'bareme_sujet') {
    throw new Error(
      `${LABELS_MATIERES[matiere]} ne se note pas au barème par sujet. ${CE_QUI_SE_DEFINIT[moteur]}`,
    );
  }

  const total = f.questions.reduce((s, q) => s + Number(q.max_points ?? 0), 0);
  console.log(`\n${titre}`);
  console.log(`  ${code} · ${LABELS_MATIERES[matiere]} · ${f.questions.length} questions · ${total} points\n`);

  // 1. L'examen — réutilisé s'il existe déjà, pour que la commande se rejoue.
  const existants = await listerExamens(matiere);
  let examId = existants.find((e) => e.code === code)?.id ?? null;
  if (examId) {
    console.log('· Examen déjà présent, il est mis à jour.');
  } else {
    const { examen } = await creerExamen({
      code,
      matiere,
      titre,
      track: f.exam.track ?? 'generale',
      exercise_type: f.exam.exercise_type ?? null,
      session: f.exam.session ?? null,
      date_epreuve: f.exam.date_epreuve ?? null,
      auteur: AUTEUR,
    });
    examId = examen.id;
    console.log('· Examen créé, avec sa version de barème 1.0 vide.');
  }

  // 2. Le sujet et le corrigé en texte : c'est ce que le correcteur aura sous
  //    les yeux, et ce que l'écran affiche au professeur relecteur.
  const sujet = lireTexte(argument('sujet'));
  const corrige = lireTexte(argument('corrige'));
  if (sujet || corrige) {
    await majExamen(examId, {
      ...(sujet ? { sujet_texte: sujet } : {}),
      ...(corrige ? { corrige_texte: corrige } : {}),
    });
    console.log(
      `· Texte attaché : ${[sujet && 'sujet', corrige && 'corrigé'].filter(Boolean).join(' et ')}.`,
    );
  }

  const vue = await chargerVueExamen(examId);
  const version = vue?.bareme?.version;
  if (!version) throw new Error("Cet examen n'a aucune version de barème.");
  if (version.statut === 'locked') {
    throw new Error(
      `La version ${version.version} est verrouillée : les copies déjà corrigées gardent la leur. ` +
        'Créer une nouvelle version depuis /admin/bareme avant de réécrire ce barème.',
    );
  }

  // 3. Le barème.
  if (!argument('verifier-seulement')) {
    await enregistrerBareme(version.id, {
      exercices: f.exercices,
      questions: f.questions.map((q, i) => ({ ...q, ordre: q.ordre ?? i })),
    });
    console.log(`· Barème ${version.version} enregistré.`);
  }

  // 4. La vérification qui fait autorité : celle de la base, la même que
  //    rejoue `bareme_verrouiller()`. Celle du TypeScript ne bloque rien.
  const c = await verifierEnBase(version.id);
  console.log('\n--- bareme_verifier() ---');
  console.log(`total : ${c.total_points} / ${Number(version.max_score)}`);
  for (const b of c.blocages) console.log(`  ✗ BLOCAGE  ${b.code} — ${b.message}`);
  for (const a of c.avertissements) console.log(`  ⚠ ${a.code} — ${a.message}`);
  if (!c.blocages.length) console.log('  aucun blocage.');

  console.log(
    c.ok
      ? `\n✅ Prêt à relire : /admin/bareme/${examId}\n   Le sujet reste en brouillon. C'est un professeur qui le valide, puis « Verrouiller cette version ».`
      : `\n⛔ ${c.blocages.length} blocage(s) : le barème ne pourra pas être verrouillé tant qu'ils sont là.`,
  );
  if (!c.ok) process.exitCode = 2;
}

principal().catch((e) => {
  console.error(`\n⛔ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
