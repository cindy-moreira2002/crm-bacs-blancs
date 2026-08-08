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

// --- Lecture (administratrice) ---------------------------------------

export async function chargerEtatBacsBlancs(): Promise<EtatBacsBlancs> {
  const db = crmAdmin();

  const [sessionsRes, inscriptionsRes, coachsRes, profsRes, sujetsRes, retoursRes] = await Promise.all([
    db
      .from('sessions_bacs_blancs')
      .select('id, matiere, date_epreuve, heure_debut, heure_fin, places, coachs_recherches, statut')
      .order('date_epreuve', { ascending: true }),
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
    return {
      id,
      matiere: String(s.matiere ?? ''),
      date_epreuve: String(s.date_epreuve),
      heure_debut: (s.heure_debut as string) ?? null,
      heure_fin: (s.heure_fin as string) ?? null,
      places: (s.places as number) ?? null,
      coachs_recherches: (s.coachs_recherches as number) ?? null,
      statut: (s.statut as string) ?? null,
      nb_eleves: elevesParSession.get(id) ?? 0,
      jours,
      passe: jours < 0,
      profs: profsSession,
      sujets: sujetsParSession.get(id) ?? [],
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
  patch: Partial<Pick<SujetSession, 'titre' | 'consigne' | 'type' | 'visible_prof' | 'subject_card_id'>>,
): Promise<void> {
  const { error } = await crmAdmin().from('session_sujets').update(patch).eq('id', sujetId);
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
