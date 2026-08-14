/**
 * Les données métier vues par le système d'e-mails.
 *
 * Deux parties bien séparées :
 *  - des **types et des fonctions pures** (construction des variables d'un
 *    message à partir d'une ligne réelle) — testables hors ligne ;
 *  - un **chargeur** qui va lire Supabase.
 *
 * Les noms de colonnes utilisés ici correspondent exactement au schéma
 * vérifié en base : inscriptions, sessions_bacs_blancs, professeurs,
 * session_coachs, copies, preinscriptions.
 */
import { emailsDb } from './client';
import {
  SUPPORT_EMAIL,
  SITE_URL,
  URL_ESPACE_ELEVE,
  URL_ESPACE_PROF,
  URL_INSCRIPTION,
} from './config';
import { lienSalon } from '@/lib/discord/config';
import { dateCourte, dateLongue, formaterHeure, heureMoins } from './temps';
import type { Variables } from './modeles';

// --- Types des lignes -------------------------------------------------

export type LigneInscription = {
  id: string;
  nom: string | null;
  email: string | null;
  email_parent: string | null;
  matiere: string | null;
  date_epreuve: string | null;
  session_id: string | null;
  created_at: string;
  email_envoye: boolean | null;
  rappel_j1_envoye: boolean | null;
  rappel_h1_envoye: boolean | null;
  statut_eleve: string | null;
  paiement_statut: string | null;
  paiement_montant: number | null;
  paiement_reference: string | null;
  paiement_confirme_le: string | null;
  presence: string | null;
  copie_recue: boolean | null;
  correction_publiee_le: string | null;
  annulee_le: string | null;
  /** La salle Discord attribuée à cet élève. Sans elle, aucun lien n'est envoyé. */
  discord_salon_id: string | null;
};

export type LigneSession = {
  id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  heure_fin: string | null;
  places: number | null;
  statut: string | null;
  annulee_le: string | null;
  derniere_notif_empreinte: string | null;
};

export type LigneProf = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  matieres: string[] | null;
  statut_compte: string | null;
};

export type LigneCoach = {
  session_id: string;
  professeur_id: string;
  statut: string;
  remuneration: number | null;
  created_at: string;
};

export type LigneCopie = {
  id: string;
  matiere: string | null;
  eleve_nom: string | null;
  eleve_email: string | null;
  statut: string | null;
  pdf_pret: boolean | null;
  envoye: boolean | null;
  created_at: string;
};

export type LignePreinscription = {
  id: string;
  prenom: string;
  nom: string | null;
  email: string;
  matiere: string | null;
  session_libelle: string | null;
  session_id: string | null;
  statut: string;
  consentement_marketing: boolean;
  inscription_id: string | null;
  created_at: string;
};

export const CHAMPS_INSCRIPTION =
  'id, nom, email, email_parent, matiere, date_epreuve, session_id, created_at, ' +
  'email_envoye, rappel_j1_envoye, rappel_h1_envoye, statut_eleve, paiement_statut, ' +
  'paiement_montant, paiement_reference, paiement_confirme_le, presence, copie_recue, ' +
  'correction_publiee_le, annulee_le, discord_salon_id';

export const CHAMPS_SESSION =
  'id, matiere, date_epreuve, heure_debut, heure_fin, places, statut, annulee_le, derniere_notif_empreinte';

// --- Petites aides ----------------------------------------------------

/** « Léa Martin » → « Léa ». Le prénom seul, c'est plus chaleureux. */
export function prenomDe(nomComplet: string | null | undefined): string {
  const propre = String(nomComplet ?? '').trim().replace(/\s+/g, ' ');
  if (!propre) return '';
  return propre.split(' ')[0];
}

/** Une session est-elle annulée ? */
export function sessionAnnulee(s: LigneSession | null | undefined): boolean {
  return Boolean(s && (s.statut === 'annulee' || s.annulee_le));
}

/**
 * Empreinte des informations qui, si elles changent, méritent de prévenir
 * les élèves : la date et les horaires. Un changement de nombre de places
 * n'envoie pas d'e-mail.
 */
export function empreinteSession(s: LigneSession): string {
  return [
    s.date_epreuve,
    s.heure_debut ?? '',
    s.heure_fin ?? '',
    sessionAnnulee(s) ? 'annulee' : 'active',
  ].join('|');
}

/** Relit une empreinte mémorisée pour retrouver l'ancien libellé. */
export function lireEmpreinte(
  empreinte: string | null | undefined,
): { date_epreuve: string; heure_debut: string | null } | null {
  if (!empreinte) return null;
  const [date, debut] = String(empreinte).split('|');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
  return { date_epreuve: date, heure_debut: debut || null };
}

/** Libellé lisible d'une session, pour les e-mails de changement. */
export function libelleSession(s: {
  date_epreuve: string;
  heure_debut: string | null;
}): string {
  const d = dateLongue(s.date_epreuve) ?? s.date_epreuve;
  const h = formaterHeure(s.heure_debut);
  return h ? `${d} à ${h}` : d;
}

// --- Variables d'un message élève ------------------------------------

export type ContexteEleve = {
  inscription: LigneInscription;
  session: LigneSession | null;
  /** Minutes de battement conseillées avant le début. */
  minutesAvance?: number;
  /** Réglages utiles au contenu. */
  instructionsPaiement?: string;
  montantDefaut?: string;
  lienAvis?: string;
  /** Pour les e-mails de changement. */
  ancienneValeur?: string;
  nouvelleValeur?: string;
  motif?: string;
};

/**
 * Construit les variables d'un e-mail élève à partir des données réelles.
 *
 * Le lien de visioconférence est TOUJOURS recalculé à partir de
 * l'identifiant de CETTE inscription : il est donc impossible d'envoyer à
 * un élève le salon d'un autre. Il n'est fourni que si la session existe et
 * n'est pas annulée.
 */
export function variablesEleve(c: ContexteEleve): Variables {
  const i = c.inscription;
  const s = c.session;
  const date = s?.date_epreuve ?? i.date_epreuve ?? '';
  const heure = s?.heure_debut ?? null;
  const avance = c.minutesAvance ?? 15;

  const v: Variables = {
    first_name: prenomDe(i.nom) || 'à toi',
    student_name: (i.nom ?? '').trim(),
    subject_name: (s?.matiere ?? i.matiere ?? '').trim(),
    student_space_url: URL_ESPACE_ELEVE,
    correction_url: URL_ESPACE_ELEVE,
    inscription_url: URL_INSCRIPTION,
    site_url: SITE_URL,
    support_email: SUPPORT_EMAIL,
    inscription_ref: i.id.slice(0, 8).toUpperCase(),
    payment_status: i.paiement_statut ?? 'en_attente',
    payment_status_label: libellePaiement(i.paiement_statut),
  };

  if (date) {
    v.session_date = dateLongue(date) ?? date;
    v.session_date_court = dateCourte(date) ?? date;
    v.session_date_iso = date;
  }
  const hFormat = formaterHeure(heure);
  if (hFormat) {
    v.start_time = hFormat;
    const connexion = heureMoins(heure, avance);
    if (connexion) v.connection_time = connexion;
  }
  const fin = formaterHeure(s?.heure_fin ?? null);
  if (fin) v.end_time = fin;

  // Le salon de l'élève, c'est sa salle Discord — et uniquement celle qui lui
  // a été attribuée en base. On ne fabrique plus d'adresse à partir de son
  // identifiant : tant que la salle n'existe pas, il n'y a pas de lien, le
  // message part en « bloqué » et personne ne reçoit une porte fermée.
  const salon = lienSalon(i.discord_salon_id);
  if (date && !sessionAnnulee(s) && salon) v.video_room_url = salon;

  if (i.paiement_montant != null) v.amount = String(i.paiement_montant);
  else if (c.montantDefaut) v.amount = c.montantDefaut;
  if (i.paiement_reference) v.payment_reference = i.paiement_reference;
  if (c.instructionsPaiement) v.payment_instructions = c.instructionsPaiement;
  if (c.lienAvis) v.survey_url = c.lienAvis;
  if (c.ancienneValeur) v.old_value = c.ancienneValeur;
  if (c.nouvelleValeur) v.new_value = c.nouvelleValeur;
  if (c.motif) v.change_reason = c.motif;

  return v;
}

function libellePaiement(statut: string | null | undefined): string {
  switch (statut) {
    case 'paye':
      return 'réglé';
    case 'offert':
      return 'offert';
    case 'rembourse':
      return 'remboursé';
    case 'annule':
      return 'annulé';
    default:
      return 'en attente';
  }
}

// --- Variables d'un message prof --------------------------------------

export type ContexteProf = {
  prof: LigneProf;
  session: LigneSession | null;
  nbEleves?: number;
  nbCopies?: number;
  remuneration?: number | null;
  echeance?: string | null;
  ancienneValeur?: string;
  nouvelleValeur?: string;
  motif?: string;
};

export function variablesProf(c: ContexteProf): Variables {
  const s = c.session;
  const v: Variables = {
    first_name: (c.prof.prenom ?? '').trim() || prenomDe(c.prof.nom) || 'à toi',
    teacher_name: [c.prof.prenom, c.prof.nom].filter(Boolean).join(' ').trim(),
    subject_name: (s?.matiere ?? '').trim(),
    teacher_space_url: URL_ESPACE_PROF,
    site_url: SITE_URL,
    support_email: SUPPORT_EMAIL,
  };

  if (s?.date_epreuve) {
    v.session_date = dateLongue(s.date_epreuve) ?? s.date_epreuve;
    v.session_date_court = dateCourte(s.date_epreuve) ?? s.date_epreuve;
    v.session_date_iso = s.date_epreuve;
  }
  const h = formaterHeure(s?.heure_debut ?? null);
  if (h) {
    v.start_time = h;
    const connexion = heureMoins(s?.heure_debut ?? null, 15);
    if (connexion) v.connection_time = connexion;
  }
  const fin = formaterHeure(s?.heure_fin ?? null);
  if (fin) v.end_time = fin;

  if (c.nbEleves != null) v.student_count = String(c.nbEleves);
  if (c.nbCopies != null) v.copy_count = String(c.nbCopies);
  if (c.remuneration != null) v.remuneration = String(c.remuneration);
  if (c.echeance) v.deadline_date = dateLongue(c.echeance) ?? c.echeance;
  if (c.ancienneValeur) v.old_value = c.ancienneValeur;
  if (c.nouvelleValeur) v.new_value = c.nouvelleValeur;
  if (c.motif) v.change_reason = c.motif;

  return v;
}

// --- Variables d'une préinscription -----------------------------------

export function variablesPreinscription(p: LignePreinscription): Variables {
  const v: Variables = {
    first_name: (p.prenom ?? '').trim() || 'à toi',
    student_name: [p.prenom, p.nom].filter(Boolean).join(' ').trim(),
    inscription_url: URL_INSCRIPTION,
    student_space_url: URL_ESPACE_ELEVE,
    site_url: SITE_URL,
    support_email: SUPPORT_EMAIL,
  };
  if (p.matiere) v.subject_name = p.matiere;
  if (p.session_libelle) v.session_date = p.session_libelle;
  return v;
}

// --- Chargement depuis Supabase ---------------------------------------

export type ContextePlanification = {
  inscriptions: LigneInscription[];
  sessions: Map<string, LigneSession>;
  /** Sessions retrouvées par matière + date, pour les inscriptions sans session_id. */
  sessionsParCle: Map<string, LigneSession>;
  coachs: LigneCoach[];
  profs: Map<string, LigneProf>;
  copiesParEmail: Map<string, LigneCopie[]>;
  preinscriptions: LignePreinscription[];
};

export function cleSession(matiere: string, date: string): string {
  return `${matiere.trim().toLowerCase()}|${date}`;
}

/**
 * Charge tout ce dont le planificateur a besoin, en quelques requêtes.
 * On ne remonte que ce qui peut encore donner lieu à un envoi : sessions
 * récentes ou à venir, inscriptions correspondantes.
 */
export async function chargerContexte(maintenant = new Date()): Promise<ContextePlanification> {
  const db = emailsDb();
  // On garde 60 jours en arrière : corrections, demandes d'avis, relances profs.
  const depuis = new Date(maintenant.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  const [insc, sess, coach, prof, cop, prein] = await Promise.all([
    db.from('inscriptions').select(CHAMPS_INSCRIPTION).order('created_at', { ascending: false }).limit(2000),
    db.from('sessions_bacs_blancs').select(CHAMPS_SESSION).gte('date_epreuve', depuis).limit(500),
    db.from('session_coachs').select('session_id, professeur_id, statut, remuneration, created_at').limit(2000),
    db.from('professeurs').select('id, prenom, nom, email, matieres, statut_compte').limit(500),
    db
      .from('copies')
      .select('id, matiere, eleve_nom, eleve_email, statut, pdf_pret, envoye, created_at')
      .gte('created_at', depuis)
      .limit(2000),
    db
      .from('preinscriptions')
      .select('id, prenom, nom, email, matiere, session_libelle, session_id, statut, consentement_marketing, inscription_id, created_at')
      .limit(2000),
  ]);

  for (const r of [insc, sess, coach, prof, cop, prein]) {
    if (r.error) throw r.error;
  }

  const sessions = new Map<string, LigneSession>();
  const sessionsParCle = new Map<string, LigneSession>();
  for (const s of (sess.data ?? []) as unknown as LigneSession[]) {
    sessions.set(s.id, s);
    sessionsParCle.set(cleSession(s.matiere, s.date_epreuve), s);
  }

  const profs = new Map<string, LigneProf>();
  for (const p of (prof.data ?? []) as unknown as LigneProf[]) profs.set(p.id, p);

  const copiesParEmail = new Map<string, LigneCopie[]>();
  for (const c of (cop.data ?? []) as unknown as LigneCopie[]) {
    const cle = (c.eleve_email ?? '').trim().toLowerCase();
    if (!cle) continue;
    const liste = copiesParEmail.get(cle) ?? [];
    liste.push(c);
    copiesParEmail.set(cle, liste);
  }

  return {
    inscriptions: (insc.data ?? []) as unknown as LigneInscription[],
    sessions,
    sessionsParCle,
    coachs: (coach.data ?? []) as unknown as LigneCoach[],
    profs,
    copiesParEmail,
    preinscriptions: (prein.data ?? []) as unknown as LignePreinscription[],
  };
}

/** La session d'une inscription : par identifiant, sinon par matière + date. */
export function sessionDe(
  i: LigneInscription,
  ctx: Pick<ContextePlanification, 'sessions' | 'sessionsParCle'>,
): LigneSession | null {
  if (i.session_id) {
    const s = ctx.sessions.get(i.session_id);
    if (s) return s;
  }
  if (i.matiere && i.date_epreuve) {
    return ctx.sessionsParCle.get(cleSession(i.matiere, i.date_epreuve)) ?? null;
  }
  return null;
}
