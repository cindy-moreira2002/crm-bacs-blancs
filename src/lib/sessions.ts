// Sessions de bacs blancs ouvertes à l'inscription.
// Source unique partagée par le formulaire d'inscription et l'espace élève.
// Ajoute / retire des lignes ici : tout se met à jour partout.

// Deux univers : le bac (lycée) et le brevet (3e). Les Matinées du Brevet
// réutilisent toute la mécanique du bac : seules les matières et les dates changent.
export type Examen = 'bac' | 'brevet';

/**
 * L'INTERRUPTEUR DU BREVET.
 *
 * `false` : le brevet n'existe plus pour personne — ni sur le site, ni dans
 * l'espace élève, ni dans l'espace prof, ni dans la Direction. Les moteurs de
 * correction du DNB, leurs tables Supabase et leurs écrans restent en place,
 * simplement inaccessibles : le jour où on relance les Matinées du Brevet,
 * il suffit de repasser cette ligne à `true`.
 *
 * C'est le SEUL endroit à modifier. Tout ce qui parle du brevet ailleurs dans
 * l'application passe par cette constante.
 */
// Type `boolean` écrit à la main, et non déduit : sans lui TypeScript fige la
// valeur à `false` et déclare « mort » tout le code du brevet — or ce code doit
// rester vivant et compilé, prêt pour le jour où on remet le brevet.
export const BREVET_ACTIF: boolean = false;

/**
 * Retire les sessions de brevet d'une liste tant que le brevet est éteint.
 * Les sessions arrivent aussi de Supabase (`/api/sessions`) : filtrer la seule
 * liste écrite en dur ne suffirait pas.
 */
export function sansBrevet<T extends { matiere: string }>(liste: T[]): T[] {
  return BREVET_ACTIF ? liste : liste.filter((s) => examenDeMatiere(s.matiere) === 'bac');
}

export type Session = {
  matiere: string;
  date: string;   // ISO 'YYYY-MM-DD'
  heure: string;
  places: number;
  examen?: Examen; // absent = bac (historique)
};

const TOUTES_LES_SESSIONS: Session[] = [
  { matiere: 'Français',        date: '2026-09-06', heure: '9h — 13h', places: 8 },
  { matiere: 'Mathématiques',   date: '2026-09-13', heure: '9h — 12h', places: 6 },
  { matiere: 'Philosophie',     date: '2026-09-20', heure: '9h — 13h', places: 10 },
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

// Ce que le site propose vraiment. Tant que `BREVET_ACTIF` est à `false`,
// les six lignes de brevet ci-dessus n'en sortent jamais.
export const SESSIONS_PLATEFORME: Session[] = sansBrevet(TOUTES_LES_SESSIONS);

// Matières qu'un prof peut déclarer enseigner à la candidature.
// Volontairement plus large que SESSIONS_PLATEFORME : on veut pouvoir recruter
// un prof de SVT avant d'avoir ouvert le premier bac blanc de SVT.
const TOUTES_LES_MATIERES_ENSEIGNEES: string[] = [
  'Français',
  'Philosophie',
  'Mathématiques',
  'SES',
  'HGGSP',
  'HLP',
  'SVT',
  'Physique-Chimie',
  'Anglais',
  'Français (brevet)',
  'Mathématiques (brevet)',
];

export const MATIERES_ENSEIGNEES: string[] = BREVET_ACTIF
  ? TOUTES_LES_MATIERES_ENSEIGNEES
  : TOUTES_LES_MATIERES_ENSEIGNEES.filter((m) => examenDeMatiere(m) === 'bac');

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
  for (const s of sansBrevet(liste)) {
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
  return sansBrevet(liste)
    .filter(s => s.matiere === matiere && new Date(s.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Les sessions telles qu'elles sont EN BASE, pour un composant client.
 *
 * `SESSIONS_PLATEFORME` reste le filet de secours : si l'appel échoue (Supabase
 * indisponible), le formulaire d'inscription propose encore des dates plutôt
 * qu'un menu vide. La vérité, elle, est dans `sessions_bacs_blancs` : c'est là
 * qu'écrit /direction/bacs-blancs, et c'est ce que lit `/api/sessions`.
 */
export async function chargerSessionsPubliques(): Promise<Session[]> {
  try {
    const r = await fetch('/api/sessions', { cache: 'no-store' });
    if (!r.ok) return SESSIONS_PLATEFORME;
    const d = (await r.json()) as { sessions?: Session[] };
    const enBase = Array.isArray(d.sessions) ? sansBrevet(d.sessions) : [];
    return enBase.length ? enBase : SESSIONS_PLATEFORME;
  } catch {
    return SESSIONS_PLATEFORME;
  }
}

// Libellé lisible d'une date de session : "sam. 6 sept. · 9h — 13h · 8 places"
export function labelSession(s: Session): string {
  const d = new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${d} · ${s.heure} · ${s.places} places`;
}
