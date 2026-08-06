/**
 * Santé du système de correction : inventaire exhaustif de la base pipeline
 * + détecteur d'anomalies global. Pour piloter SANS jamais ouvrir Supabase.
 *
 * ⚠️ SERVEUR UNIQUEMENT — clé service_role du pipeline.
 *
 * Garantie de couverture : la liste des tables est relue en direct dans le
 * schéma exposé par PostgREST (spec OpenAPI de /rest/v1/) et comparée au
 * registre décrit ici. Une table créée demain dans Supabase apparaîtra
 * automatiquement en « non couverte » — rien ne peut exister en base sans
 * que cette page le sache. Même principe pour les buckets de stockage.
 *
 * Coût : cette analyse charge les JSON des barèmes et sujets ; elle est
 * appelée à l'ouverture de la page et sur demande, jamais en polling
 * (leçon du dépassement d'egress Supabase).
 */
import { pipelineDb } from './pipeline';
import { LABELS_MATIERES } from './pipelineEtat';
import {
  echelleExpliquee,
  trierDiagnostics,
  verifierStructureMatiere,
  type Diagnostic,
  type NiveauDiag,
  type StructMatiere,
} from './pipelineVerifs';

// --- Registre des tables : nom → à quoi ça sert, où le voir -----------

type FicheTable = {
  nom: string;
  titre: string;
  explication: string;
  ou_voir: string;
};

/** Les tables que la page connaît et couvre. Comparées au schéma réel. */
export const TABLES_COUVERTES: FicheTable[] = [
  {
    nom: 'rubrics',
    titre: 'Barèmes',
    explication: 'Une grille de notation par épreuve et filière : critères, paliers, consigne complète du correcteur IA.',
    ou_voir: 'Vue matière → Barèmes',
  },
  {
    nom: 'subject_cards',
    titre: 'Sujets',
    explication: 'Les sujets de bac blanc, avec pièges à surveiller et notions attendues.',
    ou_voir: 'Vue matière → Sujets',
  },
  {
    nom: 'benchmark_cards',
    titre: 'Copies étalons',
    explication: 'Des copies déjà notées qui calent la sévérité du correcteur (5 niveaux par sujet, de 3/20 à 18/20).',
    ou_voir: 'Vue matière → Sujets & copies étalons',
  },
  {
    nom: 'dossier_templates',
    titre: 'Gabarits de dossier',
    explication: 'Le patron du dossier de correction remis à l’élève.',
    ou_voir: 'Vue matière → Dossiers élève',
  },
  {
    nom: 'error_taxonomy',
    titre: 'Codes d’erreur du français',
    explication: 'La liste des erreurs types que le correcteur de FRANÇAIS peut pointer (les autres matières ont la leur dans leur barème).',
    ou_voir: 'Inventaire (comptage) — contenu stable, modifié avec les barèmes de français',
  },
  {
    nom: 'corrections',
    titre: 'Corrections',
    explication: 'Une ligne par copie déposée, avec son statut sur le tapis roulant, sa note interne et l’erreur éventuelle.',
    ou_voir: 'Corrections en direct + Vue matière → Corrections',
  },
  {
    nom: 'copy_transcriptions',
    titre: 'Transcriptions',
    explication: 'Le texte que l’IA a lu dans chaque PDF manuscrit, avec son niveau de confiance.',
    ou_voir: 'Anomalies (transcriptions douteuses) — le texte intégral reste en base',
  },
  {
    nom: 'dossiers',
    titre: 'Dossiers élève',
    explication: 'Le dossier final de chaque copie corrigée, servi à l’élève sur /dossier/<id>.',
    ou_voir: 'Corrections en direct → colonne Dossier (ouvrir ↗)',
  },
  {
    nom: 'relecture_feedback',
    titre: 'Retours de relecture',
    explication: 'Les réponses des profs relecteurs sur les barèmes et corrections de leur matière.',
    ou_voir: 'Retours des profs relecteurs + Vue matière',
  },
  {
    nom: 'transcription_profiles',
    titre: 'Profils de transcription',
    explication: 'Le réglage de lecture des copies scientifiques (quel modèle IA, quelles conventions de notation).',
    ou_voir: 'Anomalies (profil manquant) — modifiable par scripts/profils-transcription.mjs',
  },
];

type FicheBucket = { nom: string; titre: string; explication: string };

export const BUCKETS_COUVERTS: FicheBucket[] = [
  { nom: 'student-copies', titre: 'Copies déposées', explication: 'Les PDF originaux des copies, rangés par année/matière/épreuve.' },
  { nom: 'benchmark-copies', titre: 'Copies étalons (fichiers)', explication: 'Les fichiers sources des copies étalons réelles.' },
  { nom: 'official-references', titre: 'Références officielles', explication: 'Définitions d’épreuves et documents officiels qui ont servi à construire les barèmes.' },
  { nom: 'correction-exports', titre: 'Exports', explication: 'Exports de corrections (vide tant qu’aucun export n’est lancé).' },
];

// --- Formes -----------------------------------------------------------

export type LigneInventaire = FicheTable & { lignes: number };
export type LigneBucket = FicheBucket & { objets: number; partiel: boolean };

export type AnomalieGlobale = Diagnostic & {
  /** flux = tapis roulant des copies ; preparation = barèmes/sujets/gabarits ;
   *  calibration = étalons ; config = profils & co ; couverture = inventaire. */
  categorie: 'flux' | 'preparation' | 'calibration' | 'config' | 'couverture';
  matiere?: string;
  matiere_label?: string;
};

export type SanteSysteme = {
  genere_le: string;
  inventaire: {
    tables: LigneInventaire[];
    tables_non_couvertes: { nom: string; lignes: number }[];
    buckets: LigneBucket[];
    buckets_non_couverts: { nom: string; objets: number }[];
  };
  anomalies: AnomalieGlobale[];
  totaux: { bloquants: number; attentions: number };
};

// --- Collecte ---------------------------------------------------------

const MIN_BLOCAGE_FLUX = 30; // minutes avant qu'une copie en cours soit dite bloquée
const STATUTS_FINAUX = ['corrected', 'corrected_review', 'transcription_failed', 'correction_failed'];

type Compteur = { table: string; n: number };

async function compterTable(table: string): Promise<number> {
  const db = pipelineDb();
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) return -1; // table listée mais illisible : signalé plutôt que planté
  return count ?? 0;
}

/** Toutes les tables réellement exposées par PostgREST (spec OpenAPI). */
async function tablesReelles(): Promise<string[]> {
  const url = process.env.PIPELINE_SUPABASE_URL ?? '';
  const cle = process.env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY ?? '';
  const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: cle, Authorization: `Bearer ${cle}` } });
  if (!r.ok) throw new Error(`Lecture du schéma impossible (${r.status})`);
  const spec = (await r.json()) as { paths?: Record<string, unknown> };
  return Object.keys(spec.paths ?? {})
    .filter((p) => p !== '/' && !p.includes('rpc'))
    .map((p) => p.replace(/^\//, ''));
}

type BucketReel = { name: string };

/**
 * Compte les FICHIERS d'un bucket en descendant dans les dossiers (l'API ne
 * liste qu'un niveau à la fois). Budget de requêtes borné : au-delà, le
 * compte est rendu tel quel, marqué approximatif par l'appelant si besoin.
 */
async function bucketsReels(): Promise<{ nom: string; objets: number; partiel: boolean }[]> {
  const url = process.env.PIPELINE_SUPABASE_URL ?? '';
  const cle = process.env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY ?? '';
  const entetes = { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' };
  const r = await fetch(`${url}/storage/v1/bucket`, { headers: entetes });
  if (!r.ok) return [];
  const buckets = (await r.json()) as BucketReel[];

  type Entree = { name: string; id: string | null; metadata: unknown };
  const compterFichiers = async (bucket: string): Promise<{ n: number; partiel: boolean }> => {
    let requetes = 0;
    let partiel = false;
    const parcourir = async (prefix: string): Promise<number> => {
      if (requetes >= 40) {
        // Garde-fou : bucket énorme, on arrête et on le DIT (affiché « ≥ N »).
        partiel = true;
        return 0;
      }
      requetes += 1;
      const rep = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: entetes,
        body: JSON.stringify({ prefix, limit: 1000 }),
      });
      if (!rep.ok) return 0;
      const entrees = (await rep.json()) as Entree[];
      let n = 0;
      for (const e of entrees) {
        if (e.name === '.emptyFolderPlaceholder') continue;
        // Un dossier n'a pas d'id ni de métadonnées ; un fichier, si.
        if (e.id === null || e.metadata === null) n += await parcourir(prefix ? `${prefix}/${e.name}` : e.name);
        else n += 1;
      }
      return n;
    };
    const n = await parcourir('');
    return { n, partiel };
  };

  return Promise.all(
    buckets.map(async (b) => {
      const r = await compterFichiers(b.name).catch(() => ({ n: -1, partiel: false }));
      return { nom: b.name, objets: r.n, partiel: r.partiel };
    }),
  );
}

export async function chargerSante(): Promise<SanteSysteme> {
  const db = pipelineDb();

  type RubricRow = {
    id: string; matiere: string | null; track: string; exercise_type: string; status: string;
    system_prompt: string | null;
    rubric_json: { criteria?: { maximum_score?: number }[]; maximum_score?: number; common_error_taxonomy?: unknown[] } | null;
  };
  type SujetRow = {
    id: string; matiere: string | null; track: string; exercise_type: string; status: string;
    source_status: string | null;
  };
  type TplRow = { matiere: string | null; track: string; exercise_type: string; audience: string; status: string };
  type BenchRow = { subject_id: string | null; exercise_type: string; validation_status: string | null; origin: string | null };
  type CorrRow = {
    id: string; matiere: string | null; status: string; created_at: string; processing_error: string | null;
    subject_id: string | null;
  };
  type DossierRow = { correction_id: string };
  type ProfilRow = { matiere: string; status: string };

  const [nomsTables, buckets, rubRes, sujRes, tplRes, benchRes, corrRes, dossierRes, profilsRes, retoursN] =
    await Promise.all([
      tablesReelles(),
      bucketsReels(),
      db.from('rubrics').select('id, matiere, track, exercise_type, status, system_prompt, rubric_json'),
      db.from('subject_cards').select('id, matiere, track, exercise_type, status, source_status:card_json->>source_status'),
      db.from('dossier_templates').select('matiere, track, exercise_type, audience, status'),
      db.from('benchmark_cards').select('subject_id, exercise_type, validation_status, origin:card_json->>origin').limit(2000),
      db.from('corrections').select('id, matiere, status, created_at, processing_error, subject_id').order('created_at', { ascending: false }).limit(500),
      db.from('dossiers').select('correction_id').limit(2000),
      db.from('transcription_profiles').select('matiere, status'),
      compterTable('relecture_feedback'),
    ]);
  for (const r of [rubRes, sujRes, tplRes, benchRes, corrRes, dossierRes, profilsRes]) {
    if (r.error) throw new Error(r.error.message ?? 'Lecture pipeline impossible');
  }

  const rubriques = (rubRes.data ?? []) as RubricRow[];
  const sujets = (sujRes.data ?? []) as SujetRow[];
  const gabarits = (tplRes.data ?? []) as TplRow[];
  const benchs = (benchRes.data ?? []) as BenchRow[];
  const corrections = (corrRes.data ?? []) as CorrRow[];
  const lignesDossiers = (dossierRes.data ?? []) as DossierRow[];
  const profils = (profilsRes.data ?? []) as ProfilRow[];

  // --- Inventaire, garanti contre le schéma réel ----------------------
  const compte = new Map<string, number>();
  const comptages: Compteur[] = await Promise.all(
    nomsTables.map(async (t) => ({ table: t, n: await compterTable(t) })),
  );
  for (const c of comptages) compte.set(c.table, c.n);

  const couvertes = new Set(TABLES_COUVERTES.map((t) => t.nom));
  const inventaireTables: LigneInventaire[] = TABLES_COUVERTES.map((t) => ({
    ...t,
    lignes: compte.get(t.nom) ?? 0,
  }));
  const tablesNonCouvertes = nomsTables
    .filter((t) => !couvertes.has(t))
    .map((t) => ({ nom: t, lignes: compte.get(t) ?? 0 }));

  const bucketsConnus = new Set(BUCKETS_COUVERTS.map((b) => b.nom));
  const inventaireBuckets: LigneBucket[] = BUCKETS_COUVERTS.map((b) => {
    const reel = buckets.find((x) => x.nom === b.nom);
    return { ...b, objets: reel?.objets ?? 0, partiel: reel?.partiel ?? false };
  });
  const bucketsNonCouverts = buckets.filter((b) => !bucketsConnus.has(b.nom));

  // --- Anomalies ------------------------------------------------------
  const anomalies: AnomalieGlobale[] = [];
  const ajouter = (
    categorie: AnomalieGlobale['categorie'],
    niveau: NiveauDiag,
    texte: string,
    options: { piste?: string; matiere?: string } = {},
  ) =>
    anomalies.push({
      categorie,
      niveau,
      texte,
      piste: options.piste,
      matiere: options.matiere,
      matiere_label: options.matiere ? LABELS_MATIERES[options.matiere] ?? options.matiere : undefined,
    });

  // Couverture : une table ou un bucket inconnus = la page a un angle mort.
  for (const t of tablesNonCouvertes) {
    ajouter('couverture', 'attention', `Table « ${t.nom} » présente dans Supabase (${t.lignes} lignes) mais pas encore couverte par cette page.`, {
      piste: 'Me demander de l’ajouter au tableau de bord.',
    });
  }
  for (const b of bucketsNonCouverts) {
    ajouter('couverture', 'attention', `Bucket de stockage « ${b.nom} » présent dans Supabase (${b.objets} objets) mais pas encore couvert par cette page.`);
  }

  // Flux : le tapis roulant des copies.
  const maintenant = Date.now();
  const enCours = corrections.filter((c) => !STATUTS_FINAUX.includes(c.status));
  for (const c of enCours) {
    const minutes = Math.round((maintenant - new Date(c.created_at).getTime()) / 60000);
    if (minutes >= MIN_BLOCAGE_FLUX) {
      ajouter('flux', 'attention', `Copie « ${c.id.slice(0, 8)}… » bloquée en « ${c.status} » depuis ${minutes >= 2880 ? Math.round(minutes / 1440) + ' jours' : minutes >= 120 ? Math.round(minutes / 60) + ' h' : minutes + ' min'} — la chaîne s’est arrêtée sans erreur enregistrée.`, {
        matiere: c.matiere ?? undefined,
        piste: 'Relancer la transcription, ou supprimer la ligne si c’était un essai.',
      });
    }
  }
  const echecs = corrections.filter((c) => c.status.includes('failed'));
  for (const c of echecs) {
    ajouter('flux', 'bloquant', `Correction en échec (« ${c.status} ») du ${new Date(c.created_at).toLocaleDateString('fr-FR')} : ${(c.processing_error ?? 'sans message').slice(0, 140)}`, {
      matiere: c.matiere ?? undefined,
    });
  }
  const idsAvecDossier = new Set(lignesDossiers.map((d) => d.correction_id));
  const corrigeesSansDossier = corrections.filter((c) => c.status.startsWith('corrected') && !idsAvecDossier.has(c.id));
  for (const c of corrigeesSansDossier) {
    ajouter('flux', 'attention', `Copie corrigée « ${c.id.slice(0, 8)}… » sans dossier élève : l’élève n’a rien à ouvrir.`, {
      matiere: c.matiere ?? undefined,
      piste: 'Relancer generate-dossier pour cette correction.',
    });
  }
  const dossiersParCorrection = new Map<string, number>();
  for (const d of lignesDossiers) dossiersParCorrection.set(d.correction_id, (dossiersParCorrection.get(d.correction_id) ?? 0) + 1);
  const dupliques = [...dossiersParCorrection.entries()].filter(([, n]) => n > 1);
  if (dupliques.length) {
    ajouter('flux', 'attention', `${dupliques.length} correction(s) ont plusieurs dossiers élève (génération lancée deux fois) — l’élève peut recevoir deux versions.`, {
      piste: 'Supprimer les doublons les plus anciens dans la table dossiers.',
    });
  }

  // Intégrité : références cassées.
  const idsSujets = new Set(sujets.map((s) => s.id));
  const refsCassees = corrections.filter((c) => c.subject_id && !idsSujets.has(c.subject_id));
  if (refsCassees.length) {
    ajouter('flux', 'bloquant', `${refsCassees.length} correction(s) pointent vers un sujet qui n’existe plus.`);
  }

  // Préparation & calibration : mêmes règles que la vue matière (source
  // unique : lib/pipelineVerifs.ts), appliquées à toutes les matières.
  const benchParSujet = new Map<string, BenchRow[]>();
  for (const b of benchs) {
    if (!b.subject_id) continue;
    const l = benchParSujet.get(b.subject_id) ?? [];
    l.push(b);
    benchParSujet.set(b.subject_id, l);
  }
  const typesParMatiere = new Map<string, Set<string>>();
  for (const x of [...rubriques, ...sujets]) {
    if (!x.matiere) continue;
    const s = typesParMatiere.get(x.matiere) ?? new Set<string>();
    s.add(x.exercise_type);
    typesParMatiere.set(x.matiere, s);
  }
  // Un orphelin n'est rattaché à une matière que si son type d'épreuve n'existe
  // QUE dans cette matière (« dissertation » existe en français ET en SES : on
  // ne devine pas, on le signale globalement).
  const matieresPourType = new Map<string, string[]>();
  for (const [m, types] of typesParMatiere) {
    for (const t of types) matieresPourType.set(t, [...(matieresPourType.get(t) ?? []), m]);
  }
  const orphelinsGlobaux = benchs.filter((b) => !b.subject_id);
  const resumeParType = (liste: BenchRow[]) => {
    const parType = new Map<string, number>();
    for (const b of liste) parType.set(b.exercise_type, (parType.get(b.exercise_type) ?? 0) + 1);
    return [...parType.entries()].map(([t, n]) => `${t} ×${n}`).join(', ');
  };
  const nbReels = (liste: BenchRow[]) => liste.filter((b) => !(b.origin ?? '').includes('synthetic')).length;

  const orphelinsAmbigus = orphelinsGlobaux.filter((b) => (matieresPourType.get(b.exercise_type) ?? []).length > 1);
  if (orphelinsAmbigus.length) {
    const reelsN = nbReels(orphelinsAmbigus);
    ajouter(
      'calibration',
      'attention',
      `${orphelinsAmbigus.length} étalons orphelins (${resumeParType(orphelinsAmbigus)}) dont l'épreuve existe dans plusieurs matières — impossible de deviner la leur${reelsN ? ` ; ${reelsN} sont de VRAIES copies` : ''}.`,
      { piste: 'Ce sont très probablement les vraies copies de français : réaffecter leur subject_id.' },
    );
  }
  const orphelinsSansMatiere = orphelinsGlobaux.filter((b) => (matieresPourType.get(b.exercise_type) ?? []).length === 0);
  if (orphelinsSansMatiere.length) {
    const reelsN = nbReels(orphelinsSansMatiere);
    ajouter(
      'calibration',
      'attention',
      `${orphelinsSansMatiere.length} étalons orphelins (${resumeParType(orphelinsSansMatiere)}) d'épreuves qu'AUCUNE matière installée ne propose — la filière techno du français n'a ni grille ni sujet${reelsN ? ` ; ${reelsN} sont de VRAIES copies` : ''}.`,
      { piste: 'Installer le français voie techno (grille + sujets), puis réaffecter ces copies.' },
    );
  }

  for (const matiere of Object.keys(LABELS_MATIERES)) {
    const types = typesParMatiere.get(matiere);
    if (!types) continue;
    const sujetsM = sujets.filter((s) => s.matiere === matiere);
    const orphelinsM = orphelinsGlobaux.filter(
      (b) => types.has(b.exercise_type) && (matieresPourType.get(b.exercise_type) ?? []).length === 1,
    );
    const corrM = corrections.filter((c) => c.matiere === matiere);
    const struct: StructMatiere = {
      matiere,
      grilles: rubriques
        .filter((r) => r.matiere === matiere)
        .map((r) => {
          const rj = r.rubric_json ?? {};
          const somme = (rj.criteria ?? []).reduce((n, c) => n + (c.maximum_score ?? 0), 0);
          const bareme = rj.maximum_score ?? (somme > 0 ? somme : null);
          return {
            id: r.id,
            track: r.track,
            exercise_type: r.exercise_type,
            status: r.status,
            bareme_total: bareme,
            nb_criteres: (rj.criteria ?? []).length,
            nb_taxonomie: (rj.common_error_taxonomy ?? []).length,
            system_prompt_chars: (r.system_prompt ?? '').length,
            echelle_ok: echelleExpliquee(bareme, r.system_prompt ?? ''),
          };
        }),
      sujets: sujetsM.map((s) => ({
        id: s.id,
        track: s.track,
        exercise_type: s.exercise_type,
        status: s.status,
        nb_etalons: (benchParSujet.get(s.id) ?? []).length,
        source_status: s.source_status,
      })),
      gabarits: gabarits
        .filter((g) => g.matiere === matiere)
        .map((g) => ({ track: g.track, exercise_type: g.exercise_type, audience: g.audience, status: g.status })),
      etalons: sujetsM.flatMap((s) =>
        (benchParSujet.get(s.id) ?? []).map((b) => ({
          origine: (b.origin ?? '').includes('synthetic') ? ('synthetique' as const) : ('reel' as const),
          validation_status: b.validation_status,
        })),
      ),
      orphelins: orphelinsM.length,
      orphelins_reels: orphelinsM.filter((b) => !(b.origin ?? '').includes('synthetic')).length,
      corrections_total: corrM.length,
      corrections_echecs: corrM.filter((c) => c.status.includes('failed')).length,
    };
    for (const d of verifierStructureMatiere(struct)) {
      // Les échecs de flux sont déjà signalés individuellement plus haut.
      if (d.texte.includes('correction(s) en échec')) continue;
      const categorie = d.texte.includes('étalon') ? 'calibration' : 'preparation';
      ajouter(categorie, d.niveau, d.texte, { piste: d.piste, matiere });
    }
  }

  // Config : profils de transcription des matières scientifiques.
  const profilActif = (m: string) => profils.some((p) => p.matiere === m && p.status === 'active');
  for (const m of ['maths', 'physique-chimie']) {
    if (!profilActif(m)) {
      ajouter('config', 'bloquant', `Profil de transcription absent ou inactif pour ${LABELS_MATIERES[m]} : les formules seront mal lues.`, {
        matiere: m,
        piste: 'node scripts/profils-transcription.mjs --apply',
      });
    }
  }
  if (!profilActif('svt') && typesParMatiere.has('svt')) {
    ajouter('config', 'attention', 'La SVT n’a pas de profil de transcription dédié : les schémas seront lus avec le réglage générique.', { matiere: 'svt' });
  }
  if (retoursN === 0) {
    ajouter('config', 'attention', 'Aucun retour de prof relecteur enregistré, toutes matières confondues : les barèmes tournent sans validation humaine.', {
      piste: 'Envoyer les liens de relecture (bouton « copier » dans chaque vue matière).',
    });
  }

  const triees = trierDiagnostics(anomalies) as AnomalieGlobale[];
  return {
    genere_le: new Date().toISOString(),
    inventaire: {
      tables: inventaireTables,
      tables_non_couvertes: tablesNonCouvertes,
      buckets: inventaireBuckets,
      buckets_non_couverts: bucketsNonCouverts,
    },
    anomalies: triees,
    totaux: {
      bloquants: triees.filter((a) => a.niveau === 'bloquant').length,
      attentions: triees.filter((a) => a.niveau === 'attention').length,
    },
  };
}
