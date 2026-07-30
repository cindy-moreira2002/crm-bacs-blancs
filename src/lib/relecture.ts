/**
 * Dossier de relecture prof — accès et chargement des données.
 *
 * ⚠️ SERVEUR UNIQUEMENT. Ce module lit la clé service_role du pipeline via
 * pipelineDb() ; il n'est importé que par des composants serveur et des
 * routes /api. Le prof relecteur n'a aucune clé : il reçoit un lien signé.
 *
 * Le lien est signé avec PIPELINE_INTERNAL_SECRET (déjà présent en prod pour
 * les Edge Functions) : aucun nouveau secret à poser sur Vercel. Le jeton ne
 * révèle rien du secret (HMAC), il rend simplement l'URL non devinable.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { baremeGrille, pipelineDb } from '@/lib/pipeline';

const secret = process.env.PIPELINE_INTERNAL_SECRET ?? '';

/** Jeton d'accès au dossier de relecture d'une matière (20 hex, stable). */
export function jetonRelecture(matiere: string): string {
  return createHmac('sha256', secret)
    .update(`relecture-prof:${matiere.toLowerCase().trim()}`)
    .digest('hex')
    .slice(0, 20);
}

export function jetonRelectureValide(matiere: string, jeton: string | undefined): boolean {
  if (!secret || !jeton) return false;
  const attendu = Buffer.from(jetonRelecture(matiere));
  const recu = Buffer.from(String(jeton));
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

/* ------------------------------------------------------------------ */
/*  Types minimaux des données lues (colonnes réellement utilisées).  */
/* ------------------------------------------------------------------ */

export type CritereGrille = {
  code: string;
  name: string;
  description: string;
  maximum_score: number;
  /** Absent sur certaines grilles (ex. dissertation français) : seuls code,
   *  intitulé et plafond sont alors définis. */
  levels?: Record<string, string>;
};

export type Grille = {
  id: string;
  exercise_type: string;
  status: string;
  version: number | string;
  system_prompt: string | null;
  rubric_json: {
    criteria: CritereGrille[];
    principle?: string;
    guardrails?: string[];
    maximum_score?: number;
    /** Taxonomie d'erreurs propre à la matière (toutes sauf le français). */
    common_error_taxonomy?: {
      code: string;
      description?: string;
      severity?: string;
      category?: string;
      /** Code du critère concerné, tel qu'il figure dans criteria[]. */
      criterion?: string;
    }[];
  };
};

export type EntreeTaxonomie = {
  code: string;
  /** major | moderate | minor — absent sur la taxonomie français. */
  severite?: string;
  exercise_type: string;
  definition: string;
  signals: string;
  affected_criteria: string[];
};

export type PreuveCritere = { page?: number; quote: string; explanation: string };

export type CritereCorrige = {
  code: string;
  name: string;
  score: number;
  maximum: number;
  justification: string;
  improvement?: string;
  evidence?: PreuveCritere[];
};

export type ErreurDetectee = {
  code: string;
  severity?: string;
  evidence?: string;
  impact?: string;
};

export type ExempleCorrige = {
  correctionId: string;
  exerciseType: string;
  noteFinale: number;
  /** Barème de l'épreuve : toutes ne valent pas 20 points. */
  bareme: number;
  confidence?: number;
  criteria: CritereCorrige[];
  detectedErrors: ErreurDetectee[];
  pointsForts: string[];
  priorites: string[];
  appreciation: string;
  pagesCopie: string[];
};

export type DonneesRelecture = {
  matiere: string;
  grilles: Grille[];
  taxonomie: EntreeTaxonomie[];
  exemple: ExempleCorrige | null;
  /** Autres corrections consultables (dossier élève), ex. la dissertation. */
  autresExemples: { correctionId: string; exerciseType: string; noteFinale: number; bareme: number }[];
};

/**
 * Erreurs types de la matière.
 *
 * Depuis SES, chaque matière porte SA taxonomie dans
 * rubric_json.common_error_taxonomy. La table error_taxonomy, elle, n'a pas de
 * colonne matière et ne contient que le français — dont deux entrées rangées
 * sous l'exercice « tous ». L'interroger pour une autre matière montrerait au
 * professeur relecteur des codes de français présentés comme les siens.
 * On lit donc les grilles en premier, et on ne retombe sur la table que pour
 * les matières qui n'ont pas de taxonomie dans leur grille (le français).
 */
async function chargerTaxonomie(
  db: ReturnType<typeof pipelineDb>,
  grilles: Grille[],
  exercices: string[],
): Promise<EntreeTaxonomie[]> {
  const depuisGrilles: EntreeTaxonomie[] = [];
  for (const grille of grilles) {
    const codes = grille.rubric_json.common_error_taxonomy ?? [];
    const nomCritere = new Map(grille.rubric_json.criteria.map((c) => [c.code, c.name]));
    for (const e of codes) {
      // Un code peut viser un critère absent de CETTE grille (le même code sert
      // à plusieurs exercices) : on n'affiche alors aucun critère plutôt qu'un
      // sigle que le professeur ne peut pas rattacher au barème qu'il relit.
      const critere = e.criterion ? nomCritere.get(e.criterion) : undefined;
      depuisGrilles.push({
        code: e.code,
        exercise_type: grille.exercise_type,
        definition: e.description ?? '',
        signals: '',
        severite: e.severity,
        affected_criteria: critere ? [critere] : [],
      });
    }
  }
  if (depuisGrilles.length) return depuisGrilles;

  const { data, error } = await db
    .from('error_taxonomy')
    .select('code, exercise_type, definition, signals, affected_criteria')
    .in('exercise_type', [...exercices, 'tous'])
    .order('exercise_type')
    .order('code');
  if (error) throw new Error(`Lecture de la taxonomie : ${error.message}`);
  return data ?? [];
}

/**
 * Charge tout ce que le dossier de relecture affiche pour une matière :
 * grilles, taxonomie des exercices concernés, et une copie corrigée réelle.
 */
export async function chargerDonneesRelecture(matiere: string): Promise<DonneesRelecture | null> {
  const db = pipelineDb();

  const { data: grilles, error: errGrilles } = await db
    .from('rubrics')
    .select('id, exercise_type, status, version, system_prompt, rubric_json')
    .eq('matiere', matiere)
    .in('status', ['active', 'draft'])
    .order('exercise_type');
  if (errGrilles) throw new Error(`Lecture des grilles : ${errGrilles.message}`);
  if (!grilles?.length) return null;

  const exercices = grilles.map((g) => g.exercise_type);
  const taxonomie = await chargerTaxonomie(db, grilles as Grille[], exercices);

  // Sujets de la matière → corrections abouties sur ces sujets.
  const { data: sujets } = await db.from('subject_cards').select('id').eq('matiere', matiere);
  const sujetIds = (sujets ?? []).map((s) => s.id);

  let exemple: ExempleCorrige | null = null;
  const autresExemples: DonneesRelecture['autresExemples'] = [];

  if (sujetIds.length) {
    const { data: corrections } = await db
      .from('corrections')
      .select('id, exercise_type, status, result_json')
      .in('subject_id', sujetIds)
      .in('status', ['corrected', 'dossier_ready'])
      .not('result_json', 'is', null)
      .order('created_at', { ascending: false });

    // Une copie détaillée par matière ; les autres exercices en simple lien.
    const dejaVus = new Set<string>();
    for (const c of corrections ?? []) {
      const rj = c.result_json as Record<string, unknown>;
      if (typeof rj?.note_finale !== 'number' || dejaVus.has(c.exercise_type)) continue;
      dejaVus.add(c.exercise_type);
      // La note du moteur est à l'échelle de la grille de SON exercice.
      const grille = grilles.find((g) => g.exercise_type === c.exercise_type);
      const bareme = baremeGrille(grille?.rubric_json);
      if (!exemple) {
        exemple = {
          correctionId: c.id,
          exerciseType: c.exercise_type,
          noteFinale: rj.note_finale as number,
          bareme,
          confidence: rj.confidence as number | undefined,
          criteria: (rj.criteria as CritereCorrige[]) ?? [],
          detectedErrors: (rj.detected_errors as ErreurDetectee[]) ?? [],
          pointsForts: (rj.points_forts as string[]) ?? [],
          priorites: (rj.priorites_amelioration as string[]) ?? [],
          appreciation: (rj.appreciation_generale as string) ?? '',
          pagesCopie: [],
        };
      } else {
        autresExemples.push({
          correctionId: c.id,
          exerciseType: c.exercise_type,
          noteFinale: rj.note_finale as number,
          bareme,
        });
      }
    }
  }

  if (exemple) {
    const { data: transcriptions } = await db
      .from('copy_transcriptions')
      .select('transcription_json')
      .eq('correction_id', exemple.correctionId)
      .limit(1);
    const pages = (transcriptions?.[0]?.transcription_json as { pages?: { text?: string }[] } | undefined)?.pages;
    exemple.pagesCopie = (pages ?? []).map((p) => p.text ?? '').filter(Boolean);
  }

  return { matiere, grilles: grilles as Grille[], taxonomie: taxonomie ?? [], exemple, autresExemples };
}
