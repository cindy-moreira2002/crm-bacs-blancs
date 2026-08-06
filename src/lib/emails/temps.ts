/**
 * Dates et heures — tout le système raisonne en heure de Paris.
 *
 * Le serveur (Vercel) tourne en UTC et la base stocke des `timestamptz` :
 * si on calculait « 18 h la veille » naïvement, le rappel partirait à 20 h
 * en été. Ces fonctions convertissent proprement, changement d'heure inclus.
 *
 * Fonctions pures, sans accès réseau : testables hors ligne.
 */

const FUSEAU = 'Europe/Paris';

/** Décalage de Paris par rapport à UTC, en minutes, à un instant donné. */
function decalageParisMinutes(instant: Date): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSEAU,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  // `Date.UTC` appliqué aux composantes locales de Paris : l'écart avec
  // l'instant réel est exactement le décalage horaire.
  const commeUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return (commeUTC - instant.getTime()) / 60_000;
}

/** L'instant précis correspondant à une date + heure de Paris. */
export function instantParis(
  annee: number,
  mois: number,
  jour: number,
  heures = 0,
  minutes = 0,
): Date {
  const naif = Date.UTC(annee, mois - 1, jour, heures, minutes);
  // Deux passes : la première approximation suffit sauf dans l'heure exacte
  // du changement d'heure, la seconde règle ce cas.
  let dec = decalageParisMinutes(new Date(naif));
  let t = naif - dec * 60_000;
  dec = decalageParisMinutes(new Date(t));
  t = naif - dec * 60_000;
  return new Date(t);
}

/** « 2026-09-06 » + « 9h » → l'instant du début de l'épreuve. */
export function instantSession(dateISO: string, heure: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!m) return null;
  const { heures, minutes } = lireHeure(heure) ?? { heures: 9, minutes: 0 };
  return instantParis(Number(m[1]), Number(m[2]), Number(m[3]), heures, minutes);
}

/**
 * Lit les formats d'heure réellement présents en base : « 9h », « 9h00 »,
 * « 09:30 », « 9 h 30 ». Renvoie null si c'est illisible — auquel cas
 * l'appelant doit bloquer l'e-mail plutôt qu'inventer une heure.
 */
export function lireHeure(valeur: string | null | undefined): { heures: number; minutes: number } | null {
  if (!valeur) return null;
  const m = /^\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*$/i.exec(String(valeur));
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (heures > 23 || minutes > 59) return null;
  return { heures, minutes };
}

/** « 9h » → « 9 h 00 » ; « 9h30 » → « 9 h 30 ». */
export function formaterHeure(valeur: string | null | undefined): string | null {
  const h = lireHeure(valeur);
  if (!h) return null;
  return `${h.heures} h ${String(h.minutes).padStart(2, '0')}`;
}

/** Heure de connexion conseillée : X minutes avant le début. */
export function heureMoins(valeur: string | null | undefined, minutesAvant: number): string | null {
  const h = lireHeure(valeur);
  if (!h) return null;
  const total = h.heures * 60 + h.minutes - minutesAvant;
  if (total < 0) return null;
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
}

/** « 2026-09-06 » → « samedi 6 septembre 2026 ». */
export function dateLongue(dateISO: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!m) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** « 2026-09-06 » → « sam. 6 sept. ». */
export function dateCourte(dateISO: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!m) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Le jour de Paris d'un instant, au format « YYYY-MM-DD ». */
export function jourParis(instant: Date): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(instant);
}

/** Minuit (heure de Paris) du jour d'un instant donné. */
export function debutJourParis(instant: Date): Date {
  const [a, m, j] = jourParis(instant).split('-').map(Number);
  return instantParis(a, m, j, 0, 0);
}

/** Décale une date « YYYY-MM-DD » de N jours. */
export function jourDecale(dateISO: string, jours: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!m) return dateISO;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + jours * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Affichage court d'un instant, pour l'administration. */
export function instantCourt(instant: Date | string | null | undefined): string {
  if (!instant) return '—';
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
