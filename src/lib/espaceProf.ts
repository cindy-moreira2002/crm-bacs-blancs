/**
 * Données de l'espace prof — lecture côté serveur uniquement.
 *
 * Tout passe par la clé service_role : le navigateur du prof ne parle jamais
 * directement à Supabase, il n'appelle que nos routes /api. Un prof ne voit que
 * ses propres sessions et les sessions ouvertes dans ses matières.
 */
import { Professeur, crmAdmin } from '@/lib/authProf';
import { lienCategorie, lienSalon } from '@/lib/discord/config';
import { appelsOuvertsSession } from '@/lib/appels';
import { lienCorrection } from '@/lib/guidelines';
import { cleMatiere } from '@/lib/matieres';
import { classeursDuProf } from '@/lib/classeurs';
import { codeCopie } from '@/lib/codeCopie';
import { lienEcritureCopie } from '@/lib/liens';
import { adresseRetenue, chargerReglagesConsole } from '@/lib/reglagesConsole';
import { pipelineDb, pipelineManquant } from '@/lib/pipeline';

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
   * Le dossier des copies propre à ce bac blanc. Nul la plupart du temps : on
   * retombe alors sur le dossier général (réglages de la console).
   */
  drive_copies_url: string | null;
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
  /**
   * La grille de correction réellement ouverte par le prof, dans cet ordre :
   * le classeur propre à la session s'il existe, sinon LE CLASSEUR DE LA
   * MATIÈRE (les « guidelines », un par matière — c'est le cas normal), sinon
   * le classeur de secours posé dans les réglages. Nulle = aucune des trois,
   * et la console le dit au lieu d'afficher un lien mort.
   */
  grille_url: string | null;
  /**
   * D'où vient cette grille — la console l'écrit sous le bouton.
   *  · `mienne`  : la copie créée par CE prof pour CE bac blanc (le cas voulu) ;
   *  · `session` : une copie posée à la main sur la session ;
   *  · `matiere` : le classeur commun de la matière, encore non dupliqué ;
   *  · `secours` : le classeur de dépannage des réglages ;
   *  · `aucune`  : rien nulle part.
   */
  grille_origine: 'mienne' | 'session' | 'matiere' | 'secours' | 'aucune';
  /** Le nom du classeur ouvert : celui de la copie, sinon celui de la matière. */
  grille_titre: string | null;
  /**
   * Ce prof peut-il encore créer SA copie du classeur pour ce bac blanc ?
   * Faux s'il l'a déjà, ou si la matière n'a aucun classeur à dupliquer.
   */
  classeur_a_creer: boolean;
  /** Le dossier des copies, même règle : celui de la session, sinon le général. */
  dossier_url: string | null;
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
  /**
   * Un document collé à la main sur cette ligne, quand la copie ne vit PAS dans
   * l'application d'écriture (un Google Doc apporté par l'élève, par exemple).
   * Vide dans le cas normal.
   */
  copie_doc_url: string | null;
  /**
   * La copie de l'élève dans l'application d'écriture — celle dont il reçoit le
   * lien à son inscription. Calculée à partir du même code signé que son
   * espace : le prof et l'élève ouvrent forcément la MÊME copie, sans que
   * personne n'ait rien à recopier.
   */
  ecriture_url: string | null;
  /**
   * Quand l'élève a rendu sa copie manuscrite, ou null tant qu'il écrit. C'est
   * le geste « Rendre ma copie » de l'application d'écriture : le professeur
   * n'a plus à demander si c'est fini.
   */
  copie_rendue_le: string | null;
  /**
   * Ce que le bouton « Sa copie » ouvre vraiment : le document collé à la main
   * s'il y en a un, sinon la copie de l'application d'écriture.
   */
  doc_url: string | null;
  /** D'où vient ce lien — la console le dit au survol. */
  doc_origine: 'colle' | 'ecriture' | 'aucun';
  /**
   * L'appel en cours de cet élève, s'il a levé la main. Nul le reste du temps.
   */
  appel: { id: string; motif: string; cree_le: string } | null;
  copie: {
    id: string;
    statut: string;
    note: number | null;
    fichier_nom: string | null;
    pdf_pret: boolean;
    envoye: boolean;
  } | null;
  /**
   * La copie de cet élève dans le PIPELINE de correction — celle qui a été
   * déposée depuis « Déposer une copie », transcrite, corrigée, et dont le
   * dossier est fabriqué.
   *
   * C'est une autre base que `copie` ci-dessus, qui vient de la table `copies`
   * du CRM (l'ancien dépôt manuel). Les deux ont coexisté sans se connaître :
   * une copie corrigée par le pipeline affichait « Copie attendue » pour
   * toujours, et le professeur n'avait AUCUN écran où récupérer le dossier
   * qu'il venait de faire produire. C'est ce champ qui les relie.
   */
  correction: {
    id: string;
    statut: string;
    /** La note affichée : celle du professeur si elle a été posée. */
    note: number | null;
    /** `professeur` quand la note vient de sa grille, sinon l'IA. */
    note_source: string | null;
    /** Le dossier de l'élève est fabriqué et lisible. */
    dossier_pret: boolean;
    /** L'adresse du dossier — la même page que celle envoyée à l'élève. */
    dossier_url: string | null;
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

  // Repli tant que les scripts 45 et 51 n'ont pas été passés : l'espace prof
  // doit continuer à s'ouvrir, simplement sans le bouton Discord ni le dossier.
  const COLONNES_BASE =
    'id, matiere, date_epreuve, heure_debut, heure_fin, places, coachs_recherches, statut, sheet_correction_url';

  const [{ data: sessions }, { data: coachs }, { data: inscriptions }, reglages, mesClasseurs] =
    await Promise.all([
    db.from('sessions_bacs_blancs')
      .select(`${COLONNES_BASE}, discord_categorie_id, drive_copies_url`)
      .order('date_epreuve', { ascending: true })
      .then(async (r) => {
        if (!r.error) return r;
        const message = r.error.message ?? '';
        if (/drive_copies_url/.test(message)) {
          return db.from('sessions_bacs_blancs')
            .select(`${COLONNES_BASE}, discord_categorie_id`)
            .order('date_epreuve', { ascending: true })
            .then(async (r2) =>
              r2.error && /discord_categorie_id/.test(r2.error.message ?? '')
                ? db.from('sessions_bacs_blancs').select(COLONNES_BASE).order('date_epreuve', { ascending: true })
                : r2,
            );
        }
        if (/discord_categorie_id/.test(message)) {
          return db.from('sessions_bacs_blancs').select(COLONNES_BASE).order('date_epreuve', { ascending: true });
        }
        return r;
      }),
    db.from('session_coachs')
      .select('session_id, professeur_id, remuneration, statut')
      .eq('statut', 'confirme'),
    db.from('inscriptions').select('session_id'),
    chargerReglagesConsole(),
    classeursDuProf(prof.id),
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
      drive_copies_url: row.drive_copies_url ?? null,
      nb_eleves: stats?.eleves ?? 0,
      nb_coachs: stats?.coachs ?? 0,
      je_coache: stats?.moi ?? false,
      remuneration: stats?.maRemu ?? 0,
      categorie_url: lienCategorie(row.discord_categorie_id),
      ...grilleDeLaSession(row, reglages.sheet_correction_url, mesClasseurs.get(row.id) ?? null),
      dossier_url: adresseRetenue(row.drive_copies_url, reglages.drive_copies_url),
    };
  });
}

/**
 * Quelle grille ouvre le prof, et d'où elle vient.
 *
 * L'ordre compte : depuis août 2026 les professeurs corrigent avec le classeur
 * de LEUR MATIÈRE (« guidelines », un par matière, barème + page à cocher).
 * C'est donc lui le cas normal, pas un réglage général — celui-ci ne sert plus
 * que de filet pour une matière dont le classeur n'existe pas encore.
 */
function grilleDeLaSession(
  row: Session,
  secours: string,
  mienne: { url: string; nom: string } | null,
): Pick<SessionEnrichie, 'grille_url' | 'grille_origine' | 'grille_titre' | 'classeur_a_creer'> {
  const cle = cleMatiere(row.matiere);
  const { url, origine, guideline } = lienCorrection(cle ?? row.matiere, row.sheet_correction_url);

  // La copie du prof passe avant tout le reste : c'est là qu'il corrige.
  if (mienne) {
    return {
      grille_url: mienne.url,
      grille_origine: 'mienne',
      grille_titre: mienne.nom,
      classeur_a_creer: false,
    };
  }

  // Pas encore de copie : le bouton « créer mon classeur » n'a de sens que si
  // la matière a bien un classeur à dupliquer.
  const aCreer = Boolean(guideline?.url);

  if (url) {
    return {
      grille_url: url,
      grille_origine: origine === 'session' ? 'session' : 'matiere',
      grille_titre: guideline?.titre ?? null,
      classeur_a_creer: aCreer,
    };
  }
  return {
    grille_url: secours || null,
    grille_origine: secours ? 'secours' : 'aucune',
    grille_titre: guideline?.titre ?? null,
    classeur_a_creer: aCreer,
  };
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

/** Ce qu'on retient d'une copie du pipeline pour l'afficher au professeur. */
type CorrectionPipeline = {
  id: string;
  student_name: string | null;
  student_email: string | null;
  status: string;
  result_json: { note_finale?: number | null; note_source?: string | null } | null;
};

/**
 * Les copies du pipeline pour une matière, avec l'état de leur dossier.
 *
 * Lecture SEULE et facultative : si le pipeline n'est pas configuré sur ce
 * déploiement, ou s'il répond une erreur, on rend une liste vide. La console du
 * professeur doit s'afficher entière même quand la correction automatique est
 * en panne — c'est son écran du jour J.
 */
async function chargerCorrectionsPipeline(matiereSession: string): Promise<
  Map<string, EleveSession['correction']>
> {
  const par: Map<string, EleveSession['correction']> = new Map();
  if (pipelineManquant().length) return par;

  try {
    const pipeline = pipelineDb();
    const matieres = [...new Set([cleMatiere(matiereSession), matiereSession].filter(Boolean))] as string[];

    const { data, error } = await pipeline
      .from('corrections')
      .select('id, student_name, student_email, status, result_json')
      .in('matiere', matieres)
      .order('created_at', { ascending: false });
    if (error || !data?.length) return par;

    const lignes = data as CorrectionPipeline[];
    // Un seul aller-retour pour savoir lesquelles ont leur dossier, plutôt
    // qu'une requête par élève.
    const { data: dossiers } = await pipeline
      .from('dossiers')
      .select('correction_id')
      .in('correction_id', lignes.map((c) => c.id));
    const avecDossier = new Set(
      ((dossiers ?? []) as { correction_id: string }[]).map((d) => d.correction_id),
    );

    // Les plus récentes d'abord : la première rencontrée pour une clé donnée
    // est la bonne, les dépôts plus anciens du même élève ne l'écrasent pas.
    for (const c of lignes) {
      const etat: EleveSession['correction'] = {
        id: c.id,
        statut: c.status,
        note: c.result_json?.note_finale ?? null,
        note_source: c.result_json?.note_source ?? null,
        dossier_pret: avecDossier.has(c.id),
        dossier_url: avecDossier.has(c.id) ? `/dossier/${c.id}` : null,
      };
      for (const cle of [norm(c.student_email), norm(c.student_name)]) {
        if (cle && !par.has(cle)) par.set(cle, etat);
      }
    }
  } catch {
    // Volontairement silencieux : voir le commentaire de la fonction.
  }
  return par;
}

/**
 * Élèves d'une session, avec leur copie si elle est déjà déposée.
 * Les copies sont rattachées par e-mail, sinon par nom + matière — c'est le
 * même appariement que l'ancien espace prof.
 */
export async function chargerElevesSession(session: Session): Promise<EleveSession[]> {
  const db = crmAdmin();

  // Repli tant que les scripts 45 et 51 n'ont pas été passés : la liste des
  // élèves doit s'afficher même sans salle attribuée ni colonne de document.
  const eleves = () => db.from('inscriptions').select('id, nom, email, matiere, created_at');
  const deLaSession = <T>(q: { eq: (c: string, v: string) => T }) => q.eq('session_id', session.id);

  const [{ data: inscrits }, { data: copies }, appels] = await Promise.all([
    db.from('inscriptions')
      .select('id, nom, email, matiere, created_at, discord_salon_id, copie_doc_url')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .then(async (r) => {
        if (!r.error) return r;
        const message = r.error.message ?? '';
        if (/copie_doc_url/.test(message)) {
          return db.from('inscriptions')
            .select('id, nom, email, matiere, created_at, discord_salon_id')
            .eq('session_id', session.id)
            .order('created_at', { ascending: true })
            .then(async (r2) =>
              r2.error && /discord_salon_id/.test(r2.error.message ?? '')
                ? deLaSession(eleves()).order('created_at', { ascending: true })
                : r2,
            );
        }
        if (/discord_salon_id/.test(message)) {
          return deLaSession(eleves()).order('created_at', { ascending: true });
        }
        return r;
      }),
    db.from('copies')
      .select('id, matiere, eleve_nom, eleve_email, statut, note, fichier_nom, pdf_pret, envoye')
      .eq('matiere', session.matiere),
    appelsOuvertsSession(session.id),
  ]);

  const appelParEleve = new Map(appels.map((a) => [a.inscription_id, a]));

  // Les copies passées par le PIPELINE de correction. Elles vivent dans une
  // autre base, et la matière ne s'y écrit pas pareil : le CRM garde le
  // libellé (« Français »), le pipeline la clé (« francais »). On interroge
  // les deux écritures — c'est exactement l'oubli qui empêchait la génération
  // des dossiers de rapprocher quoi que ce soit.
  //
  // Pipeline absent ou muet : on n'affiche rien de plus, la console reste
  // celle d'avant. Jamais d'erreur à l'écran pour une information secondaire.
  const corrections = await chargerCorrectionsPipeline(session.matiere);

  // Copies manuscrites rendues. Une seule requête pour toute la session, et un
  // repli silencieux : tant que le script SQL de l'écriture n'est pas passé, la
  // console s'affiche exactement comme avant.
  const codes = (inscrits ?? [])
    .map((i) => codeCopie((i as { nom: string }).nom, (i as { matiere: string }).matiere))
    .filter((c): c is string => Boolean(c));
  const rendues = new Map<string, string>();
  if (codes.length > 0) {
    const { data } = await db
      .from('ecriture_copies')
      .select('id, rendue_le')
      .in('id', codes);
    for (const r of (data ?? []) as { id: string; rendue_le: string | null }[]) {
      if (r.rendue_le) rendues.set(r.id, r.rendue_le);
    }
  }

  return (inscrits ?? []).map((i) => {
    const { discord_salon_id, copie_doc_url, ...eleve } = i as unknown as Omit<
      EleveSession,
      'copie' | 'salon_url' | 'copie_doc_url' | 'appel'
    > & {
      discord_salon_id?: string | null;
      copie_doc_url?: string | null;
    };
    const copie = (copies ?? []).find((c) => {
      const row = c as { eleve_email: string | null; eleve_nom: string };
      return (
        (eleve.email && norm(row.eleve_email) === norm(eleve.email)) ||
        norm(row.eleve_nom) === norm(eleve.nom)
      );
    });
    const appel = appelParEleve.get(eleve.id);
    const code = codeCopie(eleve.nom, eleve.matiere);
    const ecriture = lienEcritureCopie(code, eleve.matiere);
    const doc = (copie_doc_url ?? '').trim() || ecriture;
    return {
      ...eleve,
      salon_url: lienSalon(discord_salon_id),
      copie_doc_url: copie_doc_url ?? null,
      ecriture_url: ecriture,
      copie_rendue_le: (code && rendues.get(code)) || null,
      doc_url: doc,
      doc_origine: (copie_doc_url ?? '').trim() ? 'colle' : ecriture ? 'ecriture' : 'aucun',
      appel: appel ? { id: appel.id, motif: appel.motif, cree_le: appel.cree_le } : null,
      copie: (copie as EleveSession['copie']) ?? null,
      // L'e-mail d'abord : deux élèves peuvent porter le même nom, jamais la
      // même adresse.
      correction:
        (eleve.email && corrections.get(norm(eleve.email))) ||
        corrections.get(norm(eleve.nom)) ||
        null,
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
