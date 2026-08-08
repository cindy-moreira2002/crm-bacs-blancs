/**
 * Pilotage des bacs blancs — sessions, profs assignés, sujets, retours.
 *
 * ⚠️ SERVEUR UNIQUEMENT : tout passe par la clé service_role du projet CRM.
 *
 * Ce module réunit ce qui était éparpillé : la session (sessions_bacs_blancs),
 * les élèves inscrits (inscriptions), les profs qui l'encadrent (session_coachs,
 * la table existait déjà), le SUJET de l'épreuve (session_sujets, nouvelle) et
 * le RETOUR du prof après coup (session_retours, nouvelle).
 *
 * Les deux nouvelles tables peuvent ne pas exister encore : le SQL
 * `supabase/sql/41_bacs_blancs_pilotage.sql` se joue à la main dans l'éditeur
 * Supabase. Tant qu'elles manquent, ce module ne plante pas — il renvoie des
 * listes vides et lève le drapeau `tables_manquantes`, et la page affiche quoi
 * faire. Mieux vaut une page qui explique qu'une page en erreur 500.
 */
import { crmAdmin, type Professeur } from '@/lib/authProf';

const BUCKET_SUJETS = 'sujets';
/** Durée d'un lien de téléchargement de sujet. Court : c'est un sujet d'examen. */
const VALIDITE_LIEN_SUJET_S = 900; // 15 minutes

// --- Formes -----------------------------------------------------------

export type SujetSession = {
  id: string;
  session_id: string;
  type: string;
  titre: string | null;
  consigne: string | null;
  fichier_path: string | null;
  fichier_nom: string | null;
  fichier_octets: number | null;
  subject_card_id: string | null;
  visible_prof: boolean;
  created_at: string;
  /** Publication automatique vers les élèves (SQL 44). */
  publication_active?: boolean;
  minutes_avant?: number;
  /** Heure imposée à la main : prime sur le calcul. */
  publier_le?: string | null;
  visible_eleve?: boolean;
  publie_le?: string | null;
  /** Calculé au chargement : heure d'ouverture aux élèves. Jamais en base. */
  publication_prevue?: string | null;
};

export type RetourSession = {
  id: string;
  session_id: string;
  professeur_id: string;
  deroulement: string | null;
  nb_eleves_presents: number | null;
  nb_eleves_absents: number | null;
  duree_adaptee: string | null;
  difficulte_sujet: string | null;
  niveau_eleves: string | null;
  incidents: string | null;
  retours_eleves: string | null;
  besoins: string | null;
  note_organisation: number | null;
  recommanderait: boolean | null;
  created_at: string;
  updated_at: string;
};

export type ProfLite = {
  id: string;
  nom: string;
  prenom: string | null;
  email: string;
  matieres: string[];
  statut_compte: string | null;
};

export type ProfAssigne = ProfLite & {
  assignation_id: string;
  statut: string;
  remuneration: number | null;
  retour: RetourSession | null;
};

export type BacBlanc = {
  id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  /** Début réel de l'épreuve, calculé en base (SQL 44). Null = heure illisible. */
  debut_le: string | null;
  heure_fin: string | null;
  places: number | null;
  coachs_recherches: number | null;
  statut: string | null;
  /** Nombre d'élèves inscrits, compté en direct. */
  nb_eleves: number;
  /** Jours d'ici l'épreuve (négatif = passée). */
  jours: number;
  passe: boolean;
  profs: ProfAssigne[];
  sujets: SujetSession[];
  /** Profs assignés qui n'ont pas encore rendu leur retour (session passée). */
  retours_attendus: number;
};

export type EtatBacsBlancs = {
  genere_le: string;
  tables_manquantes: string[];
  bacs_blancs: BacBlanc[];
  profs: ProfLite[];
  /** Ce qui mérite un œil, calculé côté serveur. */
  alertes: string[];
};

// --- Outils -----------------------------------------------------------

const aujourdhui = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function joursAvant(dateISO: string): number {
  const cible = new Date(`${dateISO}T00:00:00`);
  return Math.round((cible.getTime() - aujourdhui().getTime()) / 86_400_000);
}

/** Nom de fichier sûr : pas d'accent, pas d'espace, pas de chemin relatif. */
export function assainirNomFichier(nom: string): string {
  return (nom || 'sujet.pdf')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-90);
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Comparaison de matières tolérante aux accents, à la casse et aux tirets. */
export function normaliserMatiere(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Un prof « couvre » une matière si elle est déclarée sur sa fiche. */
export function profCouvre(prof: { matieres?: string[] | null }, matiere: string): boolean {
  return (prof.matieres ?? []).some((m) => norm(m) === norm(matiere));
}

/**
 * Une table absente ne doit pas faire tomber la page.
 *
 * Deux formes d'erreur possibles : `42P01` vient de PostgreSQL lui-même,
 * `PGRST205` (« Could not find the table … in the schema cache ») vient de
 * PostgREST, qui répond avant même d'interroger la base. C'est celle-ci qu'on
 * reçoit en pratique — vérifié sur la base CRM avant que le SQL soit joué.
 */
function tableAbsente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /does not exist|Could not find the table/i.test(error.message ?? '');
}

/** Colonne absente (SQL pas encore joué), à distinguer d'une table absente. */
function colonneAbsente(error: { code?: string; message?: string } | null, colonne: string): boolean {
  if (!error) return false;
  return error.code === '42703' || new RegExp(`column .*${colonne}.* does not exist`, 'i').test(error.message ?? '');
}

/**
 * Les sessions, avec `debut_le` quand la colonne existe.
 *
 * Tant que `44_sujets_eleves.sql` n'est pas joué, la colonne n'est pas là :
 * on relit sans elle plutôt que de casser toute la page de pilotage.
 */
async function chargerSessions(db: ReturnType<typeof crmAdmin>) {
  const COLONNES = 'id, matiere, date_epreuve, heure_debut, heure_fin, places, coachs_recherches, statut';
  const avec = await db
    .from('sessions_bacs_blancs')
    .select(`${COLONNES}, debut_le`)
    .order('date_epreuve', { ascending: true });
  if (!colonneAbsente(avec.error, 'debut_le')) return avec;
  return db.from('sessions_bacs_blancs').select(COLONNES).order('date_epreuve', { ascending: true });
}

// --- Publication du sujet aux élèves ----------------------------------

/**
 * `'9h'`, `'9 h 30'`, `'09:30'` → minutes depuis minuit. `null` si illisible.
 *
 * Même règle que `public.heure_texte_en_minutes` en base : les deux doivent
 * donner le même résultat, c'est ce que vérifient les tests.
 */
export function heureTexteEnMinutes(brut: string | null | undefined): number | null {
  if (!brut) return null;
  const m = /^([0-9]{1,2})\s*[h:]\s*([0-9]{1,2})?/.exec(String(brut).trim().toLowerCase());
  if (!m) return null;
  const h = Number(m[1]);
  const mn = m[2] ? Number(m[2]) : 0;
  if (h > 23 || mn > 59) return null;
  return h * 60 + mn;
}

/**
 * Heure à laquelle un sujet doit s'ouvrir aux élèves.
 *
 * `publier_le` posé à la main prime ; sinon début − `minutes_avant`. Renvoie
 * `null` quand la session n'a pas d'heure de début exploitable : on ne devine
 * pas l'heure d'un examen.
 */
export function publicationPrevue(
  sujet: Pick<SujetSession, 'publier_le' | 'minutes_avant'>,
  debutLe: string | null | undefined,
): Date | null {
  if (sujet.publier_le) return new Date(sujet.publier_le);
  if (!debutLe) return null;
  const minutes = sujet.minutes_avant ?? 10;
  return new Date(new Date(debutLe).getTime() - minutes * 60_000);
}

/**
 * Ce sujet doit-il être ouvert maintenant ?
 *
 * Reproduit à l'identique la condition de `public.publier_sujets_dus()`. Sert
 * à afficher l'état dans la page de pilotage, et à le tester hors ligne.
 */
export function sujetAPublier(
  sujet: Pick<SujetSession, 'type' | 'publication_active' | 'visible_eleve' | 'fichier_path' | 'publier_le' | 'minutes_avant'>,
  debutLe: string | null | undefined,
  maintenant: Date = new Date(),
): boolean {
  if (sujet.type !== 'sujet') return false;
  if (!sujet.publication_active) return false;
  if (sujet.visible_eleve) return false;
  if (!sujet.fichier_path) return false;
  const prevue = publicationPrevue(sujet, debutLe);
  return prevue !== null && prevue.getTime() <= maintenant.getTime();
}

// --- Lecture (administratrice) ---------------------------------------

export async function chargerEtatBacsBlancs(): Promise<EtatBacsBlancs> {
  const db = crmAdmin();

  const [sessionsRes, inscriptionsRes, coachsRes, profsRes, sujetsRes, retoursRes] = await Promise.all([
    chargerSessions(db),
    db.from('inscriptions').select('session_id'),
    db.from('session_coachs').select('id, session_id, professeur_id, statut, remuneration'),
    db
      .from('professeurs')
      .select('id, nom, prenom, email, matieres, statut_compte')
      .order('nom', { ascending: true }),
    db.from('session_sujets').select('*').order('created_at', { ascending: true }),
    db.from('session_retours').select('*').order('created_at', { ascending: false }),
  ]);

  const tables_manquantes: string[] = [];
  if (tableAbsente(sujetsRes.error)) tables_manquantes.push('session_sujets');
  if (tableAbsente(retoursRes.error)) tables_manquantes.push('session_retours');

  const profs = ((profsRes.data ?? []) as ProfLite[]).map((p) => ({
    ...p,
    matieres: p.matieres ?? [],
  }));
  const profParId = new Map(profs.map((p) => [p.id, p]));

  const elevesParSession = new Map<string, number>();
  for (const i of (inscriptionsRes.data ?? []) as { session_id: string | null }[]) {
    if (!i.session_id) continue;
    elevesParSession.set(i.session_id, (elevesParSession.get(i.session_id) ?? 0) + 1);
  }

  const sujets = (sujetsRes.error ? [] : ((sujetsRes.data ?? []) as SujetSession[]));
  const retours = (retoursRes.error ? [] : ((retoursRes.data ?? []) as RetourSession[]));
  const retourParCle = new Map(retours.map((r) => [`${r.session_id}|${r.professeur_id}`, r]));

  const coachsParSession = new Map<string, ProfAssigne[]>();
  for (const c of (coachsRes.data ?? []) as {
    id: string;
    session_id: string;
    professeur_id: string;
    statut: string;
    remuneration: number | null;
  }[]) {
    const p = profParId.get(c.professeur_id);
    if (!p) continue;
    const liste = coachsParSession.get(c.session_id) ?? [];
    liste.push({
      ...p,
      assignation_id: c.id,
      statut: c.statut,
      remuneration: c.remuneration,
      retour: retourParCle.get(`${c.session_id}|${c.professeur_id}`) ?? null,
    });
    coachsParSession.set(c.session_id, liste);
  }

  const sujetsParSession = new Map<string, SujetSession[]>();
  for (const s of sujets) {
    sujetsParSession.set(s.session_id, [...(sujetsParSession.get(s.session_id) ?? []), s]);
  }

  const bacs_blancs: BacBlanc[] = ((sessionsRes.data ?? []) as Record<string, unknown>[]).map((s) => {
    const id = String(s.id);
    const jours = joursAvant(String(s.date_epreuve));
    const profsSession = coachsParSession.get(id) ?? [];
    const debutLe = (s.debut_le as string) ?? null;
    // L'heure d'ouverture est calculée ici, côté serveur : la page de pilotage
    // est un composant client, elle ne doit pas importer ce module.
    const sujetsSession = (sujetsParSession.get(id) ?? []).map((su) => ({
      ...su,
      publication_prevue: publicationPrevue(su, debutLe)?.toISOString() ?? null,
    }));
    return {
      id,
      matiere: String(s.matiere ?? ''),
      date_epreuve: String(s.date_epreuve),
      heure_debut: (s.heure_debut as string) ?? null,
      debut_le: (s.debut_le as string) ?? null,
      heure_fin: (s.heure_fin as string) ?? null,
      places: (s.places as number) ?? null,
      coachs_recherches: (s.coachs_recherches as number) ?? null,
      statut: (s.statut as string) ?? null,
      nb_eleves: elevesParSession.get(id) ?? 0,
      jours,
      passe: jours < 0,
      profs: profsSession,
      sujets: sujetsSession,
      retours_attendus: jours < 0 ? profsSession.filter((p) => !p.retour).length : 0,
    };
  });

  // --- Alertes : ce qui coince, dit une fois, au bon endroit.
  const alertes: string[] = [];
  if (tables_manquantes.length) {
    alertes.push(
      `Tables absentes (${tables_manquantes.join(', ')}) : jouer supabase/sql/41_bacs_blancs_pilotage.sql dans l’éditeur SQL du projet CRM. Sujets et retours sont inactifs tant que ce n’est pas fait.`,
    );
  }
  const aVenir = bacs_blancs.filter((b) => !b.passe);
  const sansSujet = aVenir.filter((b) => b.jours <= 21 && !b.sujets.some((s) => s.type === 'sujet'));
  if (sansSujet.length) {
    alertes.push(
      `Sans sujet déposé à moins de 3 semaines : ${sansSujet.map((b) => `${b.matiere} (${b.jours} j)`).join(', ')}.`,
    );
  }
  const sansProf = aVenir.filter((b) => b.jours <= 21 && b.profs.length === 0);
  if (sansProf.length) {
    alertes.push(
      `Sans professeur assigné à moins de 3 semaines : ${sansProf.map((b) => `${b.matiere} (${b.jours} j)`).join(', ')}.`,
    );
  }
  // Une publication armée sur une session dont l'heure de début est illisible
  // ne partira jamais : le planificateur ne devine pas l'heure d'un examen.
  const publicationSansHeure = aVenir.filter(
    (b) => !b.debut_le && b.sujets.some((s) => s.publication_active && s.type === 'sujet'),
  );
  if (publicationSansHeure.length) {
    alertes.push(
      `Publication programmée mais heure de début illisible (le sujet ne partira pas) : ${publicationSansHeure
        .map((b) => `${b.matiere} du ${b.date_epreuve} — heure saisie « ${b.heure_debut ?? 'vide'} »`)
        .join(', ')}. Corriger l’heure de la session.`,
    );
  }

  const retoursManquants = bacs_blancs.filter((b) => b.passe && b.retours_attendus > 0);
  if (retoursManquants.length) {
    alertes.push(
      `Retours de prof attendus : ${retoursManquants
        .map((b) => `${b.matiere} du ${b.date_epreuve} (${b.retours_attendus})`)
        .join(', ')}.`,
    );
  }

  return {
    genere_le: new Date().toISOString(),
    tables_manquantes,
    bacs_blancs,
    profs,
    alertes,
  };
}

// --- Écriture (administratrice) --------------------------------------

export async function assignerProf(sessionId: string, professeurId: string): Promise<void> {
  const db = crmAdmin();
  const { data: existant } = await db
    .from('session_coachs')
    .select('id')
    .eq('session_id', sessionId)
    .eq('professeur_id', professeurId)
    .maybeSingle();
  if (existant) return; // déjà assigné : rien à faire, pas d'erreur
  const { error } = await db
    .from('session_coachs')
    .insert({ session_id: sessionId, professeur_id: professeurId, statut: 'confirme' });
  if (error) throw error;
}

export async function retirerProf(assignationId: string): Promise<void> {
  const { error } = await crmAdmin().from('session_coachs').delete().eq('id', assignationId);
  if (error) throw error;
}

/** URL signée d'écriture : le navigateur téléverse en direct, aucune clé ne descend. */
export async function preparerDepotSujet(
  sessionId: string,
  fichierNom: string,
): Promise<{ path: string; signed_url: string; token: string }> {
  const db = crmAdmin();
  const path = `${sessionId}/${Date.now()}-${assainirNomFichier(fichierNom)}`;
  const { data, error } = await db.storage.from(BUCKET_SUJETS).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, signed_url: data.signedUrl, token: data.token };
}

export async function enregistrerSujet(entree: {
  session_id: string;
  type?: string;
  titre?: string | null;
  consigne?: string | null;
  fichier_path?: string | null;
  fichier_nom?: string | null;
  fichier_octets?: number | null;
  subject_card_id?: string | null;
  visible_prof?: boolean;
  depose_par?: string | null;
}): Promise<SujetSession> {
  const { data, error } = await crmAdmin()
    .from('session_sujets')
    .insert({
      session_id: entree.session_id,
      type: entree.type ?? 'sujet',
      titre: entree.titre ?? null,
      consigne: entree.consigne ?? null,
      fichier_path: entree.fichier_path ?? null,
      fichier_nom: entree.fichier_nom ?? null,
      fichier_octets: entree.fichier_octets ?? null,
      subject_card_id: entree.subject_card_id ?? null,
      visible_prof: entree.visible_prof ?? false,
      depose_par: entree.depose_par ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SujetSession;
}

export async function majSujet(
  sujetId: string,
  patch: Partial<
    Pick<
      SujetSession,
      | 'titre'
      | 'consigne'
      | 'type'
      | 'visible_prof'
      | 'subject_card_id'
      | 'publication_active'
      | 'minutes_avant'
      | 'publier_le'
      | 'visible_eleve'
    >
  >,
): Promise<void> {
  const db = crmAdmin();

  // Ouvrir un corrigé aux élèves n'a aucun sens : la base le refuse déjà
  // (contrainte `session_sujets_eleves_sujet_seulement`), on le dit ici avec
  // un message lisible plutôt que de laisser remonter une erreur Postgres.
  if (patch.visible_eleve === true) {
    const { data } = await db.from('session_sujets').select('type').eq('id', sujetId).maybeSingle();
    const type = (data as { type?: string } | null)?.type;
    if (type && type !== 'sujet') {
      throw new Error(`Seul un « sujet » peut être ouvert aux élèves (celui-ci est de type « ${type} »).`);
    }
  }

  // Ouvrir à la main, c'est publier : la trace doit le dire aussi.
  const complet =
    patch.visible_eleve === true ? { ...patch, publie_le: new Date().toISOString() } : patch;

  const { error } = await db.from('session_sujets').update(complet).eq('id', sujetId);
  if (error) throw error;
}

export async function supprimerSujet(sujetId: string): Promise<void> {
  const db = crmAdmin();
  const { data: sujet } = await db.from('session_sujets').select('fichier_path').eq('id', sujetId).maybeSingle();
  const chemin = (sujet as { fichier_path: string | null } | null)?.fichier_path;
  if (chemin) {
    // Le fichier part avec la ligne : sinon le Storage se remplit d'orphelins
    // que plus rien ne référence.
    await db.storage.from(BUCKET_SUJETS).remove([chemin]);
  }
  const { error } = await db.from('session_sujets').delete().eq('id', sujetId);
  if (error) throw error;
}

/** Lien de téléchargement court. Rien ne sort du Storage sans passer par ici. */
export async function lienSujet(chemin: string): Promise<string | null> {
  const { data, error } = await crmAdmin()
    .storage.from(BUCKET_SUJETS)
    .createSignedUrl(chemin, VALIDITE_LIEN_SUJET_S);
  if (error) return null;
  return data.signedUrl;
}

// --- Côté professeur --------------------------------------------------

export type BacBlancProf = {
  session_id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  heure_fin: string | null;
  jours: number;
  passe: boolean;
  nb_eleves: number;
  sujets: SujetSession[];
  retour: RetourSession | null;
  /** La session est passée et le prof n'a pas encore répondu. */
  retour_attendu: boolean;
};

/** Les sessions où CE prof est assigné. Un prof ne voit rien d'autre. */
export async function chargerMesBacsBlancs(prof: Professeur): Promise<BacBlancProf[]> {
  const db = crmAdmin();

  const { data: mesCoachs } = await db
    .from('session_coachs')
    .select('session_id')
    .eq('professeur_id', prof.id);
  const ids = [...new Set(((mesCoachs ?? []) as { session_id: string }[]).map((c) => c.session_id))];
  if (!ids.length) return [];

  const [sessionsRes, inscriptionsRes, sujetsRes, retoursRes] = await Promise.all([
    db
      .from('sessions_bacs_blancs')
      .select('id, matiere, date_epreuve, heure_debut, heure_fin')
      .in('id', ids)
      .order('date_epreuve', { ascending: true }),
    db.from('inscriptions').select('session_id').in('session_id', ids),
    db.from('session_sujets').select('*').in('session_id', ids).eq('visible_prof', true),
    db.from('session_retours').select('*').eq('professeur_id', prof.id).in('session_id', ids),
  ]);

  const eleves = new Map<string, number>();
  for (const i of (inscriptionsRes.data ?? []) as { session_id: string | null }[]) {
    if (!i.session_id) continue;
    eleves.set(i.session_id, (eleves.get(i.session_id) ?? 0) + 1);
  }
  const sujets = (sujetsRes.error ? [] : ((sujetsRes.data ?? []) as SujetSession[]));
  const retours = (retoursRes.error ? [] : ((retoursRes.data ?? []) as RetourSession[]));
  const retourParSession = new Map(retours.map((r) => [r.session_id, r]));

  return ((sessionsRes.data ?? []) as Record<string, unknown>[]).map((s) => {
    const id = String(s.id);
    const jours = joursAvant(String(s.date_epreuve));
    const retour = retourParSession.get(id) ?? null;
    return {
      session_id: id,
      matiere: String(s.matiere ?? ''),
      date_epreuve: String(s.date_epreuve),
      heure_debut: (s.heure_debut as string) ?? null,
      heure_fin: (s.heure_fin as string) ?? null,
      jours,
      passe: jours < 0,
      nb_eleves: eleves.get(id) ?? 0,
      sujets: sujets.filter((x) => x.session_id === id),
      retour,
      retour_attendu: jours < 0 && !retour,
    };
  });
}

/** Ce prof est-il assigné à cette session ? Garde de toutes les routes prof. */
export async function profAssigneA(professeurId: string, sessionId: string): Promise<boolean> {
  const { data } = await crmAdmin()
    .from('session_coachs')
    .select('id')
    .eq('professeur_id', professeurId)
    .eq('session_id', sessionId)
    .maybeSingle();
  return Boolean(data);
}

export type ReponsesRetour = Partial<
  Pick<
    RetourSession,
    | 'deroulement'
    | 'nb_eleves_presents'
    | 'nb_eleves_absents'
    | 'duree_adaptee'
    | 'difficulte_sujet'
    | 'niveau_eleves'
    | 'incidents'
    | 'retours_eleves'
    | 'besoins'
    | 'note_organisation'
    | 'recommanderait'
  >
>;

// --- Côté élève -------------------------------------------------------

/** Durée d'un lien de sujet remis à un élève. Très court : il ne se partage pas. */
const VALIDITE_LIEN_ELEVE_S = 300; // 5 minutes

export type SujetEleve = {
  sujet_id: string;
  session_id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  debut_le: string | null;
  titre: string | null;
  consigne: string | null;
  fichier_nom: string | null;
  /** Le sujet est ouvert : l'élève peut le télécharger maintenant. */
  disponible: boolean;
  /** Sinon, l'heure à laquelle il s'ouvrira — quand elle est connue. */
  ouverture_prevue: string | null;
};

/**
 * Les sessions auxquelles cette adresse est inscrite.
 *
 * `inscriptions.session_id` est la voie normale, mais toutes les lignes ne
 * l'ont pas : les inscriptions anciennes ne portent que la matière et la date.
 * On rattrape ces lignes-là par (matière, date), sinon un élève inscrit avant
 * la mise en place des sessions ne verrait jamais son sujet.
 */
export async function sessionsDeLEleve(email: string): Promise<string[]> {
  const db = crmAdmin();
  const adresse = (email ?? '').trim().toLowerCase();
  if (!adresse.includes('@')) return [];

  const [insRes, sessionsRes] = await Promise.all([
    db.from('inscriptions').select('session_id, matiere, date_epreuve').ilike('email', adresse),
    db.from('sessions_bacs_blancs').select('id, matiere, date_epreuve'),
  ]);

  const inscriptions = (insRes.data ?? []) as {
    session_id: string | null;
    matiere: string | null;
    date_epreuve: string | null;
  }[];
  const sessions = (sessionsRes.data ?? []) as { id: string; matiere: string; date_epreuve: string }[];

  const parCle = new Map(sessions.map((s) => [`${normaliserMatiere(s.matiere)}|${s.date_epreuve}`, s.id]));
  const ids = new Set<string>();
  for (const i of inscriptions) {
    if (i.session_id) {
      ids.add(i.session_id);
      continue;
    }
    if (!i.date_epreuve) continue;
    const trouve = parCle.get(`${normaliserMatiere(i.matiere)}|${i.date_epreuve}`);
    if (trouve) ids.add(trouve);
  }
  return [...ids];
}

/**
 * Les sujets des sessions de cet élève.
 *
 * Deux filtres, non négociables : `type = 'sujet'` (jamais un corrigé) et une
 * session à laquelle l'élève est réellement inscrit. Le sujet non encore
 * ouvert apparaît quand même, sans fichier, avec son heure d'ouverture : c'est
 * ce qui évite les « je ne trouve pas le sujet » cinq minutes avant l'épreuve.
 */
export async function sujetsPourEleve(email: string): Promise<SujetEleve[]> {
  const db = crmAdmin();
  const ids = await sessionsDeLEleve(email);
  if (!ids.length) return [];

  const [sessionsRes, sujetsRes] = await Promise.all([
    chargerSessions(db).then((r) => r),
    db.from('session_sujets').select('*').in('session_id', ids).eq('type', 'sujet'),
  ]);
  if (sujetsRes.error) return []; // table absente : rien à montrer, pas d'erreur 500

  const sessions = new Map(
    ((sessionsRes.data ?? []) as Record<string, unknown>[])
      .filter((s) => ids.includes(String(s.id)))
      .map((s) => [String(s.id), s]),
  );

  return ((sujetsRes.data ?? []) as SujetSession[])
    .map((s): SujetEleve | null => {
      const ses = sessions.get(s.session_id);
      if (!ses) return null;
      const debutLe = (ses.debut_le as string) ?? null;
      const prevue = publicationPrevue(s, debutLe);
      return {
        sujet_id: s.id,
        session_id: s.session_id,
        matiere: String(ses.matiere ?? ''),
        date_epreuve: String(ses.date_epreuve ?? ''),
        heure_debut: (ses.heure_debut as string) ?? null,
        debut_le: debutLe,
        titre: s.titre,
        consigne: s.consigne,
        fichier_nom: s.visible_eleve ? s.fichier_nom : null,
        disponible: s.visible_eleve === true && Boolean(s.fichier_path),
        ouverture_prevue: s.visible_eleve ? null : (s.publication_active ? prevue?.toISOString() ?? null : null),
      };
    })
    .filter((x): x is SujetEleve => x !== null)
    .sort((a, b) => a.date_epreuve.localeCompare(b.date_epreuve));
}

/**
 * Lien de téléchargement d'un sujet pour un élève, ou `null` s'il n'y a pas
 * droit. Trois conditions, vérifiées ici et non chez l'appelant : le sujet est
 * de type `sujet`, il est ouvert, et l'élève est inscrit à cette session.
 */
export async function lienSujetEleve(sujetId: string, email: string): Promise<string | null> {
  const db = crmAdmin();
  const { data } = await db
    .from('session_sujets')
    .select('id, session_id, type, fichier_path, visible_eleve')
    .eq('id', sujetId)
    .maybeSingle();

  const sujet = data as Pick<SujetSession, 'id' | 'session_id' | 'type' | 'fichier_path' | 'visible_eleve'> | null;
  if (!sujet || sujet.type !== 'sujet' || !sujet.visible_eleve || !sujet.fichier_path) return null;

  const ids = await sessionsDeLEleve(email);
  if (!ids.includes(sujet.session_id)) return null;

  const { data: signe, error } = await db.storage
    .from(BUCKET_SUJETS)
    .createSignedUrl(sujet.fichier_path, VALIDITE_LIEN_ELEVE_S);
  if (error || !signe) return null;

  // Trace : qui a ouvert quel sujet, et quand. Non bloquant.
  await db
    .from('sujet_telechargements')
    .insert({ sujet_id: sujet.id, session_id: sujet.session_id, email: email.trim().toLowerCase() })
    .then(({ error: err }) => {
      if (err) console.warn('⚠️ journal de téléchargement indisponible :', err.message);
    });

  return signe.signedUrl;
}

/** Un prof, une session, un retour : on écrase le sien, jamais celui d'un autre. */
export async function enregistrerRetour(
  sessionId: string,
  professeurId: string,
  reponses: ReponsesRetour,
): Promise<void> {
  const { error } = await crmAdmin()
    .from('session_retours')
    .upsert(
      { session_id: sessionId, professeur_id: professeurId, ...reponses },
      { onConflict: 'session_id,professeur_id' },
    );
  if (error) throw error;
}
