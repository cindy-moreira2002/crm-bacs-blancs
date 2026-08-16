/**
 * Paiements des PROFS — ce que Les Matinées du Bac doivent, et à qui.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du CRM).
 *
 * Deux sources d'argent, jamais mélangées à l'écran :
 *
 *   • coaching    — la rémunération d'un bac blanc surveillé. Elle est
 *                   d'abord PRÉVUE (`session_coachs.remuneration`, posée
 *                   quand le prof s'inscrit sur la session), puis DUE une
 *                   fois l'épreuve passée : c'est à ce moment qu'on en fait
 *                   une ligne de `revenus_prof`, qui est le registre des
 *                   sommes à virer.
 *   • affiliation — 10 € par élève amené par le lien du prof, dus seulement
 *                   quand CET élève a payé (voir `src/lib/affiliation.ts`).
 *
 * La comptabilité reste dans le classeur de suivi financier ; cette page dit
 * seulement quel virement faire à qui, et permet de cocher « viré ».
 */
import { crmAdmin } from '@/lib/authProf';
import { MONTANT_AFFILIATION, normaliserCode } from '@/lib/affiliation';

export type LigneRevenu = {
  id: string;
  type: 'affiliation' | 'coaching' | string;
  montant: number;
  libelle: string | null;
  statut: 'a_payer' | 'paye' | string;
  session: string | null;
  cree_le: string;
};

export type CoachingPrevu = {
  /** Clé composite session+prof : il n'y a pas encore de ligne de revenu. */
  session_id: string;
  professeur_id: string;
  session: string;
  date_epreuve: string;
  montant: number;
  /** L'épreuve a-t-elle déjà eu lieu ? Avant, ce n'est qu'une prévision. */
  passee: boolean;
};

export type ProfAPayer = {
  id: string;
  nom_complet: string;
  email: string;
  iban: string | null;
  titulaire_compte: string | null;
  code_affiliation: string;
  /** Somme des lignes `a_payer` : le montant du prochain virement. */
  a_virer: number;
  affiliation_due: number;
  coaching_du: number;
  deja_verse: number;
  eleves_parraines: number;
  /** Élèves amenés mais qui n'ont pas encore payé : rien n'est dû pour eux. */
  eleves_en_attente: number;
  lignes: LigneRevenu[];
  coaching_prevu: CoachingPrevu[];
};

export type Parrainage = {
  inscription_id: string;
  eleve: string;
  email: string | null;
  matiere: string | null;
  date_epreuve: string | null;
  inscrit_le: string;
  code: string;
  /** Le prof reconnu derrière ce code, ou null si le code ne correspond à rien. */
  prof: string | null;
  professeur_id: string | null;
  paiement_eleve: string;
  /** État des 10 €  : dus, déjà virés, ou en attente du paiement de l'élève. */
  etat_prime: 'a_payer' | 'paye' | 'en_attente_eleve' | 'code_inconnu';
};

export type EtatPaiementsProfs = {
  montant_affiliation: number;
  total_a_virer: number;
  total_affiliation_due: number;
  total_coaching_du: number;
  total_deja_verse: number;
  /** Les colonnes IBAN existent-elles en base (script 47 joué) ? */
  virements_prets: boolean;
  profs: ProfAPayer[];
  parrainages: Parrainage[];
};

const CHAMPS_PROF_AVEC_IBAN =
  'id, prenom, nom, email, code_affiliation, statut_compte, iban, titulaire_compte';
const CHAMPS_PROF_SANS_IBAN = 'id, prenom, nom, email, code_affiliation, statut_compte';

type LigneProf = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  code_affiliation: string;
  statut_compte: string | null;
  iban?: string | null;
  titulaire_compte?: string | null;
};

const jour = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';

export async function chargerPaiementsProfs(): Promise<EtatPaiementsProfs> {
  const db = crmAdmin();

  // L'IBAN n'existe qu'une fois le script 47 joué : sans ce repli, toute la
  // page tomberait pour une colonne manquante.
  let virementsPrets = true;
  let { data: profsData, error: erreurProfs } = await db
    .from('professeurs')
    .select(CHAMPS_PROF_AVEC_IBAN);
  if (erreurProfs && /iban|titulaire_compte/i.test(erreurProfs.message ?? '')) {
    virementsPrets = false;
    ({ data: profsData, error: erreurProfs } = await db
      .from('professeurs')
      .select(CHAMPS_PROF_SANS_IBAN));
  }
  const profs = (erreurProfs ? [] : ((profsData ?? []) as unknown as LigneProf[]));

  // `inscription_id` n'existe qu'après le script 47, même raison.
  const lireRevenus = async (colonnes: string) =>
    db.from('revenus_prof').select(colonnes).order('created_at', { ascending: false });

  let reponseRevenus = await lireRevenus(
    'id, professeur_id, type, montant, statut, libelle, session_id, inscription_id, created_at',
  );
  if (reponseRevenus.error && /inscription_id/i.test(reponseRevenus.error.message ?? '')) {
    reponseRevenus = await lireRevenus(
      'id, professeur_id, type, montant, statut, libelle, session_id, created_at',
    );
  }
  const revenus = (reponseRevenus.error ? [] : (reponseRevenus.data ?? [])) as unknown as {
    id: string;
    professeur_id: string;
    type: string;
    montant: number | string | null;
    statut: string;
    libelle: string | null;
    session_id: string | null;
    inscription_id?: string | null;
    created_at: string;
  }[];

  const [{ data: sessionsData }, { data: coachsData }, { data: inscriptionsData }] =
    await Promise.all([
      db.from('sessions_bacs_blancs').select('id, matiere, date_epreuve'),
      db.from('session_coachs').select('session_id, professeur_id, statut, remuneration'),
      db
        .from('inscriptions')
        .select('id, nom, email, matiere, date_epreuve, created_at, code_affiliation, paiement_statut, annulee_le')
        .not('code_affiliation', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

  const sessions = new Map<string, { matiere: string; date_epreuve: string }>();
  for (const s of (sessionsData ?? []) as { id: string; matiere: string; date_epreuve: string }[]) {
    sessions.set(s.id, { matiere: s.matiere, date_epreuve: s.date_epreuve });
  }
  const libelleSession = (id: string | null) => {
    if (!id) return null;
    const s = sessions.get(id);
    return s ? `${s.matiere} · ${jour(s.date_epreuve)}` : null;
  };

  // --- Parrainages : une ligne par élève venu avec un code ----------------
  const parCode = new Map<string, LigneProf>();
  for (const p of profs) parCode.set(normaliserCode(p.code_affiliation), p);

  const revenusParInscription = new Map<string, { statut: string }>();
  for (const r of revenus) {
    if (r.type === 'affiliation' && r.inscription_id) {
      revenusParInscription.set(r.inscription_id, { statut: r.statut });
    }
  }

  const parrainages: Parrainage[] = [];
  const parrainesParProf = new Map<string, { payes: number; attente: number }>();

  for (const i of (inscriptionsData ?? []) as {
    id: string;
    nom: string | null;
    email: string | null;
    matiere: string | null;
    date_epreuve: string | null;
    created_at: string;
    code_affiliation: string | null;
    paiement_statut: string | null;
    annulee_le: string | null;
  }[]) {
    const code = normaliserCode(i.code_affiliation);
    if (!code) continue;
    const prof = parCode.get(code) ?? null;
    const revenu = revenusParInscription.get(i.id);
    const payeParEleve = i.paiement_statut === 'paye' && !i.annulee_le;

    const etat: Parrainage['etat_prime'] = !prof
      ? 'code_inconnu'
      : revenu?.statut === 'paye'
        ? 'paye'
        : payeParEleve
          ? 'a_payer'
          : 'en_attente_eleve';

    if (prof) {
      const compte = parrainesParProf.get(prof.id) ?? { payes: 0, attente: 0 };
      if (payeParEleve) compte.payes += 1;
      else compte.attente += 1;
      parrainesParProf.set(prof.id, compte);
    }

    parrainages.push({
      inscription_id: i.id,
      eleve: i.nom ?? '—',
      email: i.email,
      matiere: i.matiere,
      date_epreuve: i.date_epreuve,
      inscrit_le: i.created_at,
      code,
      prof: prof ? `${prof.prenom} ${prof.nom}`.trim() : null,
      professeur_id: prof?.id ?? null,
      paiement_eleve: i.annulee_le ? 'annulee' : (i.paiement_statut ?? 'en_attente'),
      etat_prime: etat,
    });
  }

  // --- Coaching prévu mais pas encore transformé en dû -------------------
  const dejaEnRevenu = new Set(
    revenus.filter((r) => r.type === 'coaching' && r.session_id).map((r) => `${r.session_id}|${r.professeur_id}`),
  );
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const coachingPrevuParProf = new Map<string, CoachingPrevu[]>();

  for (const c of (coachsData ?? []) as {
    session_id: string;
    professeur_id: string;
    statut: string;
    remuneration: number | string | null;
  }[]) {
    if (c.statut === 'annule') continue;
    if (dejaEnRevenu.has(`${c.session_id}|${c.professeur_id}`)) continue;
    const s = sessions.get(c.session_id);
    if (!s) continue;
    const liste = coachingPrevuParProf.get(c.professeur_id) ?? [];
    liste.push({
      session_id: c.session_id,
      professeur_id: c.professeur_id,
      session: `${s.matiere} · ${jour(s.date_epreuve)}`,
      date_epreuve: s.date_epreuve,
      montant: Number(c.remuneration ?? 0),
      passee: s.date_epreuve < aujourdhui,
    });
    coachingPrevuParProf.set(c.professeur_id, liste);
  }

  // --- Agrégation par prof ----------------------------------------------
  const lignesParProf = new Map<string, LigneRevenu[]>();
  for (const r of revenus) {
    const liste = lignesParProf.get(r.professeur_id) ?? [];
    liste.push({
      id: r.id,
      type: r.type,
      montant: Number(r.montant ?? 0),
      libelle: r.libelle,
      statut: r.statut,
      session: libelleSession(r.session_id),
      cree_le: r.created_at,
    });
    lignesParProf.set(r.professeur_id, liste);
  }

  const listeProfs: ProfAPayer[] = profs
    .map((p) => {
      const lignes = lignesParProf.get(p.id) ?? [];
      const dues = lignes.filter((l) => l.statut === 'a_payer');
      const compte = parrainesParProf.get(p.id) ?? { payes: 0, attente: 0 };
      return {
        id: p.id,
        nom_complet: `${p.prenom} ${p.nom}`.trim(),
        email: p.email,
        iban: p.iban ?? null,
        titulaire_compte: p.titulaire_compte ?? null,
        code_affiliation: p.code_affiliation,
        a_virer: dues.reduce((s, l) => s + l.montant, 0),
        affiliation_due: dues.filter((l) => l.type === 'affiliation').reduce((s, l) => s + l.montant, 0),
        coaching_du: dues.filter((l) => l.type === 'coaching').reduce((s, l) => s + l.montant, 0),
        deja_verse: lignes.filter((l) => l.statut === 'paye').reduce((s, l) => s + l.montant, 0),
        eleves_parraines: compte.payes,
        eleves_en_attente: compte.attente,
        lignes,
        coaching_prevu: coachingPrevuParProf.get(p.id) ?? [],
      };
    })
    // Un prof sans un centime en jeu n'a rien à faire dans une page de virements.
    .filter((p) => p.a_virer > 0 || p.deja_verse > 0 || p.coaching_prevu.length > 0 || p.eleves_en_attente > 0)
    .sort((a, b) => b.a_virer - a.a_virer || a.nom_complet.localeCompare(b.nom_complet));

  return {
    montant_affiliation: MONTANT_AFFILIATION,
    total_a_virer: listeProfs.reduce((s, p) => s + p.a_virer, 0),
    total_affiliation_due: listeProfs.reduce((s, p) => s + p.affiliation_due, 0),
    total_coaching_du: listeProfs.reduce((s, p) => s + p.coaching_du, 0),
    total_deja_verse: listeProfs.reduce((s, p) => s + p.deja_verse, 0),
    virements_prets: virementsPrets,
    profs: listeProfs,
    parrainages,
  };
}
