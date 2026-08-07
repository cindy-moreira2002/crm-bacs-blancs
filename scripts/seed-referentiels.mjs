#!/usr/bin/env node
// =====================================================================
//  REFERENTIELS PAR DISCIPLINE : COMPETENCES + TAXONOMIE D'ERREURS
//
//  Usage :
//    node scripts/seed-referentiels.mjs --check
//    node scripts/seed-referentiels.mjs --apply
//    node scripts/seed-referentiels.mjs --sql supabase/sql/34_referentiels_disciplines.sql
//
//  Pourquoi ce fichier : le bareme par sujet declare, pour chaque
//  question, les competences mobilisees et les codes d'erreur possibles.
//  bareme_verifier() refuse une competence ou signale un code qui
//  n'existe pas dans le referentiel de la discipline. Il faut donc que
//  ces referentiels existent AVANT le premier bareme.
//
//  Les competences sont ecrites ici (listes officielles du programme).
//  La taxonomie d'erreurs, elle, est REPRISE des modules de matiere
//  existants (scripts/matieres/*.mjs) : rien n'est reinvente, on ne fait
//  que la sortir de rubric_json pour la rendre interrogeable, et on lui
//  ajoute la separation exigee entre erreur de l'eleve, incident de
//  transcription et anomalie du sujet.
// =====================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

// ---------------------------------------------------------------------
//  1) COMPETENCES
//
//  toujours_mobilisee = false : la competence n'est evaluee QUE si le
//  sujet la mobilise reellement. Sinon elle sort en 'non_applicable' —
//  jamais a zero, et elle ne fait jamais baisser la note.
// ---------------------------------------------------------------------
const COMPETENCES = [
  // --- Mathematiques : les six competences du programme, + l'algorithmique.
  { matiere: 'maths', code: 'chercher',      libelle: 'Chercher',      ordre: 1, toujours_mobilisee: true,
    description: "S'engager dans la recherche : extraire l'information utile, tester, essayer un cas particulier, reformuler la question en termes mathematiques." },
  { matiere: 'maths', code: 'modeliser',     libelle: 'Modeliser',     ordre: 2, toujours_mobilisee: true,
    description: 'Traduire une situation en objet mathematique (fonction, suite, loi de probabilite, configuration de l\'espace) et revenir a la situation pour interpreter.' },
  { matiere: 'maths', code: 'representer',   libelle: 'Representer',   ordre: 3, toujours_mobilisee: true,
    description: 'Choisir et employer un registre adapte : graphique, tableau de variations, arbre pondere, figure, ecriture algebrique, et passer de l\'un a l\'autre.' },
  { matiere: 'maths', code: 'raisonner',     libelle: 'Raisonner',     ordre: 4, toujours_mobilisee: true,
    description: 'Demontrer : enoncer les hypotheses, nommer le theoreme employe, verifier ses conditions, enchainer les deductions, conclure. C\'est la demonstration qui est notee, pas le resultat.' },
  { matiere: 'maths', code: 'calculer',      libelle: 'Calculer',      ordre: 5, toujours_mobilisee: true,
    description: 'Mener un calcul exact ou approche, controler son ordre de grandeur, respecter l\'arrondi et l\'unite demandes.' },
  { matiere: 'maths', code: 'communiquer',   libelle: 'Communiquer',   ordre: 6, toujours_mobilisee: true,
    description: 'Rediger avec des notations justes, des quantificateurs et des connecteurs logiques, et enoncer le resultat en phrase, replace dans le contexte.' },
  { matiere: 'maths', code: 'algorithmique', libelle: 'Algorithmique et programmation', ordre: 7, toujours_mobilisee: false,
    description: "Lire, completer ou ecrire un algorithme ou un script Python. Evaluee UNIQUEMENT si le sujet en comporte : sinon 'non_applicable', jamais zero." },

  // --- Physique-chimie : les competences de la demarche scientifique
  //     (S'approprier / Analyser / Realiser / Valider / Communiquer),
  //     puis les aspects fins, evalues seulement quand le sujet les mobilise.
  { matiere: 'physique-chimie', code: 'approprier',   libelle: 'S\'approprier',  ordre: 1, toujours_mobilisee: true,
    description: 'S\'approprier la situation : identifier le systeme etudie, le referentiel, l\'etat initial et l\'etat final, reformuler la question posee, reperer les grandeurs pertinentes dans l\'enonce.' },
  { matiere: 'physique-chimie', code: 'analyser',     libelle: 'Analyser / Raisonner', ordre: 2, toujours_mobilisee: true,
    description: 'Construire la demarche : choisir une loi ou un modele, verifier son domaine de validite, organiser les etapes de la resolution, formuler des hypotheses.' },
  { matiere: 'physique-chimie', code: 'realiser',     libelle: 'Realiser',       ordre: 3, toujours_mobilisee: true,
    description: 'Mener les calculs, appliquer les relations, effectuer les conversions, exploiter les donnees numeriques.' },
  { matiere: 'physique-chimie', code: 'valider',      libelle: 'Valider',        ordre: 4, toujours_mobilisee: true,
    description: 'Controler la coherence du resultat : ordre de grandeur, signe, unite, comparaison a une valeur de reference, retour critique sur les hypotheses.' },
  { matiere: 'physique-chimie', code: 'communiquer',  libelle: 'Communiquer',    ordre: 5, toujours_mobilisee: true,
    description: 'Rendre compte de facon scientifique : vocabulaire exact, notations, phrase de conclusion, presentation lisible du raisonnement.' },
  { matiere: 'physique-chimie', code: 'demarche_experimentale', libelle: 'Demarche experimentale', ordre: 6, toujours_mobilisee: false,
    description: 'Concevoir ou critiquer un protocole, choisir un materiel, identifier une source d\'erreur experimentale. Evaluee seulement si le sujet comporte une partie experimentale.' },
  { matiere: 'physique-chimie', code: 'exploitation_documents', libelle: 'Exploitation de documents', ordre: 7, toujours_mobilisee: false,
    description: 'Extraire et croiser l\'information utile de documents fournis, sans paraphraser ni ajouter ce qui n\'y est pas.' },
  { matiere: 'physique-chimie', code: 'exploitation_graphiques', libelle: 'Exploitation de graphiques', ordre: 8, toujours_mobilisee: false,
    description: 'Lire une courbe, determiner un coefficient directeur, une asymptote, un temps caracteristique, une tangente.' },
  { matiere: 'physique-chimie', code: 'schemas_modelisation', libelle: 'Schemas et modelisation', ordre: 9, toujours_mobilisee: false,
    description: 'Produire un schema legende, un bilan des forces, un circuit, un schema de montage conforme aux conventions.' },
  { matiere: 'physique-chimie', code: 'unites_conversions', libelle: 'Unites et conversions', ordre: 10, toujours_mobilisee: false,
    description: 'Employer l\'unite juste, convertir, controler l\'homogeneite d\'une relation.' },
  { matiere: 'physique-chimie', code: 'chiffres_significatifs', libelle: 'Chiffres significatifs', ordre: 11, toujours_mobilisee: false,
    description: 'Afficher une precision compatible avec celle des donnees de l\'enonce.' },
  { matiere: 'physique-chimie', code: 'incertitudes', libelle: 'Incertitudes de mesure', ordre: 12, toujours_mobilisee: false,
    description: 'Estimer et exprimer une incertitude, comparer un ecart a l\'incertitude. Evaluee seulement lorsque le sujet l\'attend explicitement.' },
  { matiere: 'physique-chimie', code: 'equations_chimiques', libelle: 'Equations chimiques', ordre: 13, toujours_mobilisee: false,
    description: 'Ecrire et ajuster une equation de reaction, respecter les etats physiques et la conservation des elements et des charges.' },
  { matiere: 'physique-chimie', code: 'bilans_matiere', libelle: 'Bilans de matiere', ordre: 14, toujours_mobilisee: false,
    description: 'Construire un tableau d\'avancement, identifier le reactif limitant, mener un bilan de quantite de matiere.' },
  { matiere: 'physique-chimie', code: 'sens_physique', libelle: 'Sens physique du resultat', ordre: 15, toujours_mobilisee: false,
    description: 'Interpreter le resultat dans la situation reelle : ce que vaut un ordre de grandeur, ce qu\'un signe signifie, ce qu\'un resultat aberrant revele.' },
  { matiere: 'physique-chimie', code: 'conformite_protocole', libelle: 'Conformite du protocole', ordre: 16, toujours_mobilisee: false,
    description: 'Verifier que le protocole propose repond bien a la question posee et respecte les conditions d\'usage du materiel.' },
  { matiere: 'physique-chimie', code: 'securite', libelle: 'Securite experimentale', ordre: 17, toujours_mobilisee: false,
    description: 'Reperer et prendre en compte les risques (pictogrammes, equipements de protection, elimination des dechets). Evaluee seulement quand le sujet la mobilise.' },
];

// ---------------------------------------------------------------------
//  2) TAXONOMIE D'ERREURS, reprise des modules de matiere
// ---------------------------------------------------------------------
const GRAVITES = { major: 'majeure', moderate: 'moderee', minor: 'mineure' };

/** Erreur de l'eleve, incident de transcription, anomalie du sujet : trois choses differentes. */
function natureDuCode(code, categorie) {
  if (/TRANS/i.test(code) || /transcription/i.test(categorie ?? '')) return 'transcription';
  if (/SUJET|ENONCE/i.test(code)) return 'sujet';
  return 'eleve';
}

/** Critere de l'ancienne grille -> competence du nouveau referentiel. */
const VERS_COMPETENCE = {
  maths: {
    CHE: 'chercher', MOD: 'modeliser', REP: 'representer',
    RAI: 'raisonner', CAL: 'calculer', COM: 'communiquer',
    ALG: 'algorithmique', TRANSCRIPTION: null,
  },
  'physique-chimie': {
    APP: 'approprier', ANA: 'analyser', REA: 'realiser',
    VAL: 'valider', COM: 'communiquer', TRANSCRIPTION: null,
  },
};

async function taxonomieDepuisModule(matiere, chemin) {
  const data = await import(pathToFileURL(resolve(ROOT, chemin)).href);
  const vus = new Map();
  for (const r of data.rubrics ?? data.default?.rubrics ?? []) {
    for (const e of r.rubric_json?.common_error_taxonomy ?? []) {
      if (vus.has(e.code)) continue;
      vus.set(e.code, {
        matiere,
        code: e.code,
        domaine: e.category ?? null,
        description: e.description ?? '',
        gravite: GRAVITES[e.severity] ?? 'moderee',
        nature: natureDuCode(e.code, e.category),
        competence: VERS_COMPETENCE[matiere]?.[e.criterion] ?? null,
      });
    }
  }
  return [...vus.values()].sort((a, b) => a.code.localeCompare(b.code));
}

// Codes transverses : ils n'existent dans aucune grille de matiere parce
// qu'ils ne decrivent pas une faute de l'eleve. Le moteur en a besoin
// pour dire pourquoi il envoie une copie en relecture humaine.
const CODES_TRANSVERSES = (matiere) => [
  { matiere, code: 'TR-ILLISIBLE-01', domaine: 'transcription', gravite: 'majeure', nature: 'transcription', competence: null,
    description: "Formule, symbole, indice, exposant ou signe illisible ou incertain dans la transcription. Ce n'est jamais une erreur de l'eleve : cela declenche une verification de l'image d'origine." },
  { matiere, code: 'TR-NON-TRANSCRIT-01', domaine: 'transcription', gravite: 'majeure', nature: 'transcription', competence: null,
    description: 'Production non textuelle absente de la transcription (tableau de variations, courbe, figure, arbre, schema, montage). Le correcteur ne la juge pas, il la signale.' },
  { matiere, code: 'RC-METHODE-ALTERNATIVE-01', domaine: 'reconnaissance', gravite: 'moderee', nature: 'reconnaissance', competence: null,
    description: "L'eleve emploie une methode qui parait mathematiquement ou physiquement valide mais qui n'est pas prevue au bareme. Relecture humaine obligatoire, jamais zero d'office." },
  { matiere, code: 'SU-ANOMALIE-01', domaine: 'sujet', gravite: 'majeure', nature: 'sujet', competence: null,
    description: 'Le sujet ou le corrige parait comporter une erreur, une ambiguite ou une contradiction. Anomalie du dispositif, pas de la copie.' },
  { matiere, code: 'SU-BAREME-CONTRADICTION-01', domaine: 'sujet', gravite: 'majeure', nature: 'sujet', competence: null,
    description: 'Deux regles du bareme se contredisent sur cette question. Relecture humaine obligatoire.' },
];

// ---------------------------------------------------------------------
//  3) Ecriture
// ---------------------------------------------------------------------
async function poser(env, table, lignes, conflit) {
  if (!lignes.length) return 0;
  const r = await fetch(
    `${env.PIPELINE_SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflit}`,
    {
      method: 'POST',
      headers: {
        apikey: env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(lignes),
    },
  );
  if (!r.ok) throw new Error(`${table} : ${r.status} ${await r.text()}`);
  return lignes.length;
}

const hex = (v) => Buffer.from(v, 'utf8').toString('hex');
function litteral(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (/[^\x00-\x7F]/.test(v)) return `convert_from(decode('${hex(v)}', 'hex'), 'UTF8')`;
  return `'${v.replace(/'/g, "''")}'`;
}

function genererSql(competences, taxonomie, chemin) {
  const colC = ['matiere', 'code', 'libelle', 'description', 'ordre', 'toujours_mobilisee'];
  const colT = ['matiere', 'code', 'domaine', 'description', 'gravite', 'nature', 'competence'];
  const bloc = (table, cols, lignes, conflit) =>
    lignes
      .map(
        (l) =>
          `insert into public.${table} (${cols.join(', ')})\nvalues (${cols
            .map((c) => litteral(l[c] ?? null))
            .join(', ')})\non conflict (${conflit}) do update set\n${cols
            .filter((c) => !conflit.split(', ').includes(c))
            .map((c) => `  ${c} = excluded.${c}`)
            .join(',\n')};`,
      )
      .join('\n\n');

  const sql = `-- =====================================================================
--  REFERENTIELS PAR DISCIPLINE : COMPETENCES + TAXONOMIE D'ERREURS
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  Genere par scripts/seed-referentiels.mjs, deja applique par API.
--  Prerequis : supabase/sql/33_bareme_par_sujet.sql.
--
--  ${competences.length} competence(s), ${taxonomie.length} code(s) d'erreur.
--  Idempotent : chaque insert est un upsert sur la cle primaire.
--  100% ASCII : accents encodes en hexadecimal.
-- =====================================================================

-- =====================================================================
--  BLOC A - COMPETENCES
--  toujours_mobilisee = false : competence evaluee UNIQUEMENT quand le
--  sujet la mobilise. Sinon 'non_applicable', jamais zero.
-- =====================================================================

begin;

${bloc('competence_referentiels', colC, competences, 'matiere, code')}

commit;


-- =====================================================================
--  BLOC B - TAXONOMIE D'ERREURS
--  nature separe les quatre familles : erreur de l'eleve, incident de
--  transcription, incertitude de reconnaissance, anomalie du sujet.
--  gravite est PEDAGOGIQUE : elle ne retire aucun point.
-- =====================================================================

begin;

${bloc('taxonomie_erreurs', colT, taxonomie, 'matiere, code')}

commit;


-- =====================================================================
--  BLOC C - VERIFICATION
-- =====================================================================

select matiere, count(*) as competences from public.competence_referentiels group by 1 order by 1;
select matiere, nature, count(*) as codes from public.taxonomie_erreurs group by 1, 2 order by 1, 2;
`;
  if (/[^\x00-\x7F]/.test(sql)) throw new Error('Le SQL genere contient des caracteres non-ASCII.');
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, sql);
  return chemin;
}

// ---------------------------------------------------------------------
//  Programme principal
// ---------------------------------------------------------------------
const options = process.argv.slice(2);

const taxonomie = [
  ...(await taxonomieDepuisModule('maths', 'scripts/matieres/maths.mjs')),
  ...CODES_TRANSVERSES('maths'),
  ...(await taxonomieDepuisModule('physique-chimie', 'scripts/matieres/physique-chimie.mjs')),
  ...CODES_TRANSVERSES('physique-chimie'),
];

console.log(`Competences : ${COMPETENCES.length}`);
for (const m of ['maths', 'physique-chimie']) {
  console.log(
    `  ${m.padEnd(16)} ${COMPETENCES.filter((c) => c.matiere === m).length} competence(s), ` +
      `${taxonomie.filter((t) => t.matiere === m).length} code(s) d'erreur`,
  );
}

// Un code d'erreur qui vise une competence inexistante casserait le
// diagnostic : on le refuse ici plutot qu'en base.
const cles = new Set(COMPETENCES.map((c) => `${c.matiere}|${c.code}`));
const orphelins = taxonomie.filter((t) => t.competence && !cles.has(`${t.matiere}|${t.competence}`));
if (orphelins.length) {
  console.error(`\n${orphelins.length} code(s) visent une competence inconnue :`);
  for (const o of orphelins) console.error(`  ${o.matiere}/${o.code} -> ${o.competence}`);
  process.exit(1);
}
console.log('  toutes les competences visees existent.');

const iSql = options.indexOf('--sql');
if (iSql !== -1) {
  console.log(`\nTrace SQL : ${genererSql(COMPETENCES, taxonomie, resolve(ROOT, options[iSql + 1]))}`);
}

if (options.includes('--apply')) {
  const env = chargerEnv();
  if (!env.PIPELINE_SUPABASE_URL || !env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY) {
    console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
    process.exit(1);
  }
  console.log('\nEcriture en base...');
  console.log(`  competence_referentiels : ${await poser(env, 'competence_referentiels', COMPETENCES, 'matiere,code')}`);
  console.log(`  taxonomie_erreurs       : ${await poser(env, 'taxonomie_erreurs', taxonomie, 'matiere,code')}`);
  console.log('Termine.');
}
