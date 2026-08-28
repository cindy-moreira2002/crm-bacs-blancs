/**
 * Le classeur de correction d'UN bac blanc.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Le professeur ne corrige plus dans le classeur commun de sa matière : il
 * corrige dans SA COPIE, intitulée
 *   « Bac blanc — Mathématiques — 14 novembre 2026 — Léa Dupont ».
 *
 * Pourquoi une copie plutôt que le classeur commun : deux bacs blancs de la
 * même matière écrivaient dans les mêmes cases, et une correction contestée
 * trois mois plus tard était introuvable. Une copie datée et nommée règle les
 * deux d'un coup — et le classeur de la matière redevient ce qu'il est, un
 * modèle qu'on ne salit pas.
 *
 * La copie elle-même est faite par Google, pas par nous : un petit Apps Script
 * publié en application web (voir GOOGLE_APPS_SCRIPT_CLASSEURS.js) reçoit le
 * modèle et le nom voulu, duplique le fichier dans le Drive des Matinées,
 * partage la copie avec le professeur, et rend son adresse. C'est le même
 * mécanisme que le suivi des profs (lib/sheetProfs.ts) : aucune identification
 * Google à gérer dans le CRM, et un seul endroit où le Drive est touché.
 */
import { crmAdmin } from '@/lib/authProf';
import type { Professeur } from '@/lib/authProf';

const WEBAPP = process.env.CLASSEURS_WEBAPP_URL ?? '';
const TOKEN = process.env.CLASSEURS_WEBAPP_TOKEN ?? '';

/** Sans ces deux variables, le bouton explique au lieu d'échouer. */
export function copieClasseurConfiguree(): boolean {
  return Boolean(WEBAPP && TOKEN);
}

export type ClasseurCorrection = {
  id: string;
  session_id: string;
  professeur_id: string | null;
  matiere: string;
  date_epreuve: string | null;
  professeur_nom: string | null;
  nom: string;
  url: string;
  cree_le: string;
};

/** Une table absente (script 52 pas encore passé) ne doit rien casser. */
function tableAbsente(message: string | undefined): boolean {
  return /classeurs_correction/.test(message ?? '') || /PGRST205/.test(message ?? '');
}

/**
 * Le nom du classeur — c'est lui qu'on lira dans le Drive, des mois après.
 * Trois informations, toujours dans le même ordre : quoi, quand, qui.
 */
export function nomClasseur(matiere: string, dateIso: string, profNom: string): string {
  const date = new Date(dateIso + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `Bac blanc — ${matiere} — ${date} — ${profNom}`.slice(0, 150);
}

/** Le classeur de ce prof pour ce bac blanc, ou null. */
export async function classeurDuProf(
  sessionId: string,
  professeurId: string,
): Promise<ClasseurCorrection | null> {
  const { data, error } = await crmAdmin()
    .from('classeurs_correction')
    .select('*')
    .eq('session_id', sessionId)
    .eq('professeur_id', professeurId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as ClasseurCorrection;
}

/** Tous les classeurs d'un bac blanc — il peut y avoir plusieurs coachs. */
export async function classeursDeLaSession(sessionId: string): Promise<ClasseurCorrection[]> {
  const { data, error } = await crmAdmin()
    .from('classeurs_correction')
    .select('*')
    .eq('session_id', sessionId)
    .order('cree_le', { ascending: true });

  if (error || !data) return [];
  return data as unknown as ClasseurCorrection[];
}

/** L'archive complète, la plus récente d'abord — pour l'administration. */
export async function archiveClasseurs(limite = 200): Promise<ClasseurCorrection[]> {
  const { data, error } = await crmAdmin()
    .from('classeurs_correction')
    .select('*')
    .order('cree_le', { ascending: false })
    .limit(limite);

  if (error || !data) return [];
  return data as unknown as ClasseurCorrection[];
}

export type ResultatClasseur =
  | { ok: true; classeur: ClasseurCorrection; deja: boolean }
  | { ok: false; erreur: string };

/**
 * Crée (ou retrouve) le classeur d'un prof pour un bac blanc.
 *
 * Trois garde-fous, dans cet ordre :
 *   1. si le classeur existe déjà, on le rend sans rien dupliquer ;
 *   2. sans modèle pour la matière, on refuse plutôt que de créer un fichier
 *      vide qui ne servirait à personne ;
 *   3. sans Apps Script configuré, on le dit — et la console continue d'ouvrir
 *      le classeur commun de la matière, comme avant.
 */
export async function creerClasseur(options: {
  session: { id: string; matiere: string; date_epreuve: string };
  prof: Professeur;
  /** Le classeur de la matière : c'est lui qu'on duplique. */
  modeleUrl: string | null;
}): Promise<ResultatClasseur> {
  const { session, prof, modeleUrl } = options;

  const existant = await classeurDuProf(session.id, prof.id);
  if (existant) return { ok: true, classeur: existant, deja: true };

  if (!modeleUrl) {
    return {
      ok: false,
      erreur:
        'Cette matière n’a pas encore de classeur de correction : il n’y a rien à copier.',
    };
  }
  if (!copieClasseurConfiguree()) {
    return {
      ok: false,
      erreur:
        'La copie automatique n’est pas branchée (variables CLASSEURS_WEBAPP_URL et CLASSEURS_WEBAPP_TOKEN). Voir GUIDE_CONSOLE_PROF.md.',
    };
  }

  const nom = nomClasseur(session.matiere, session.date_epreuve, `${prof.prenom} ${prof.nom}`);

  let url: string;
  try {
    const reponse = await fetch(WEBAPP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'copier',
        token: TOKEN,
        modele_url: modeleUrl,
        nom,
        // Le prof reçoit le droit d'écrire : sans partage, il ouvrirait la copie
        // et lirait « Demander l'accès » le matin de l'épreuve.
        partager_avec: prof.email,
      }),
      // Une copie Drive prend quelques secondes ; au-delà, on renonce plutôt
      // que de laisser la console tourner dans le vide.
      signal: AbortSignal.timeout(25_000),
    });

    const corps = (await reponse.json().catch(() => null)) as
      | { ok?: boolean; url?: string; erreur?: string }
      | null;

    if (!reponse.ok || !corps?.ok || !corps.url) {
      return { ok: false, erreur: corps?.erreur ?? `Google a refusé la copie (${reponse.status}).` };
    }
    url = corps.url;
  } catch (err) {
    console.error('❌ Copie du classeur', err);
    return { ok: false, erreur: 'Google n’a pas répondu. Réessaie dans un instant.' };
  }

  const db = crmAdmin();
  const { data, error } = await db
    .from('classeurs_correction')
    .insert({
      session_id: session.id,
      professeur_id: prof.id,
      matiere: session.matiere,
      date_epreuve: session.date_epreuve,
      professeur_nom: `${prof.prenom} ${prof.nom}`,
      nom,
      url,
    })
    .select()
    .single();

  if (error) {
    // Le fichier existe dans le Drive : on rend quand même son adresse, sinon
    // le prof aurait une copie qu'il ne pourrait pas ouvrir.
    console.error('⚠️ Classeur créé mais non archivé :', error.message);
    return {
      ok: false,
      erreur: tableAbsente(error.message)
        ? `Classeur créé (${url}) mais l’archive n’existe pas encore : le script SQL 52 n’a pas été passé.`
        : `Classeur créé (${url}) mais non archivé : ${error.message}`,
    };
  }

  // La session pointe désormais sur cette copie : c'est ce qui la fait gagner
  // sur le classeur commun dans toute la console (voir lib/espaceProf).
  const { error: majSession } = await db
    .from('sessions_bacs_blancs')
    .update({ sheet_correction_url: url })
    .eq('id', session.id)
    .is('sheet_correction_url', null);
  if (majSession) console.error('⚠️ Session non mise à jour :', majSession.message);

  return { ok: true, classeur: data as unknown as ClasseurCorrection, deja: false };
}

/**
 * Les classeurs de CE professeur, rangés par bac blanc.
 *
 * Une seule requête pour tout l'espace prof : la console affiche une carte par
 * session, et chacune doit savoir si son classeur existe déjà. Les interroger
 * une par une multiplierait les allers-retours sans rien apporter.
 */
export async function classeursDuProf(
  professeurId: string,
): Promise<Map<string, { url: string; nom: string }>> {
  const { data, error } = await crmAdmin()
    .from('classeurs_correction')
    .select('session_id, url, nom')
    .eq('professeur_id', professeurId);

  // Script 52 pas encore passé : l'espace prof s'ouvre quand même, et le
  // professeur retombe sur le classeur commun de sa matière.
  if (error || !data) return new Map();

  return new Map(
    (data as { session_id: string; url: string; nom: string }[]).map((c) => [
      c.session_id,
      { url: c.url, nom: c.nom },
    ]),
  );
}
