/**
 * Données de l'espace prof — lecture côté serveur uniquement.
 *
 * Tout passe par la clé service_role : le navigateur du prof ne parle jamais
 * directement à Supabase, il n'appelle que nos routes /api. Un prof ne voit que
 * ses propres sessions et les sessions ouvertes dans ses matières.
 */
import { Professeur, crmAdmin } from '@/lib/authProf';
import { lienCategorie, lienSalon } from '@/lib/discord/config';

export type Session = {
  id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string;
  heure_fin: string | null;
  places: number;
  coachs_recherches: number;
  statut: string;
  sheet_correction_url: string | null;
  /**
   * Le bloc Discord de l'épreuve : c'est de là que le prof surveille, en
   * passant d'une salle d'élève à l'autre. Nul tant que les salles n'ont pas
   * été préparées depuis l'administration.
   */
  discord_categorie_id: string | null;
};

export type SessionEnrichie = Session & {
  nb_eleves: number;
  nb_coachs: number;
  je_coache: boolean;
  remuneration: number;
  /** L'adresse du bloc Discord, ou null si les salles n'existent pas encore. */
  categorie_url: string | null;
};

export type EleveSession = {
  id: string;
  nom: string;
  email: string | null;
  matiere: string;
  created_at: string;
  /**
   * La salle Discord de cet élève. Construite côté serveur à partir de la
   * colonne posée par « Préparer les salles » : le prof ne la devine pas, il la
   * reçoit. Nulle tant qu'aucune salle n'est attribuée — auquel cas l'espace
   * dit « pas de salle » plutôt que d'afficher un bouton qui ne mène nulle part.
   */
  salon_url: string | null;
  copie: {
    id: string;
    statut: string;
    note: number | null;
    fichier_nom: string | null;
    pdf_pret: boolean;
    envoye: boolean;
  } | null;
};

export type Revenus = {
  total: number;
  affiliation: number;
  coaching: number;
  a_payer: number;
  eleves_parraines: number;
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Un prof ne voit une matière que si elle est déclarée sur sa fiche. */
function enseigne(prof: Professeur, matiere: string): boolean {
  return (prof.matieres ?? []).some((m) => norm(m) === norm(matiere));
}

/** Aujourd'hui à minuit — sépare « à venir » de « passé » sans piège d'heure. */
function aujourdhui(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Toutes les sessions, enrichies du nombre d'élèves inscrits (temps réel),
 * du nombre de coachs et de la position du prof courant.
 */
export async function chargerSessions(prof: Professeur): Promise<SessionEnrichie[]> {
  const db = crmAdmin();

  const [{ data: sessions }, { data: coachs }, { data: inscriptions }] = await Promise.all([
    // Repli tant que le script 45 n'a pas été passé : l'espace prof doit
    // continuer à s'ouvrir, simplement sans le bouton Discord.
    db.from('sessions_bacs_blancs')
      .select('id, matiere, date_epreuve, heure_debut, heure_fin, places, coachs_recherches, statut, sheet_correction_url, discord_categorie_id')
      .order('date_epreuve', { ascending: true })
      .then(async (r) =>
        r.error && /discord_categorie_id/.test(r.error.message ?? '')
          ? db.from('sessions_bacs_blancs')
              .select('id, matiere, date_epreuve, heure_debut, heure_fin, places, coachs_recherches, statut, sheet_correction_url')
              .order('date_epreuve', { ascending: true })
          : r,
      ),
    db.from('session_coachs')
      .select('session_id, professeur_id, remuneration, statut')
      .eq('statut', 'confirme'),
    db.from('inscriptions').select('session_id'),
  ]);

  const parSession = new Map<string, { eleves: number; coachs: number; maRemu: number; moi: boolean }>();
  const cle = (id: string) => {
    if (!parSession.has(id)) parSession.set(id, { eleves: 0, coachs: 0, maRemu: 0, moi: false });
    return parSession.get(id)!;
  };

  for (const i of inscriptions ?? []) {
    const sid = (i as { session_id: string | null }).session_id;
    if (sid) cle(sid).eleves += 1;
  }
  for (const c of coachs ?? []) {
    const row = c as { session_id: string; professeur_id: string; remuneration: number };
    const entree = cle(row.session_id);
    entree.coachs += 1;
    if (row.professeur_id === prof.id) {
      entree.moi = true;
      entree.maRemu = Number(row.remuneration ?? 0);
    }
  }

  return (sessions ?? []).map((s) => {
    const row = s as unknown as Session;
    const stats = parSession.get(row.id);
    return {
      ...row,
      discord_categorie_id: row.discord_categorie_id ?? null,
      nb_eleves: stats?.eleves ?? 0,
      nb_coachs: stats?.coachs ?? 0,
      je_coache: stats?.moi ?? false,
      remuneration: stats?.maRemu ?? 0,
      categorie_url: lienCategorie(row.discord_categorie_id),
    };
  });
}

export type BlocsSessions = {
  aVenir: SessionEnrichie[];
  passees: SessionEnrichie[];
  disponibles: SessionEnrichie[];
};

/**
 * Répartit les sessions dans les trois blocs de l'espace prof.
 *  - aVenir      : celles que le prof coache déjà, encore à venir
 *  - passees     : celles qu'il a coachées, déjà passées
 *  - disponibles : celles où il peut se positionner — uniquement dans ses
 *                  matières, encore à venir, pas déjà prises par lui
 */
export function repartirSessions(prof: Professeur, sessions: SessionEnrichie[]): BlocsSessions {
  const today = aujourdhui();
  const aVenir: SessionEnrichie[] = [];
  const passees: SessionEnrichie[] = [];
  const disponibles: SessionEnrichie[] = [];

  for (const s of sessions) {
    const future = s.date_epreuve >= today;
    if (s.je_coache) {
      (future ? aVenir : passees).push(s);
      continue;
    }
    if (future && enseigne(prof, s.matiere) && ['ouverte', 'complete'].includes(s.statut)) {
      disponibles.push(s);
    }
  }

  passees.reverse(); // la plus récente d'abord
  return { aVenir, passees, disponibles };
}

/** Revenus du prof : affiliation + coaching, plus le nombre d'élèves parrainés. */
export async function chargerRevenus(prof: Professeur): Promise<Revenus> {
  const db = crmAdmin();

  const [{ data: lignes }, { count: parraines }] = await Promise.all([
    db.from('revenus_prof').select('type, montant, statut').eq('professeur_id', prof.id),
    db.from('inscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('code_affiliation', prof.code_affiliation),
  ]);

  const revenus: Revenus = {
    total: 0,
    affiliation: 0,
    coaching: 0,
    a_payer: 0,
    eleves_parraines: parraines ?? 0,
  };

  for (const l of lignes ?? []) {
    const row = l as { type: string; montant: number; statut: string };
    const montant = Number(row.montant ?? 0);
    revenus.total += montant;
    if (row.type === 'affiliation') revenus.affiliation += montant;
    if (row.type === 'coaching') revenus.coaching += montant;
    if (row.statut === 'a_payer') revenus.a_payer += montant;
  }

  return revenus;
}

/**
 * Élèves d'une session, avec leur copie si elle est déjà déposée.
 * Les copies sont rattachées par e-mail, sinon par nom + matière — c'est le
 * même appariement que l'ancien espace prof.
 */
export async function chargerElevesSession(session: Session): Promise<EleveSession[]> {
  const db = crmAdmin();

  const [{ data: inscrits }, { data: copies }] = await Promise.all([
    // Repli tant que le script 45 n'a pas été passé : la liste des élèves doit
    // s'afficher même sans salle attribuée.
    db.from('inscriptions')
      .select('id, nom, email, matiere, created_at, discord_salon_id')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .then(async (r) =>
        r.error && /discord_salon_id/.test(r.error.message ?? '')
          ? db.from('inscriptions')
              .select('id, nom, email, matiere, created_at')
              .eq('session_id', session.id)
              .order('created_at', { ascending: true })
          : r,
      ),
    db.from('copies')
      .select('id, matiere, eleve_nom, eleve_email, statut, note, fichier_nom, pdf_pret, envoye')
      .eq('matiere', session.matiere),
  ]);

  return (inscrits ?? []).map((i) => {
    const { discord_salon_id, ...eleve } = i as unknown as Omit<EleveSession, 'copie' | 'salon_url'> & {
      discord_salon_id?: string | null;
    };
    const copie = (copies ?? []).find((c) => {
      const row = c as { eleve_email: string | null; eleve_nom: string };
      return (
        (eleve.email && norm(row.eleve_email) === norm(eleve.email)) ||
        norm(row.eleve_nom) === norm(eleve.nom)
      );
    });
    return {
      ...eleve,
      salon_url: lienSalon(discord_salon_id),
      copie: (copie as EleveSession['copie']) ?? null,
    };
  });
}

/** Une session par son id — null si le prof n'a rien à y faire. */
export async function chargerSessionAutorisee(
  prof: Professeur,
  sessionId: string,
): Promise<SessionEnrichie | null> {
  const sessions = await chargerSessions(prof);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  // Accès : soit il la coache, soit c'est une de ses matières (pour se décider).
  if (!session.je_coache && !enseigne(prof, session.matiere) && prof.role !== 'admin') return null;
  return session;
}

/** Libellé de date lisible : « samedi 6 septembre 2026 ». */
export function dateLongue(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Date courte pour les cartes : { jour: '6', mois: 'sept.', annee: '2026' }. */
export function dateCourte(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return {
    jour: d.toLocaleDateString('fr-FR', { day: 'numeric' }),
    mois: d.toLocaleDateString('fr-FR', { month: 'short' }),
    annee: d.getFullYear().toString(),
    jourSemaine: d.toLocaleDateString('fr-FR', { weekday: 'long' }),
  };
}

export function creneau(s: { heure_debut: string; heure_fin: string | null }): string {
  return s.heure_fin ? `${s.heure_debut} — ${s.heure_fin}` : s.heure_debut;
}
