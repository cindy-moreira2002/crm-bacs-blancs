// Sessions de bacs blancs ouvertes à l'inscription.
// Source unique partagée par le formulaire d'inscription et l'espace élève.
// Ajoute / retire des lignes ici : tout se met à jour partout.

export type Session = {
  matiere: string;
  date: string;   // ISO 'YYYY-MM-DD'
  heure: string;
  places: number;
};

export const SESSIONS_PLATEFORME: Session[] = [
  { matiere: 'Français',        date: '2026-09-06', heure: '9h — 13h', places: 8 },
  { matiere: 'Mathématiques',   date: '2026-09-13', heure: '9h — 12h', places: 6 },
  { matiere: 'Philosophie',     date: '2026-09-20', heure: '9h — 13h', places: 10 },
  { matiere: 'Histoire-Géo',    date: '2026-09-27', heure: '9h — 13h', places: 5 },
  { matiere: 'SES',             date: '2026-10-04', heure: '9h — 12h', places: 8 },
];

// Matières qui ont au moins une session à venir (pour le menu déroulant).
export function matieresDisponibles(ref: Date = new Date()): string[] {
  const today = new Date(ref); today.setHours(0, 0, 0, 0);
  const set = new Set<string>();
  for (const s of SESSIONS_PLATEFORME) {
    if (new Date(s.date) >= today) set.add(s.matiere);
  }
  return [...set];
}

// Sessions à venir d'une matière, triées par date croissante.
export function sessionsPourMatiere(matiere: string, ref: Date = new Date()): Session[] {
  const today = new Date(ref); today.setHours(0, 0, 0, 0);
  return SESSIONS_PLATEFORME
    .filter(s => s.matiere === matiere && new Date(s.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Libellé lisible d'une date de session : "sam. 6 sept. · 9h — 13h · 8 places"
export function labelSession(s: Session): string {
  const d = new Date(s.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${d} · ${s.heure} · ${s.places} places`;
}
