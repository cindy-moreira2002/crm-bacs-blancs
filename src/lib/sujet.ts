/**
 * Le sujet qui accompagne une copie corrigée.
 *
 * ⚠️ SERVEUR UNIQUEMENT (lit le pipeline avec la clé service_role).
 *
 * Sans l'énoncé, une correction est illisible : un professeur relecteur ne
 * peut pas dire si une note est juste s'il ignore ce qu'on demandait, et un
 * élève relit un commentaire sur un texte qu'il n'a plus sous les yeux. Cette
 * fiche existe déjà en base (`subject_cards`) mais n'était affichée nulle part.
 *
 * Les matières ne rangent pas leurs sujets sous les mêmes clés : le français
 * écrit `instruction` et `texte_support`, les sciences `prompt`, l'HGGSP et
 * l'histoire-géo ajoutent `documents`. On normalise ici une fois pour toutes,
 * plutôt que d'écrire neuf affichages.
 */
import { pipelineDb } from '@/lib/pipeline';

export type DocumentSujet = {
  ref: string;
  nature: string | null;
  contenu: string | null;
};

export type SujetCopie = {
  id: string;
  matiere: string | null;
  exerciseType: string | null;
  /** Intitulé de l'exercice : « Contraction de texte », « Exercice 1 · … ». */
  exercice: string | null;
  /** Thème du programme. */
  theme: string | null;
  /** Domaine / champ (« Génétique et évolution »). */
  domaine: string | null;
  /** Objet du travail (œuvre, notion). */
  travail: string | null;
  /** L'énoncé lui-même — ce que l'élève avait à faire. */
  enonce: string | null;
  /** Consigne complémentaire, quand elle est distincte de l'énoncé. */
  consignes: string | null;
  presentation: string | null;
  auteur: string | null;
  annee: number | null;
  objetEtude: string | null;
  parcours: string | null;
  /** Texte à commenter / contracter / interpréter. */
  texteSupport: string | null;
  documents: DocumentSujet[];
  exigenceDocuments: string | null;
  bareme: number | null;
  /** Contraction : nombre de mots demandé et tolérance. */
  motsAttendus: number | null;
  tolerancePourcent: number | null;
  avertissement: string | null;
  /** Vrai quand la fiche annonce elle-même un gabarit d'entraînement. */
  synthetique: boolean;

  /* --- Réservé au professeur relecteur : c'est le corrigé attendu. ------- */
  pieges: string[];
  notionsAttendues: string[];
  mecanismesAttendus: string[];
  criteresParticuliers: string[];
  etapesAttendues: string[];
};

const texte = (v: unknown): string | null => {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
};

const liste = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean) : [];

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** `documents` est tantôt une liste d'objets, tantôt une liste de chaînes. */
function documents(v: unknown): DocumentSujet[] {
  if (!Array.isArray(v)) return [];
  return v.map((d, i) => {
    if (typeof d === 'string') return { ref: `Document ${i + 1}`, nature: null, contenu: d };
    const o = (d ?? {}) as Record<string, unknown>;
    return {
      ref: texte(o.ref) ?? texte(o.titre) ?? `Document ${i + 1}`,
      nature: texte(o.nature) ?? texte(o.source) ?? null,
      contenu: texte(o.contenu) ?? texte(o.texte) ?? texte(o.content) ?? null,
    };
  });
}

type LigneSujet = {
  id: string;
  matiere: string | null;
  exercise_type: string | null;
  card_json: Record<string, unknown> | null;
};

export function normaliserSujet(ligne: LigneSujet): SujetCopie {
  const c = ligne.card_json ?? {};
  const statut = texte(c.source_status) ?? '';
  return {
    id: ligne.id,
    matiere: ligne.matiere,
    exerciseType: ligne.exercise_type,
    exercice: texte(c.exercise),
    theme: texte(c.theme_title),
    domaine: texte(c.field),
    travail: texte(c.work),
    // L'ordre compte : `prompt` porte l'énoncé partout sauf en français, où
    // c'est `instruction` (contraction, essai) ou `question` (dissertation).
    enonce: texte(c.prompt) ?? texte(c.instruction) ?? texte(c.question) ?? texte(c.consignes),
    consignes:
      texte(c.prompt) || texte(c.instruction) || texte(c.question) ? texte(c.consignes) : null,
    presentation: texte(c.presentation) ?? texte(c.introductory_note),
    auteur: texte(c.author),
    annee: nombre(c.publication_year),
    objetEtude: texte(c.study_object),
    parcours: texte(c.parcours),
    texteSupport: texte(c.texte_support) ?? texte(c.source_text),
    documents: documents(c.documents),
    exigenceDocuments: texte(c.document_requirements),
    bareme: nombre(c.maximum_score),
    motsAttendus: nombre(c.target_words),
    tolerancePourcent: nombre(c.tolerance_percent),
    avertissement: texte(c.warning),
    synthetique: statut.includes('synthetic'),
    pieges: [...liste(c.pieges), ...liste(c.traps)],
    notionsAttendues: liste(c.expected_concepts),
    mecanismesAttendus: liste(c.expected_mechanisms),
    criteresParticuliers: liste(c.special_criteria),
    etapesAttendues: [...liste(c.etapes_attendues), ...liste(c.pistes_attendues)],
  };
}

/** Les fiches sujet demandées, indexées par identifiant. Jamais d'exception :
 *  un sujet manquant vaut « pas de sujet », pas une page en erreur. */
export async function chargerSujets(ids: (string | null | undefined)[]): Promise<Map<string, SujetCopie>> {
  const uniques = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const parId = new Map<string, SujetCopie>();
  if (!uniques.length) return parId;

  try {
    const { data, error } = await pipelineDb()
      .from('subject_cards')
      .select('id, matiere, exercise_type, card_json')
      .in('id', uniques);
    if (error) return parId;
    for (const ligne of (data ?? []) as LigneSujet[]) parId.set(ligne.id, normaliserSujet(ligne));
  } catch {
    return parId;
  }
  return parId;
}

/** Le sujet d'une correction donnée, en une seule fonction. */
export async function chargerSujetDeCorrection(correctionId: string): Promise<SujetCopie | null> {
  try {
    const { data, error } = await pipelineDb()
      .from('corrections')
      .select('subject_id')
      .eq('id', correctionId)
      .maybeSingle();
    if (error || !data?.subject_id) return null;
    return (await chargerSujets([data.subject_id as string])).get(data.subject_id as string) ?? null;
  } catch {
    return null;
  }
}
