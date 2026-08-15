// Sessions de bacs blancs ouvertes à l'inscription.
// Source unique partagée par le formulaire d'inscription et l'espace élève.
// Ajoute / retire des lignes ici : tout se met à jour partout.

// Deux univers : le bac (lycée) et le brevet (3e). Les Matinées du Brevet
// réutilisent toute la mécanique du bac : seules les matières et les dates changent.
export type Examen = 'bac' | 'brevet';

export type Session = {
  matiere: string;
  date: string;   // ISO 'YYYY-MM-DD'
  heure: string;
  places: number;
  examen?: Examen; // absent = bac (historique)
};

export const SESSIONS_PLATEFORME: Session[] = [
  { matiere: 'Français',        date: '2026-09-06', heure: '9h — 13h', places: 8 },
  { matiere: 'Mathématiques',   date: '2026-09-13', heure: '9h — 12h', places: 6 },
  { matiere: 'Philosophie',     date: '2026-09-20', heure: '9h — 13h', places: 10 },
  { matiere: 'Histoire-Géo',    date: '2026-09-27', heure: '9h — 13h', places: 5 },
  { matiere: 'SES',             date: '2026-10-04', heure: '9h — 12h', places: 8 },

  // ── Les Matinées du Brevet (classe de 3e) ──
  // La matière porte le suffixe « (brevet) » : aucune migration Supabase,
  // et les inscriptions restent distinctes de celles du bac partout (CRM, espace prof, copies).
  { matiere: 'Français (brevet)',      date: '2026-11-07', heure: '9h — 12h', places: 9,  examen: 'brevet' },
  { matiere: 'Mathématiques (brevet)', date: '2026-11-14', heure: '9h — 11h', places: 6,  examen: 'brevet' },
  { matiere: 'Français (brevet)',      date: '2026-11-28', heure: '9h — 12h', places: 12, examen: 'brevet' },
  { matiere: 'Mathématiques (brevet)', date: '2026-12-12', heure: '9h — 11h', places: 4,  examen: 'brevet' },
  { matiere: 'Français (brevet)',      date: '2027-01-16', heure: '9h — 12h', places: 15, examen: 'brevet' },
  { matiere: 'Mathématiques (brevet)', date: '2027-01-30', heure: '9h — 11h', places: 15, examen: 'brevet' },
];

// Matières qu'un prof peut déclarer enseigner à la candidature.
// Volontairement plus large que SESSIONS_PLATEFORME : on veut pouvoir recruter
// un prof de SVT avant d'avoir ouvert le premier bac blanc de SVT.
export const MATIERES_ENSEIGNEES: string[] = [
  'Français',
  'Philosophie',
  'Mathématiques',
  'Histoire-Géo',
  'SES',
  'HGGSP',
  'HLP',
  'SVT',
  'Physique-Chimie',
  'Anglais',
  'Français (brevet)',
  'Mathématiques (brevet)',
];

// Examen auquel se rattache une matière (déduit du libellé : pas de colonne en base).
export function examenDeMatiere(matiere: string): Examen {
  return /\(brevet\)/i.test(matiere) ? 'brevet' : 'bac';
}

// Libellé d'affichage : « Français (brevet) » → « Français » quand on est déjà dans l'univers brevet.
export function libelleMatiere(matiere: string): string {
  return matiere.replace(/\s*\(brevet\)\s*$/i, '');
}

// Matières qui ont au moins une session à venir (pour le menu déroulant).
// `examen` restreint à un univers ; sans argument, on renvoie tout.
// `liste` : les sessions réellement en base quand on les a chargées.
export function matieresDisponibles(
  examen?: Examen,
  ref: Date = new Date(),
  liste: Session[] = SESSIONS_PLATEFORME,
): string[] {
  const today = new Date(ref); today.setHours(0, 0, 0, 0);
  const set = new Set<string>();
  for (const s of liste) {
    if (new Date(s.date) < today) continue;
    if (examen && examenDeMatiere(s.matiere) !== examen) continue;
    set.add(s.matiere);
  }
  return [...set];
}

// Sessions à venir d'une matière, triées par date croissante.
export function sessionsPourMatiere(
  matiere: string,
  ref: Date = new Date(),
  liste: Session[] = SESSIONS_PLATEFORME,
): Session[] {
  const today = new Date(ref); today.setHours(0, 0, 0, 0);
  return liste
    .filter(s => s.matiere === matiere && new Date(s.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Les sessions telles qu'elles sont EN BASE, pour un composant client.
 *
 * `SESSIONS_PLATEFORME` reste le filet de secours : si l'appel échoue (Supabase
 * indisponible), le formulaire d'inscription propose encore des dates plutôt
 * qu'un menu vide. La vérité, elle, est dans `sessions_bacs_blancs` : c'est là
 * qu'écrit /admin/bacs-blancs, et c'est ce que lit `/api/sessions`.
 */
export async function chargerSessionsPubliques(): Promise<Session[]> {
  try {
    const r = await fetch('/api/sessions', { cache: 'no-store' });
    if (!r.ok) return SESSIONS_PLATEFORME;
    const d = (await r.json()) as { sessions?: Session[] };
    return Array.isArray(d.sessions) && d.sessions.length ? d.sessions : SESSIONS_PLATEFORME;
  } catch {
    return SESSIONS_PLATEFORME;
  }
}

// Libellé lisible d'une date de session : "sam. 6 sept. · 9h — 13h · 8 places"
export function labelSession(s: Session): string {
  const d = new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${d} · ${s.heure} · ${s.places} places`;
}
