/**
 * Résumé Direction — ce qu'il faut savoir en un écran, tout projet confondu.
 *
 * ⚠️ SERVEUR UNIQUEMENT : lit les deux bases (CRM et pipeline de correction)
 * avec des clés service_role.
 *
 * Pourquoi ce module : les consoles existantes (/admin/bacs-blancs,
 * /admin/correction, /admin/emails, /admin/discord) montrent chacune un morceau
 * du travail, très en détail. Il manquait la vue de direction : combien de bacs
 * blancs arrivent, lesquels n'ont pas de sujet, ce que la machine à corriger est
 * en train de faire, ce que les e-mails vont envoyer, qui attend un accès.
 *
 * Règle de robustesse : chaque bloc est isolé. Une base injoignable, une table
 * pas encore créée ou une variable manquante rend ce bloc « indisponible » avec
 * la raison — jamais une page en erreur. L'administratrice doit toujours voir
 * les blocs qui, eux, fonctionnent.
 */
import { crmAdmin, CHAMPS_PROF, type Professeur } from '@/lib/authProf';
import { chargerEtatBacsBlancs, type BacBlanc } from '@/lib/bacsBlancs';
import { discordManquant } from '@/lib/discord/config';
import { emailsManquant } from '@/lib/emails/config';
import { chargerPaiements } from '@/lib/paiements';
import { pipelineDb, pipelineManquant, STATUTS_CORRIGE, STATUTS_ECHEC } from '@/lib/pipeline';

// --- Formes -----------------------------------------------------------

/** Un bloc peut toujours être indisponible : on dit pourquoi, jamais « erreur ». */
export type Indispo = { disponible: false; raison: string; manquants: string[] };
export type Dispo<T> = { disponible: true } & T;
export type Bloc<T> = Dispo<T> | Indispo;

export type ProchainBac = {
  id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  jours: number;
  nb_eleves: number;
  nb_profs: number;
  /** Un sujet est « prêt » quand un fichier est déposé. */
  sujet_pret: boolean;
  /** Le sujet s'ouvrira tout seul dans l'espace élève. */
  publication_auto: boolean;
  /** Déjà ouvert aux élèves. */
  publie: boolean;
};

export type ResumeBacs = {
  a_venir: number;
  prochains: ProchainBac[];
  sans_sujet: number;
  sans_prof: number;
  retours_manquants: number;
  tables_manquantes: string[];
};

export type ResumeCorrection = {
  en_cours: number;
  corrigees_7j: number;
  en_erreur: number;
  total_30j: number;
  cout_30j_usd: number;
};

export type ResumeEmails = {
  en_attente: number;
  programmes: number;
  envoyes_7j: number;
  en_erreur: number;
  bloques: number;
  /** Brevo répond-il ? Sans clé, la file s'empile sans jamais partir. */
  actif: boolean;
};

export type ResumeProfs = {
  total: number;
  en_attente_validation: number;
  sans_matiere: number;
  sans_compte: number;
  suspendus: number;
  derniers: { id: string; nom: string; matieres: string[]; depuis: string; statut: string }[];
};

export type ResumePaiements = {
  en_attente: number;
  payes: number;
  /** Inscriptions impayées depuis plus d'une semaine. */
  en_retard: number;
  encaisse: number;
  /** Le classeur de suivi financier est-il relié ? */
  classeur: boolean;
};

export type ResumeDiscord = {
  configure: boolean;
  manquants: string[];
};

/** Une chose à faire, formulée comme une phrase d'action. */
export type Tache = {
  cle: string;
  urgence: 'rouge' | 'orange' | 'info';
  titre: string;
  detail: string;
  lien: string;
  libelleLien: string;
};

export type ResumeDirection = {
  genere_le: string;
  bacs: Bloc<ResumeBacs>;
  correction: Bloc<ResumeCorrection>;
  paiements: Bloc<ResumePaiements>;
  emails: Bloc<ResumeEmails>;
  profs: Bloc<ResumeProfs>;
  discord: ResumeDiscord;
  taches: Tache[];
};

// --- Outils -----------------------------------------------------------

const indispo = (raison: string, manquants: string[] = []): Indispo => ({
  disponible: false,
  raison,
  manquants,
});

const ilYA = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString();

/** Ordre de grandeur constaté par copie (transcription + correction + dossier). */
const USD_PAR_COPIE = 0.22;

/** Statuts d'une copie encore en cours de traitement. */
const STATUTS_EN_COURS = ['uploaded', 'transcribing', 'transcribed', 'transcription_review', 'correcting'];

// --- Blocs ------------------------------------------------------------

async function resumeBacs(): Promise<Bloc<ResumeBacs>> {
  const etat = await chargerEtatBacsBlancs();
  const futurs = etat.bacs_blancs.filter((b) => !b.passe);
  const passes = etat.bacs_blancs.filter((b) => b.passe);

  const carte = (b: BacBlanc): ProchainBac => {
    const avecFichier = b.sujets.filter((s) => s.fichier_path);
    return {
      id: b.id,
      matiere: b.matiere,
      date_epreuve: b.date_epreuve,
      heure_debut: b.heure_debut,
      jours: b.jours,
      nb_eleves: b.nb_eleves,
      nb_profs: b.profs.length,
      sujet_pret: avecFichier.length > 0,
      publication_auto: avecFichier.some((s) => s.publication_active),
      publie: avecFichier.some((s) => s.visible_eleve),
    };
  };

  return {
    disponible: true,
    a_venir: futurs.length,
    prochains: futurs.slice(0, 6).map(carte),
    sans_sujet: futurs.filter((b) => !b.sujets.some((s) => s.fichier_path)).length,
    sans_prof: futurs.filter((b) => b.profs.length === 0).length,
    retours_manquants: passes.reduce((n, b) => n + b.retours_attendus, 0),
    tables_manquantes: etat.tables_manquantes,
  };
}

async function resumeCorrection(): Promise<Bloc<ResumeCorrection>> {
  const manquants = pipelineManquant();
  if (manquants.length) {
    return indispo('La base de correction n’est pas reliée à ce déploiement.', manquants);
  }

  const db = pipelineDb();
  const compter = async (construire: (q: ReturnType<typeof db.from>) => unknown) => {
    const requete = construire(db.from('corrections')) as unknown as Promise<{ count: number | null }>;
    const { count } = await requete;
    return count ?? 0;
  };

  const [en_cours, corrigees_7j, en_erreur, total_30j] = await Promise.all([
    compter((q) => q.select('id', { count: 'exact', head: true }).in('status', STATUTS_EN_COURS)),
    compter((q) =>
      q.select('id', { count: 'exact', head: true }).in('status', STATUTS_CORRIGE).gte('created_at', ilYA(7)),
    ),
    compter((q) => q.select('id', { count: 'exact', head: true }).in('status', STATUTS_ECHEC)),
    compter((q) => q.select('id', { count: 'exact', head: true }).gte('created_at', ilYA(30))),
  ]);

  return {
    disponible: true,
    en_cours,
    corrigees_7j,
    en_erreur,
    total_30j,
    cout_30j_usd: Math.round(total_30j * USD_PAR_COPIE * 100) / 100,
  };
}

async function resumePaiements(): Promise<Bloc<ResumePaiements>> {
  const etat = await chargerPaiements();
  return {
    disponible: true,
    en_attente: etat.en_attente,
    payes: etat.payes,
    en_retard: etat.lignes.filter((l) => l.jours_depuis > 7).length,
    encaisse: etat.encaisse,
    classeur: etat.classeur_url !== null,
  };
}

async function resumeEmails(): Promise<Bloc<ResumeEmails>> {
  const manquants = emailsManquant();
  const db = crmAdmin();

  const { data, error } = await db.from('emails').select('statut, planifie_le, envoye_le').limit(5000);
  if (error) {
    return indispo('La file d’e-mails n’est pas encore installée dans Supabase.', manquants);
  }

  const lignes = (data ?? []) as { statut: string; planifie_le: string | null; envoye_le: string | null }[];
  const maintenant = Date.now();
  const seuil7j = maintenant - 7 * 86_400_000;

  let en_attente = 0;
  let programmes = 0;
  let envoyes_7j = 0;
  let en_erreur = 0;
  let bloques = 0;

  for (const l of lignes) {
    // « En attente » = son heure est passée, il devrait déjà être parti.
    const du = l.planifie_le ? new Date(l.planifie_le).getTime() : 0;
    if (l.statut === 'pending' || l.statut === 'scheduled' || l.statut === 'processing') {
      if (du <= maintenant) en_attente += 1;
      else programmes += 1;
    }
    if (l.statut === 'sent' || l.statut === 'delivered') {
      if (l.envoye_le && new Date(l.envoye_le).getTime() >= seuil7j) envoyes_7j += 1;
    }
    if (l.statut === 'failed') en_erreur += 1;
    if (l.statut === 'bloque') bloques += 1;
  }

  return {
    disponible: true,
    en_attente,
    programmes,
    envoyes_7j,
    en_erreur,
    bloques,
    actif: manquants.length === 0,
  };
}

async function resumeProfs(): Promise<Bloc<ResumeProfs>> {
  const { data, error } = await crmAdmin()
    .from('professeurs')
    .select(CHAMPS_PROF)
    .order('created_at', { ascending: false });

  if (error) return indispo('La table des professeurs est illisible.', []);

  const profs = (data ?? []) as unknown as Professeur[];
  return {
    disponible: true,
    total: profs.length,
    en_attente_validation: profs.filter((p) => p.statut_candidature === 'en_attente').length,
    sans_matiere: profs.filter((p) => (p.matieres ?? []).length === 0).length,
    sans_compte: profs.filter((p) => !p.user_id).length,
    suspendus: profs.filter((p) => p.statut_compte === 'suspendu').length,
    derniers: profs.slice(0, 5).map((p) => ({
      id: p.id,
      nom: `${p.prenom} ${p.nom}`.trim(),
      matieres: p.matieres ?? [],
      depuis: p.created_at,
      statut: p.statut_candidature,
    })),
  };
}

// --- Ce qu'il reste à faire -------------------------------------------

function construireTaches(r: Omit<ResumeDirection, 'taches' | 'genere_le'>): Tache[] {
  const taches: Tache[] = [];
  // « 5 bac blancs » se dit « 5 bacs blancs » : le pluriel se pose sur chaque
  // mot, pas seulement sur le dernier.
  const pluriel = (n: number, singulier: string, plurielExplicite?: string) =>
    `${n} ${n > 1 ? (plurielExplicite ?? `${singulier}s`) : singulier}`;

  if (r.bacs.disponible) {
    // Un sujet manquant à moins d'une semaine, c'est le sujet numéro un.
    const urgents = r.bacs.prochains.filter((b) => !b.sujet_pret && b.jours <= 7);
    if (urgents.length) {
      taches.push({
        cle: 'sujets-urgents',
        urgence: 'rouge',
        titre: `${pluriel(urgents.length, 'bac blanc', 'bacs blancs')} sans sujet dans moins d’une semaine`,
        detail: urgents.map((b) => `${b.matiere} (J-${Math.max(0, b.jours)})`).join(' · '),
        lien: '/admin/bacs-blancs',
        libelleLien: 'Déposer le sujet',
      });
    } else if (r.bacs.sans_sujet > 0) {
      taches.push({
        cle: 'sujets',
        urgence: 'orange',
        titre: `${pluriel(r.bacs.sans_sujet, 'bac blanc', 'bacs blancs')} à venir sans sujet déposé`,
        detail: 'Le sujet s’ouvre tout seul dans l’espace élève, mais encore faut-il l’avoir déposé.',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Déposer le sujet',
      });
    }

    if (r.bacs.sans_prof > 0) {
      taches.push({
        cle: 'profs-manquants',
        urgence: 'orange',
        titre: `${pluriel(r.bacs.sans_prof, 'bac blanc', 'bacs blancs')} sans professeur assigné`,
        detail: 'Personne n’encadre encore l’épreuve.',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Assigner un prof',
      });
    }

    if (r.bacs.retours_manquants > 0) {
      taches.push({
        cle: 'retours',
        urgence: 'info',
        titre: `${pluriel(r.bacs.retours_manquants, 'retour')} de prof en attente`,
        detail: 'Épreuves passées dont le professeur n’a pas encore raconté le déroulement.',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Voir les retours',
      });
    }

    if (r.bacs.tables_manquantes.length) {
      taches.push({
        cle: 'sql-bacs',
        urgence: 'rouge',
        titre: 'Du SQL n’a pas encore été joué dans Supabase',
        detail: `Tables absentes : ${r.bacs.tables_manquantes.join(', ')}.`,
        lien: '/admin/bacs-blancs',
        libelleLien: 'Voir la marche à suivre',
      });
    }
  }

  if (r.correction.disponible && r.correction.en_erreur > 0) {
    taches.push({
      cle: 'corrections-erreur',
      urgence: 'rouge',
      titre: `${pluriel(r.correction.en_erreur, 'copie bloquée', 'copies bloquées')} en correction`,
      detail: 'La lecture ou la correction s’est arrêtée en cours de route.',
      lien: '/admin/correction',
      libelleLien: 'Ouvrir le pilotage',
    });
  }

  if (r.paiements.disponible) {
    if (r.paiements.en_retard > 0) {
      taches.push({
        cle: 'paiements-retard',
        urgence: 'orange',
        titre: `${pluriel(r.paiements.en_retard, 'inscription impayée', 'inscriptions impayées')} depuis plus d’une semaine`,
        detail: 'Les relances partent seules, mais au-delà d’une semaine mieux vaut un appel.',
        lien: '/admin/paiements',
        libelleLien: 'Voir les paiements',
      });
    }
    if (!r.paiements.classeur) {
      taches.push({
        cle: 'classeur-financier',
        urgence: 'info',
        titre: 'Le classeur de suivi financier n’est pas relié',
        detail: 'Une variable à poser (NEXT_PUBLIC_SUIVI_FINANCIER_URL) et l’onglet Paiements l’ouvre directement.',
        lien: '/admin/paiements',
        libelleLien: 'Voir comment faire',
      });
    }
  }

  if (r.emails.disponible) {
    if (!r.emails.actif && r.emails.en_attente + r.emails.programmes > 0) {
      taches.push({
        cle: 'emails-inertes',
        urgence: 'rouge',
        titre: 'Les e-mails s’accumulent sans partir',
        detail:
          'La clé Brevo manque : les messages sont bien préparés et rangés dans la file, mais rien n’est envoyé.',
        lien: '/admin/emails',
        libelleLien: 'Voir la file',
      });
    } else if (r.emails.en_erreur > 0) {
      taches.push({
        cle: 'emails-erreur',
        urgence: 'orange',
        titre: `${pluriel(r.emails.en_erreur, 'e-mail')} en échec`,
        detail: 'Adresse invalide, refus de Brevo… à relancer ou à annuler.',
        lien: '/admin/emails',
        libelleLien: 'Ouvrir les e-mails',
      });
    }
  }

  if (r.profs.disponible) {
    if (r.profs.en_attente_validation > 0) {
      taches.push({
        cle: 'candidatures',
        urgence: 'orange',
        titre: `${pluriel(r.profs.en_attente_validation, 'candidature')} de prof à valider`,
        detail: 'Tant que la candidature est en attente, le prof ne voit aucun bac blanc.',
        lien: '/admin/profs',
        libelleLien: 'Ouvrir les accès',
      });
    }
    if (r.profs.sans_matiere > 0) {
      taches.push({
        cle: 'profs-sans-matiere',
        urgence: 'info',
        titre: `${pluriel(r.profs.sans_matiere, 'prof')} sans matière renseignée`,
        detail: 'Sans matière, son espace reste vide : il ne peut se positionner sur rien.',
        lien: '/admin/profs',
        libelleLien: 'Renseigner la matière',
      });
    }
    if (r.profs.sans_compte > 0) {
      taches.push({
        cle: 'profs-sans-compte',
        urgence: 'info',
        titre: `${pluriel(r.profs.sans_compte, 'prof')} sans identifiant de connexion`,
        detail: 'Il faut lui définir un mot de passe pour qu’il puisse entrer.',
        lien: '/admin/profs',
        libelleLien: 'Créer l’accès',
      });
    }
  }

  if (!r.discord.configure) {
    taches.push({
      cle: 'discord',
      urgence: 'info',
      titre: 'Discord n’est pas encore relié',
      detail: `Variables manquantes : ${r.discord.manquants.join(', ')}.`,
      lien: '/admin/discord',
      libelleLien: 'Configurer Discord',
    });
  }

  const rang = { rouge: 0, orange: 1, info: 2 };
  return taches.sort((a, b) => rang[a.urgence] - rang[b.urgence]);
}

// --- Entrée -----------------------------------------------------------

/**
 * Le résumé complet. Chaque bloc est protégé : une panne d'un côté n'empêche
 * jamais d'afficher l'autre.
 */
export async function chargerResumeDirection(): Promise<ResumeDirection> {
  const sur = async <T,>(bloc: () => Promise<Bloc<T>>, quoi: string): Promise<Bloc<T>> => {
    try {
      return await bloc();
    } catch (err) {
      console.error(`❌ Résumé direction — ${quoi}`, err);
      return indispo(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const [bacs, correction, paiements, emails, profs] = await Promise.all([
    sur(resumeBacs, 'bacs blancs'),
    sur(resumeCorrection, 'correction'),
    sur(resumePaiements, 'paiements'),
    sur(resumeEmails, 'e-mails'),
    sur(resumeProfs, 'professeurs'),
  ]);

  const manquantsDiscord = discordManquant();
  const partiel = {
    bacs,
    correction,
    paiements,
    emails,
    profs,
    discord: { configure: manquantsDiscord.length === 0, manquants: manquantsDiscord },
  };

  return {
    genere_le: new Date().toISOString(),
    ...partiel,
    taches: construireTaches(partiel),
  };
}
