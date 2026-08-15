/**
 * Résumé Direction — ce qu'il faut savoir en un écran, tout projet confondu.
 *
 * ⚠️ SERVEUR UNIQUEMENT : lit les deux bases (CRM et pipeline de correction)
 * avec des clés service_role.
 *
 * Pourquoi ce module : les consoles existantes (/admin/bacs-blancs,
 * /admin/correction, /admin/emails, /admin/discord, /admin/paiements) montrent
 * chacune un morceau du travail, très en détail — et elles restent la bonne
 * adresse pour COMPRENDRE. La Direction, elle, ne répond qu'à trois questions :
 *
 *   1. Qu'est-ce qui bloque aujourd'hui ?
 *   2. Quels bacs blancs sont prêts ?
 *   3. Qu'est-ce qu'il reste à tester avant les vrais bacs blancs ?
 *
 * D'où la règle qui gouverne tout ce fichier : **on déplace la précision, on ne
 * la supprime pas**. Chaque ligne produite ici tient en un libellé court et
 * pointe vers l'onglet qui l'explique en entier.
 *
 * Deuxième règle, non négociable (voir `calendrier.ts`) : une session datée
 * avant novembre 2026 est un ESSAI. Elle ne crée aucune urgence, jamais de
 * rouge, et vit dans sa propre section. La question qui vaut sur un essai est
 * « est-ce que la chaîne marche ? », pas « est-ce que je suis en retard ? ».
 *
 * Règle de robustesse : chaque bloc est isolé. Une base injoignable, une table
 * pas encore créée ou une variable manquante rend ce bloc « indisponible » avec
 * la raison — jamais une page en erreur.
 */
import { crmAdmin, CHAMPS_PROF, type Professeur } from '@/lib/authProf';
import { chargerEtatBacsBlancs, type BacBlanc } from '@/lib/bacsBlancs';
import { estSessionDeTest, LIBELLE_PREMIERE_SESSION } from '@/lib/calendrier';
import { discordManquant } from '@/lib/discord/config';
import { chargerEtatSalons, type SessionDiscord } from '@/lib/discord/salons';
import { chargerParcoursEleves, type LigneParcours } from '@/lib/emails/admin';
import { emailsManquant, estTypeEmail, LIBELLE_TYPE } from '@/lib/emails/config';
import { chargerReglages, validationManuelle } from '@/lib/emails/reglages';
import { chargerPaiements, type LignePaiement } from '@/lib/paiements';
import { pipelineDb, pipelineManquant, STATUTS_CORRIGE, STATUTS_ECHEC } from '@/lib/pipeline';
import { slugMatiere } from '@/lib/pipelineEtat';
import { chargerTodo, type TodoMatiere } from '@/lib/pipelineTodo';

// --- Formes -----------------------------------------------------------

/** Un bloc peut toujours être indisponible : on dit pourquoi, jamais « erreur ». */
export type Indispo = { disponible: false; raison: string; manquants: string[] };
export type Dispo<T> = { disponible: true } & T;
export type Bloc<T> = Dispo<T> | Indispo;

/**
 * Le vocabulaire de couleur, partout le même.
 *   bloque    — ça empêche quelque chose aujourd'hui ;
 *   attention — ça marchera, mais il manque une pièce ;
 *   ok        — rien à faire ;
 *   neutre    — sans objet ici (outil non relié, session sans élève…).
 */
export type EtatCase = 'ok' | 'attention' | 'bloque' | 'neutre';

/** Une colonne de la grille de préparation : un état, un mot. */
export type CaseEtat = { etat: EtatCase; libelle: string };

/** Le statut global d'une ligne. Deux vocabulaires : les essais, les vrais. */
export type CodeGlobal =
  // Vrais bacs blancs
  | 'brouillon'
  | 'a_preparer'
  | 'pret'
  | 'bloque'
  | 'termine'
  // Sessions d'essai
  | 'a_tester'
  | 'test_en_cours'
  | 'test_valide'
  | 'test_bloque';

const LIBELLE_GLOBAL: Record<CodeGlobal, string> = {
  brouillon: 'brouillon',
  a_preparer: 'à préparer',
  pret: 'prêt',
  bloque: 'bloqué',
  termine: 'terminé',
  a_tester: 'à tester',
  test_en_cours: 'test en cours',
  test_valide: 'test validé',
  test_bloque: 'test bloqué',
};

/**
 * Une ligne de la grille de préparation : un bac blanc, colonne par colonne.
 *
 * C'est la forme qui remplace l'ancien tableau « date / matière / élèves /
 * profs / sujet ». Chaque colonne répond à « est-ce que cette pièce est
 * posée ? » — et le statut global agrège le tout en un seul mot.
 */
export type LigneBac = {
  id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  jours: number;
  passe: boolean;
  /** Session d'essai (avant novembre 2026) : jamais une urgence. */
  test: boolean;
  nb_eleves: number;
  nb_profs: number;
  sujet: CaseEtat;
  prof: CaseEtat;
  discord: CaseEtat;
  emails: CaseEtat;
  paiement: CaseEtat;
  correction: CaseEtat;
  global: { code: CodeGlobal; libelle: string; etat: EtatCase };
  /** Le geste suivant sur cette ligne, et où le faire. */
  action: { label: string; href: string };
};

export type ResumeBacs = {
  /** Vrais bacs blancs à venir. Les essais sont comptés à part, exprès. */
  a_venir: number;
  tests_a_venir: number;
  /** Les vraies sessions, préparées ou non. */
  vrais: LigneBac[];
  /** Les sessions d'essai : la chaîne se vérifie là, pas ailleurs. */
  tests: LigneBac[];
  sans_sujet: number;
  sans_prof: number;
  retours_manquants: number;
  tables_manquantes: string[];
  /** « novembre 2026 » — le moment où les vraies sessions commencent. */
  premiere_vraie_session: string;
};

/** Ce qu'il faut savoir d'une matière côté correction, en une ligne. */
export type CorrectionMatiere = {
  matiere: string;
  label: string;
  examen: 'BAC' | 'DNB';
  /** Le résumé court, sans jargon : « étalons humains manquants ». */
  resume: string;
  etat: EtatCase;
  bloquants: number;
  /** La chaîne a-t-elle déjà tourné en entier ici ? */
  testee: boolean;
};

export type ResumeCorrection = {
  en_cours: number;
  corrigees_7j: number;
  en_erreur: number;
  total_30j: number;
  cout_30j_usd: number;
  /** Une ligne par matière, la plus risquée d'abord. Vide si le todo est illisible. */
  matieres: CorrectionMatiere[];
  /** Matières où aucune copie n'est jamais allée au bout. */
  jamais_testees: number;
  /** Matières dont aucun étalon n'a été relu par un humain. */
  sans_validation_humaine: number;
};

/** Une ligne du journal des départs : « ce mail-là est parti, à telle heure ». */
export type EnvoiRecent = {
  id: string;
  /** Libellé lisible du type de message (« Prof — affectation à une session »). */
  libelle: string;
  /** À qui : le nom quand on l'a, sinon l'adresse. */
  destinataire: string;
  email: string;
  role: string;
  /** ISO : l'heure de départ réelle pour un envoi fait, prévue pour un envoi à venir. */
  quand: string;
  /** `true` quand Brevo a confirmé la remise (webhook branché). */
  delivre: boolean;
  test: boolean;
};

export type ResumeEmails = {
  en_attente: number;
  programmes: number;
  envoyes_7j: number;
  en_erreur: number;
  bloques: number;
  /** Brevo répond-il ? Sans clé, la file s'empile sans jamais partir. */
  actif: boolean;
  /** `true` quand chaque message attend le feu vert de l'administratrice. */
  validation_manuelle: boolean;
  /** Inscriptions sans date d'épreuve : les quatre e-mails datés ne partiront pas. */
  inscriptions_sans_date: number;
  /** Inscriptions portant une adresse manifestement fictive (jeu d'essai). */
  adresses_test: number;
  /** Réglages vides qui empêchent un envoi de dire l'essentiel. */
  reglages_bloquants: string[];
  /** Les derniers messages réellement partis, du plus récent au plus ancien. */
  derniers_envois: EnvoiRecent[];
  /** Les prochains départs programmés, du plus proche au plus lointain. */
  prochains_envois: EnvoiRecent[];
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
  /** Somme encore à encaisser, prix par défaut compris. */
  attendu: number;
  /** Le classeur de suivi financier est-il relié ? */
  classeur: boolean;
  /** IBAN + référence renseignés dans les relances de paiement ? */
  instructions_pretes: boolean;
};

export type ResumeDiscord = {
  configure: boolean;
  manquants: string[];
  /** Nom du serveur, quand il répond. */
  serveur: string | null;
  /** Message d'erreur quand Discord ne répond pas. */
  erreur: string | null;
  /** Sessions à venir dont la catégorie n'existe pas encore. */
  salles_a_creer: number;
  /** Sessions à venir où au moins un élève n'a pas son lien. */
  liens_manquants: number;
  /** Élèves qui n'ont pas relié leur compte : leur salle leur restera fermée. */
  comptes_non_relies: number;
  /** Catégories qui traînent alors que la session n'existe plus. */
  categories_orphelines: number;
};

/**
 * Une chose à faire. Format imposé par l'usage : on veut lire, dans cet ordre,
 * la couleur, le domaine, ce qui manque, ce que ça casse, et le bouton.
 */
export type Tache = {
  cle: string;
  urgence: 'rouge' | 'orange' | 'info';
  /** « Paiement », « Bacs blancs », « E-mails »… : d'un coup d'œil, de quoi on parle. */
  domaine: string;
  /** Le sujet, court et factuel : « Sujet manquant », « 2 profs à valider ». */
  titre: string;
  /** Ce que ça casse, en une demi-phrase. Jamais d'explication du fonctionnement. */
  impact: string;
  /** Le détail utile (les matières concernées) quand il tient sur une ligne. */
  detail?: string;
  /** Un essai ne se traite pas comme une vraie session. */
  contexte: 'reel' | 'test' | 'general';
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

const ok = (libelle: string): CaseEtat => ({ etat: 'ok', libelle });
const attention = (libelle: string): CaseEtat => ({ etat: 'attention', libelle });
const bloque = (libelle: string): CaseEtat => ({ etat: 'bloque', libelle });
const neutre = (libelle: string): CaseEtat => ({ etat: 'neutre', libelle });

/** « 5 bac blanc » se dit « 5 bacs blancs » : le pluriel se pose sur chaque mot. */
const pluriel = (n: number, singulier: string, plurielExplicite?: string) =>
  `${n} ${n > 1 ? (plurielExplicite ?? `${singulier}s`) : singulier}`;

// --- La grille de préparation, colonne par colonne ---------------------

/** Le sujet est-il déposé, et jusqu'où est-il allé ? */
function caseSujet(b: BacBlanc): CaseEtat {
  const avecFichier = b.sujets.filter((s) => s.fichier_path);
  if (!avecFichier.length) return bloque('manquant');
  if (avecFichier.some((s) => s.visible_eleve)) return ok('prêt élève');
  if (avecFichier.some((s) => s.publication_active)) return ok('s’ouvre seul');
  if (avecFichier.some((s) => s.visible_prof)) return attention('visible prof');
  return attention('déposé');
}

/**
 * Qui encadre l'épreuve — et pourra-t-il vraiment entrer le jour J ?
 *
 * `statut` vaut « confirme » ou « annule » (contrainte SQL 09) : une
 * assignation annulée ne compte pas. Un prof confirmé mais dont le compte est
 * suspendu ne peut pas se connecter — c'est un vrai trou, pas un détail.
 */
function caseProf(b: BacBlanc): CaseEtat {
  const actifs = b.profs.filter((p) => p.statut !== 'annule');
  if (!actifs.length) return bloque('aucun');
  const suspendus = actifs.filter((p) => p.statut_compte === 'suspendu').length;
  if (suspendus > 0) return attention(`${suspendus} accès suspendu`);
  const attendus = b.coachs_recherches ?? 0;
  if (attendus > actifs.length) return attention(`partiel ${actifs.length}/${attendus}`);
  return ok('assigné');
}

/** L'état des salles vocales de CETTE session. */
function caseDiscord(
  b: BacBlanc,
  d: ResumeDiscord,
  session: SessionDiscord | undefined,
): CaseEtat {
  if (!d.configure) return neutre('non relié');
  if (d.erreur) return neutre('injoignable');
  if (!session) return neutre('—');

  if (b.passe) {
    if (!session.categorie_id) return neutre('rien à fermer');
    const ouvertes = session.salles.filter((s) => !s.verrouille).length;
    return ouvertes > 0 ? attention(`${ouvertes} salle(s) ouvertes`) : ok('fermé');
  }

  if (!session.categorie_id) return attention('salles à créer');
  if (session.manquantes > 0) return attention(`${session.manquantes} salle(s) à créer`);
  if (session.liens_deposes < session.nb_eleves) {
    return attention(`${session.nb_eleves - session.liens_deposes} lien(s) à déposer`);
  }
  if (session.nb_eleves > 0 && session.comptes_relies < session.nb_eleves) {
    return attention(`${session.nb_eleves - session.comptes_relies} compte(s) élève`);
  }
  return ok('prêt');
}

/** Les e-mails de cette session partiront-ils, et à de vraies adresses ? */
function caseEmails(
  b: BacBlanc,
  emails: Bloc<ResumeEmails>,
  lignes: LigneParcours[],
): CaseEtat {
  if (!emails.disponible) return neutre('non reliés');
  // Une session sans inscrit n'a personne à qui écrire : une panne d'envoi ne
  // la bloque pas. Sinon un problème global repeindrait toute la grille en
  // rouge et on ne verrait plus ce qui manque VRAIMENT à chaque ligne.
  if (b.nb_eleves === 0) return neutre('aucun élève');
  if (!emails.actif) return bloque('envoi à l’arrêt');
  if (!lignes.length) return neutre('—');

  const enEchec = lignes.reduce((n, l) => n + l.problemes, 0);
  if (enEchec > 0) return bloque(`${enEchec} en échec`);

  const tests = lignes.filter((l) => l.adresseDeTest).length;
  if (tests > 0) return attention(`${tests} adresse(s) test`);

  const avertis = lignes.filter((l) => l.avertissements.length > 0).length;
  if (avertis > 0) return attention(`${avertis} à vérifier`);

  if (emails.validation_manuelle && emails.en_attente > 0) return attention('validation requise');
  return ok('OK');
}

/** Qui a payé cette session — et l'e-mail de relance dit-il où payer ? */
function casePaiement(b: BacBlanc, p: Bloc<ResumePaiements>, impayes: LignePaiement[]): CaseEtat {
  if (!p.disponible) return neutre('non relié');
  if (b.nb_eleves === 0) return neutre('aucun élève');
  if (!impayes.length) return ok('à jour');
  if (!p.instructions_pretes) {
    return bloque(`${pluriel(impayes.length, 'impayé')}, où payer ?`);
  }
  return attention(`${pluriel(impayes.length, 'impayé')}`);
}

/** La machine à corriger est-elle prête pour cette matière ? */
function caseCorrection(b: BacBlanc, todo: TodoMatiere | undefined, dispo: boolean): CaseEtat {
  if (!dispo) return neutre('non reliée');
  if (!todo) return neutre('—');
  if (todo.bloquants > 0) return bloque(pluriel(todo.bloquants, 'point bloquant', 'points bloquants'));
  if (todo.corrections_reussies === 0) return attention('jamais testée');
  if (todo.etalons > 0 && todo.etalons_valides === 0) return attention('étalons non validés');
  if (todo.taches.length > 0) return attention(pluriel(todo.taches.length, 'point à régler', 'points à régler'));
  return ok('prête');
}

/**
 * Le statut global, et le geste suivant.
 *
 * Un essai ne peut jamais être « bloqué » au sens d'une vraie session : il est
 * « test bloqué », ce qui veut dire « la chaîne casse ici », pas « je suis en
 * retard ». Le mot change, la couleur reste — parce qu'un essai qui casse est
 * précisément l'information qu'on cherche.
 */
function statutGlobal(
  b: BacBlanc,
  test: boolean,
  cases: CaseEtat[],
): { code: CodeGlobal; libelle: string; etat: EtatCase } {
  const casse = cases.some((c) => c.etat === 'bloque');
  const incomplet = cases.some((c) => c.etat === 'attention');

  /**
   * Une date posée au calendrier, sans élève, sans sujet et sans prof, à plus
   * d'un mois : c'est un BROUILLON, pas un blocage. Le dire « bloqué » ferait
   * clignoter en rouge une session que personne n'a encore commencé à monter —
   * et noierait les vraies alertes. Passé un mois, la même ligne redevient un
   * vrai retard.
   */
  const vierge =
    !b.sujets.some((s) => s.fichier_path) && b.profs.length === 0 && b.nb_eleves === 0;
  const brouillon = vierge && !b.passe && b.jours > 30;

  const code: CodeGlobal = test
    ? brouillon
      ? 'a_tester'
      : casse
        ? 'test_bloque'
        : vierge
          ? 'a_tester'
          : incomplet
            ? 'test_en_cours'
            : 'test_valide'
    : b.passe
      ? 'termine'
      : brouillon
        ? 'brouillon'
        : casse
          ? 'bloque'
          : vierge
            ? 'brouillon'
            : incomplet
              ? 'a_preparer'
              : 'pret';

  const etat: EtatCase =
    code === 'bloque' || code === 'test_bloque'
      ? 'bloque'
      : code === 'pret' || code === 'test_valide'
        ? 'ok'
        : code === 'termine' || code === 'brouillon'
          ? 'neutre'
          : 'attention';

  return { code, libelle: LIBELLE_GLOBAL[code], etat };
}

/** Le geste suivant : la première pièce qui manque décide où on m'envoie. */
function prochaineAction(l: Omit<LigneBac, 'action'>): { label: string; href: string } {
  if (l.sujet.etat === 'bloque') return { label: 'Déposer le sujet', href: '/admin/bacs-blancs' };
  if (l.prof.etat === 'bloque') return { label: 'Assigner un prof', href: '/admin/bacs-blancs' };
  if (l.paiement.etat === 'bloque') return { label: 'Voir les paiements', href: '/admin/paiements' };
  if (l.emails.etat === 'bloque') return { label: 'Ouvrir les e-mails', href: '/admin/emails' };
  if (l.correction.etat === 'bloque') return { label: 'Ouvrir la correction', href: '/admin/correction' };
  if (l.discord.etat === 'attention') return { label: 'Préparer les salles', href: '/admin/discord' };
  if (l.sujet.etat === 'attention' || l.prof.etat === 'attention') {
    return { label: 'Préparer', href: '/admin/bacs-blancs' };
  }
  if (l.correction.etat === 'attention') return { label: 'Ouvrir la correction', href: '/admin/correction' };
  if (l.emails.etat === 'attention') return { label: 'Ouvrir les e-mails', href: '/admin/emails' };
  if (l.paiement.etat === 'attention') return { label: 'Relancer', href: '/admin/paiements' };
  return { label: 'Ouvrir', href: '/admin/bacs-blancs' };
}

// --- Blocs ------------------------------------------------------------

/** Tout ce dont la grille a besoin, rassemblé une fois pour toutes. */
type ContexteGrille = {
  discord: ResumeDiscord;
  sessionsDiscord: Map<string, SessionDiscord>;
  emails: Bloc<ResumeEmails>;
  parcours: LigneParcours[];
  paiements: Bloc<ResumePaiements>;
  impayes: LignePaiement[];
  todo: Map<string, TodoMatiere>;
  correctionDispo: boolean;
};

async function resumeBacs(ctx: ContexteGrille): Promise<Bloc<ResumeBacs>> {
  const etat = await chargerEtatBacsBlancs();

  const carte = (b: BacBlanc): LigneBac => {
    const test = estSessionDeTest(b.date_epreuve);
    const cle = slugMatiere(b.matiere);

    // Les inscriptions se rattachent par session_id ; les plus anciennes ne
    // l'ont pas, d'où le repli sur « même matière, même date ».
    const memeSession = (s: { session_id?: string | null; matiere: string | null; date_epreuve: string | null }) =>
      s.session_id ? s.session_id === b.id : slugMatiere(s.matiere ?? '') === cle && s.date_epreuve === b.date_epreuve;

    const sujet = caseSujet(b);
    const prof = caseProf(b);
    const discord = caseDiscord(b, ctx.discord, ctx.sessionsDiscord.get(b.id));
    const emails = caseEmails(b, ctx.emails, ctx.parcours.filter(memeSession));
    const paiement = casePaiement(b, ctx.paiements, ctx.impayes.filter(memeSession));
    const correction = caseCorrection(b, ctx.todo.get(cle), ctx.correctionDispo);

    const sans = {
      id: b.id,
      matiere: b.matiere,
      date_epreuve: b.date_epreuve,
      heure_debut: b.heure_debut,
      jours: b.jours,
      passe: b.passe,
      test,
      nb_eleves: b.nb_eleves,
      nb_profs: b.profs.filter((p) => p.statut !== 'annule').length,
      sujet,
      prof,
      discord,
      emails,
      paiement,
      correction,
      global: statutGlobal(b, test, [sujet, prof, discord, emails, paiement, correction]),
    };
    return { ...sans, action: prochaineAction(sans) };
  };

  const lignes = etat.bacs_blancs.map(carte);
  // Les essais restent visibles même passés : c'est la trace de ce qui a été
  // vérifié. Les vraies sessions passées, elles, encombrent — on garde les
  // deux dernières, le reste vit dans l'onglet Bacs blancs.
  const tests = lignes.filter((l) => l.test);
  const vrais = lignes.filter((l) => !l.test && (!l.passe || l.jours > -30));

  const futursVrais = vrais.filter((l) => !l.passe);
  const futursTests = tests.filter((l) => !l.passe);
  const passes = etat.bacs_blancs.filter((b) => b.passe);
  // Les brouillons lointains sortent des compteurs d'alerte : ils n'ont ni
  // élève ni date de travail, et les faire compter ferait mentir la carte
  // « bacs sans prof » par rapport à la liste des choses à faire.
  const enChantier = futursVrais.filter((l) => l.global.code !== 'brouillon');

  return {
    disponible: true,
    a_venir: futursVrais.length,
    tests_a_venir: futursTests.length,
    vrais,
    tests,
    sans_sujet: enChantier.filter((l) => l.sujet.etat === 'bloque').length,
    sans_prof: enChantier.filter((l) => l.prof.etat === 'bloque').length,
    retours_manquants: passes.reduce((n, b) => n + b.retours_attendus, 0),
    tables_manquantes: etat.tables_manquantes,
    premiere_vraie_session: LIBELLE_PREMIERE_SESSION,
  };
}

/** Le résumé d'une matière côté correction, en une phrase de tableau de bord. */
function resumerMatiere(m: TodoMatiere): CorrectionMatiere {
  const morceaux: string[] = [];
  if (m.bloquants > 0) morceaux.push(pluriel(m.bloquants, 'point bloquant', 'points bloquants'));
  if (m.corrections_reussies === 0) morceaux.push('copie test manquante');
  if (m.etalons > 0 && m.etalons_valides === 0) morceaux.push('étalons humains manquants');
  if (!m.ouverte) morceaux.push('matière fermée au dépôt');
  const restantes = m.taches.length - m.bloquants;
  if (!morceaux.length && restantes > 0) morceaux.push(pluriel(restantes, 'point à régler', 'points à régler'));

  return {
    matiere: m.matiere,
    label: m.label,
    examen: m.examen,
    resume: morceaux.length ? morceaux.join(', ') : 'prête',
    etat: m.bloquants > 0 ? 'bloque' : morceaux.length ? 'attention' : 'ok',
    bloquants: m.bloquants,
    testee: m.corrections_reussies > 0,
  };
}

async function resumeCorrection(matieres: CorrectionMatiere[]): Promise<Bloc<ResumeCorrection>> {
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
    matieres,
    jamais_testees: matieres.filter((m) => !m.testee).length,
    sans_validation_humaine: matieres.filter((m) => m.resume.includes('étalons humains')).length,
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
    attendu: etat.attendu,
    classeur: etat.classeur_url !== null,
    instructions_pretes: etat.instructions_pretes,
  };
}

async function resumeEmails(parcours: LigneParcours[]): Promise<Bloc<ResumeEmails>> {
  const manquants = emailsManquant();
  const db = crmAdmin();
  const reglages = await chargerReglages();

  const { data, error } = await db
    .from('emails')
    .select(
      'id, type, statut, planifie_le, envoye_le, destinataire_email, destinataire_nom, destinataire_role, test',
    )
    .limit(5000);
  if (error) {
    return indispo('La file d’e-mails n’est pas encore installée dans Supabase.', manquants);
  }

  type LigneEmail = {
    id: string;
    type: string;
    statut: string;
    planifie_le: string | null;
    envoye_le: string | null;
    destinataire_email: string;
    destinataire_nom: string | null;
    destinataire_role: string;
    test: boolean | null;
  };
  const lignes = (data ?? []) as LigneEmail[];
  const maintenant = Date.now();
  const seuil7j = maintenant - 7 * 86_400_000;

  /** Une ligne de la file racontée en français, pour le journal du tableau de bord. */
  const raconter = (l: LigneEmail, quand: string): EnvoiRecent => ({
    id: l.id,
    libelle: estTypeEmail(l.type) ? LIBELLE_TYPE[l.type] : l.type,
    destinataire: (l.destinataire_nom ?? '').trim() || l.destinataire_email,
    email: l.destinataire_email,
    role: l.destinataire_role,
    quand,
    delivre: l.statut === 'delivered',
    test: l.test === true,
  });

  let en_attente = 0;
  let programmes = 0;
  let envoyes_7j = 0;
  let en_erreur = 0;
  let bloques = 0;
  const partis: EnvoiRecent[] = [];
  const aVenir: EnvoiRecent[] = [];

  for (const l of lignes) {
    // « En attente » = son heure est passée, il devrait déjà être parti.
    const du = l.planifie_le ? new Date(l.planifie_le).getTime() : 0;
    if (l.statut === 'pending' || l.statut === 'scheduled' || l.statut === 'processing') {
      if (du <= maintenant) en_attente += 1;
      else programmes += 1;
      if (l.planifie_le) aVenir.push(raconter(l, l.planifie_le));
    }
    if (l.statut === 'sent' || l.statut === 'delivered') {
      if (l.envoye_le && new Date(l.envoye_le).getTime() >= seuil7j) envoyes_7j += 1;
      if (l.envoye_le) partis.push(raconter(l, l.envoye_le));
    }
    if (l.statut === 'failed') en_erreur += 1;
    if (l.statut === 'bloque') bloques += 1;
  }

  // Les plus récents d'abord pour ce qui est parti, les plus proches d'abord
  // pour ce qui va partir : dans les deux cas, le haut de liste est ce qui
  // compte maintenant.
  partis.sort((a, b) => b.quand.localeCompare(a.quand));
  aVenir.sort((a, b) => a.quand.localeCompare(b.quand));

  // Les réglages vides ne font pas planter un envoi : ils le rendent inutile.
  // Un e-mail de relance sans IBAN part, arrive, et ne dit pas où payer.
  const reglages_bloquants: string[] = [];
  if (!(reglages.paiement_instructions ?? '').trim()) {
    reglages_bloquants.push('instructions de paiement');
  }

  return {
    disponible: true,
    en_attente,
    programmes,
    envoyes_7j,
    en_erreur,
    bloques,
    actif: manquants.length === 0,
    validation_manuelle: validationManuelle(reglages),
    inscriptions_sans_date: parcours.filter((p) => !p.date_epreuve).length,
    adresses_test: parcours.filter((p) => p.adresseDeTest).length,
    reglages_bloquants,
    derniers_envois: partis.slice(0, 8),
    prochains_envois: aVenir.slice(0, 5),
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

/**
 * Les tâches, dans le format court : domaine, sujet, impact, bouton.
 *
 * Deux règles tiennent tout ce bloc :
 *   • une tâche qui ne concerne QUE des sessions d'essai n'est jamais rouge ;
 *   • le titre dit CE QUI MANQUE, l'impact dit CE QUE ÇA CASSE — jamais
 *     comment l'application fonctionne. Ça, c'est le travail des onglets.
 */
function construireTaches(r: Omit<ResumeDirection, 'taches' | 'genere_le'>): Tache[] {
  const taches: Tache[] = [];

  if (r.bacs.disponible) {
    // Un brouillon lointain n'est pas une tâche : il n'a ni élève, ni sujet, ni
    // prof, et personne n'a encore commencé à le monter. Il reste visible dans
    // la grille, il ne réclame rien ici.
    const futursVrais = r.bacs.vrais.filter((l) => !l.passe && l.global.code !== 'brouillon');
    const futursTests = r.bacs.tests.filter((l) => !l.passe);

    // --- Sujets : les vrais d'abord, les essais ensuite et jamais en rouge.
    const sujetsVrais = futursVrais.filter((l) => l.sujet.etat === 'bloque');
    if (sujetsVrais.length) {
      const urgent = sujetsVrais.some((l) => l.jours <= 7);
      taches.push({
        cle: 'sujets-vrais',
        urgence: urgent ? 'rouge' : 'orange',
        domaine: 'Bacs blancs',
        titre: sujetsVrais.length === 1 ? 'Sujet manquant' : `${sujetsVrais.length} sujets manquants`,
        impact: 'le bac ne peut pas être ouvert aux élèves',
        detail: sujetsVrais
          .slice(0, 4)
          .map((l) => `${l.matiere} (J-${Math.max(0, l.jours)})`)
          .join(' · '),
        contexte: 'reel',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Déposer les sujets',
      });
    }
    const sujetsTests = futursTests.filter((l) => l.sujet.etat === 'bloque');
    if (sujetsTests.length) {
      taches.push({
        cle: 'sujets-tests',
        urgence: 'info',
        domaine: 'Bacs blancs',
        titre: `${sujetsTests.length} sujets manquants sur les essais`,
        impact: 'la chaîne « sujet → élève » reste non vérifiée',
        detail: sujetsTests.slice(0, 4).map((l) => l.matiere).join(' · '),
        contexte: 'test',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Déposer un sujet d’essai',
      });
    }

    // --- Profs assignés
    const sansProfVrais = futursVrais.filter((l) => l.prof.etat === 'bloque');
    if (sansProfVrais.length) {
      taches.push({
        cle: 'profs-manquants',
        urgence: sansProfVrais.some((l) => l.jours <= 14) ? 'rouge' : 'orange',
        domaine: 'Bacs blancs',
        titre: `${sansProfVrais.length} bacs sans professeur`,
        impact: 'personne n’encadre l’épreuve le jour J',
        detail: sansProfVrais.slice(0, 4).map((l) => l.matiere).join(' · '),
        contexte: 'reel',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Assigner un prof',
      });
    }
    const sansProfTests = futursTests.filter((l) => l.prof.etat === 'bloque');
    if (sansProfTests.length) {
      taches.push({
        cle: 'profs-manquants-tests',
        urgence: 'info',
        domaine: 'Bacs blancs',
        titre: `${sansProfTests.length} essais sans professeur`,
        impact: 'l’espace prof et ses e-mails ne sont pas vérifiés',
        contexte: 'test',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Assigner un prof',
      });
    }

    if (r.bacs.retours_manquants > 0) {
      taches.push({
        cle: 'retours',
        urgence: 'info',
        domaine: 'Bacs blancs',
        titre: `${pluriel(r.bacs.retours_manquants, 'retour')} de prof en attente`,
        impact: 'attente d’un prof — rien à faire de mon côté',
        contexte: 'general',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Voir les retours',
      });
    }

    if (r.bacs.tables_manquantes.length) {
      taches.push({
        cle: 'sql-bacs',
        urgence: 'rouge',
        domaine: 'Réglages',
        titre: 'Du SQL n’a pas été joué dans Supabase',
        impact: 'des pages entières restent vides',
        detail: `Tables absentes : ${r.bacs.tables_manquantes.join(', ')}.`,
        contexte: 'general',
        lien: '/admin/bacs-blancs',
        libelleLien: 'Voir la marche à suivre',
      });
    }
  }

  // --- Paiements
  if (r.paiements.disponible) {
    if (!r.paiements.instructions_pretes && r.paiements.en_attente > 0) {
      taches.push({
        cle: 'instructions-virement',
        urgence: 'rouge',
        domaine: 'Paiement',
        titre: 'Instructions de paiement manquantes',
        impact: 'les relances partent sans dire où payer',
        contexte: 'general',
        lien: '/admin/emails',
        libelleLien: 'Compléter les réglages e-mail',
      });
    }
    if (r.paiements.en_retard > 0) {
      taches.push({
        cle: 'paiements-retard',
        urgence: 'orange',
        domaine: 'Paiement',
        titre: `${r.paiements.en_retard} impayés de plus d’une semaine`,
        impact: 'la relance automatique ne suffit plus, il faut appeler',
        contexte: 'general',
        lien: '/admin/paiements',
        libelleLien: 'Voir les paiements',
      });
    }
    if (!r.paiements.classeur) {
      taches.push({
        cle: 'classeur-financier',
        urgence: 'info',
        domaine: 'Paiement',
        titre: 'Classeur de suivi financier non relié',
        impact: 'pas d’accès direct à la compta depuis l’app',
        detail: 'Variable à poser : SUIVI_FINANCIER_URL.',
        contexte: 'general',
        lien: '/admin/paiements',
        libelleLien: 'Voir comment faire',
      });
    }
  }

  // --- E-mails
  if (r.emails.disponible) {
    if (!r.emails.actif && r.emails.en_attente + r.emails.programmes > 0) {
      taches.push({
        cle: 'emails-inertes',
        urgence: 'rouge',
        domaine: 'E-mails',
        titre: 'Envoi à l’arrêt',
        impact: 'aucun message ne part, la file s’empile',
        detail: 'La clé Brevo manque sur ce déploiement.',
        contexte: 'general',
        lien: '/admin/emails',
        libelleLien: 'Voir la file',
      });
    }
    if (r.emails.validation_manuelle && r.emails.en_attente > 0) {
      taches.push({
        cle: 'emails-validation',
        urgence: 'orange',
        domaine: 'E-mails',
        titre:
          r.emails.en_attente === 1
            ? '1 message attend validation'
            : `${r.emails.en_attente} messages attendent validation`,
        impact: 'rien ne part tant que je n’ai pas cliqué',
        contexte: 'general',
        lien: '/admin/emails',
        libelleLien: 'Valider et envoyer',
      });
    }
    if (r.emails.en_erreur > 0) {
      taches.push({
        cle: 'emails-erreur',
        urgence: 'orange',
        domaine: 'E-mails',
        titre: `${pluriel(r.emails.en_erreur, 'e-mail')} en échec`,
        impact: 'ces destinataires n’ont rien reçu',
        contexte: 'general',
        lien: '/admin/emails',
        libelleLien: 'Ouvrir les e-mails',
      });
    }
    if (r.emails.inscriptions_sans_date > 0) {
      taches.push({
        cle: 'inscriptions-sans-date',
        urgence: 'orange',
        domaine: 'E-mails',
        titre: `${r.emails.inscriptions_sans_date} inscriptions sans date`,
        impact: 'les quatre e-mails datés ne partiront jamais',
        contexte: 'general',
        lien: '/admin/emails',
        libelleLien: 'Rattacher à une session',
      });
    }
    if (r.emails.adresses_test > 0) {
      taches.push({
        cle: 'adresses-test',
        urgence: 'info',
        domaine: 'E-mails',
        titre: `${r.emails.adresses_test} adresses fictives`,
        impact: 'à purger avant la mise en service, sinon Brevo rebondit',
        contexte: 'test',
        lien: '/admin/emails',
        libelleLien: 'Voir les inscriptions',
      });
    }
  }

  // --- Discord
  if (!r.discord.configure) {
    taches.push({
      cle: 'discord',
      urgence: 'info',
      domaine: 'Discord',
      titre: 'Serveur Discord non relié',
      impact: 'aucune salle vocale ne peut être créée',
      detail: `Variables manquantes : ${r.discord.manquants.join(', ')}.`,
      contexte: 'general',
      lien: '/admin/discord',
      libelleLien: 'Configurer Discord',
    });
  } else {
    if (r.discord.erreur) {
      taches.push({
        cle: 'discord-erreur',
        urgence: 'orange',
        domaine: 'Discord',
        titre: 'Discord ne répond pas',
        impact: 'impossible de savoir si les salles existent',
        detail: r.discord.erreur,
        contexte: 'general',
        lien: '/admin/discord',
        libelleLien: 'Vérifier',
      });
    }
    if (r.discord.salles_a_creer > 0) {
      taches.push({
        cle: 'discord-salles',
        urgence: 'orange',
        domaine: 'Discord',
        titre: `${r.discord.salles_a_creer} sessions sans salles`,
        impact: 'les élèves n’auront pas de salle le jour de l’épreuve',
        contexte: 'general',
        lien: '/admin/discord',
        libelleLien: 'Préparer les salles',
      });
    }
    if (r.discord.liens_manquants > 0) {
      taches.push({
        cle: 'discord-liens',
        urgence: 'orange',
        domaine: 'Discord',
        titre: `${r.discord.liens_manquants} sessions sans liens déposés`,
        impact: 'la salle existe mais l’élève ne la voit pas',
        contexte: 'general',
        lien: '/admin/discord',
        libelleLien: 'Déposer les liens',
      });
    }
    if (r.discord.comptes_non_relies > 0) {
      taches.push({
        cle: 'discord-comptes',
        urgence: 'info',
        domaine: 'Discord',
        titre: `${r.discord.comptes_non_relies} comptes élève non reliés`,
        impact: 'attente élève — sa salle lui restera fermée',
        contexte: 'general',
        lien: '/admin/discord',
        libelleLien: 'Voir les élèves',
      });
    }
    if (r.discord.categories_orphelines > 0) {
      taches.push({
        cle: 'discord-orphelines',
        urgence: 'info',
        domaine: 'Discord',
        titre: `${r.discord.categories_orphelines} catégories à nettoyer`,
        impact: 'le serveur s’encombre de sessions terminées',
        contexte: 'general',
        lien: '/admin/discord',
        libelleLien: 'Faire le ménage',
      });
    }
  }

  // --- Profs
  if (r.profs.disponible) {
    if (r.profs.en_attente_validation > 0) {
      taches.push({
        cle: 'candidatures',
        urgence: 'orange',
        domaine: 'Profs',
        titre: `${r.profs.en_attente_validation} profs à valider`,
        impact: 'ils ne voient aucun bac blanc tant que c’est en attente',
        contexte: 'general',
        lien: '/admin/profs',
        libelleLien: 'Ouvrir les accès',
      });
    }
    if (r.profs.sans_matiere > 0) {
      taches.push({
        cle: 'profs-sans-matiere',
        urgence: 'info',
        domaine: 'Profs',
        titre: `${pluriel(r.profs.sans_matiere, 'prof')} sans matière`,
        impact: 'son espace reste vide, il ne peut se positionner sur rien',
        contexte: 'general',
        lien: '/admin/profs',
        libelleLien: 'Renseigner la matière',
      });
    }
    if (r.profs.sans_compte > 0) {
      taches.push({
        cle: 'profs-sans-compte',
        urgence: 'info',
        domaine: 'Profs',
        titre: `${pluriel(r.profs.sans_compte, 'prof')} sans identifiant`,
        impact: 'il ne peut pas se connecter',
        contexte: 'general',
        lien: '/admin/profs',
        libelleLien: 'Créer l’accès',
      });
    }
  }

  // --- Correction
  if (r.correction.disponible) {
    if (r.correction.en_erreur > 0) {
      taches.push({
        cle: 'corrections-erreur',
        urgence: 'rouge',
        domaine: 'Correction',
        titre: `${pluriel(r.correction.en_erreur, 'copie bloquée', 'copies bloquées')}`,
        impact: 'l’élève n’aura pas son dossier',
        contexte: 'general',
        lien: '/admin/correction',
        libelleLien: 'Ouvrir le pilotage',
      });
    }
    const bloquantes = r.correction.matieres.filter((m) => m.etat === 'bloque');
    if (bloquantes.length) {
      taches.push({
        cle: 'correction-bloquants',
        urgence: 'orange',
        domaine: 'Correction',
        titre: `${bloquantes.length} matières bloquées`,
        impact: 'aucune copie ne peut être corrigée dans ces matières',
        detail: bloquantes.map((m) => `${m.label} : ${m.resume}`).join(' · '),
        contexte: 'general',
        lien: '/admin/a-faire',
        libelleLien: 'Voir le détail',
      });
    }
    if (r.correction.jamais_testees > 0) {
      taches.push({
        cle: 'correction-non-testees',
        urgence: 'orange',
        domaine: 'Correction',
        titre: `${r.correction.jamais_testees} matières jamais testées`,
        impact: 'aucune copie n’y est allée jusqu’au dossier de l’élève',
        detail: r.correction.matieres
          .filter((m) => !m.testee)
          .slice(0, 6)
          .map((m) => m.label)
          .join(' · '),
        contexte: 'test',
        lien: '/admin/correction',
        libelleLien: 'Lancer une copie test',
      });
    }
    if (r.correction.sans_validation_humaine > 0) {
      taches.push({
        cle: 'correction-etalons',
        urgence: 'info',
        domaine: 'Correction',
        titre: `${r.correction.sans_validation_humaine} matières sans relecture prof`,
        impact: 'personne n’a vérifié ce que la machine note',
        contexte: 'general',
        lien: '/admin/correction',
        libelleLien: 'Ouvrir la correction',
      });
    }
  }

  const rang = { rouge: 0, orange: 1, info: 2 };
  return taches.sort((a, b) => {
    if (rang[a.urgence] !== rang[b.urgence]) return rang[a.urgence] - rang[b.urgence];
    // À couleur égale, le vrai passe devant l'essai : c'est lui qui a une date.
    const poids = (t: Tache) => (t.contexte === 'reel' ? 0 : t.contexte === 'general' ? 1 : 2);
    return poids(a) - poids(b);
  });
}

// --- Entrée -----------------------------------------------------------

/**
 * Le résumé complet. Chaque bloc est protégé : une panne d'un côté n'empêche
 * jamais d'afficher l'autre.
 *
 * L'ordre compte : on charge d'abord les sources transverses (Discord,
 * e-mails, paiements, correction), puis la grille des bacs blancs, qui les
 * relit session par session. C'est ce qui permet à une ligne du tableau de dire
 * « Discord : 3 liens à déposer » sans ouvrir l'onglet Discord.
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

  /** Une source annexe qui tombe ne doit rien casser : on renvoie le repli. */
  const doux = async <T,>(charger: () => Promise<T>, repli: T, quoi: string): Promise<T> => {
    try {
      return await charger();
    } catch (err) {
      console.error(`❌ Résumé direction — ${quoi}`, err);
      return repli;
    }
  };

  const manquantsDiscord = discordManquant();

  const [salons, parcours, todo, paiementsBruts] = await Promise.all([
    manquantsDiscord.length
      ? Promise.resolve(null)
      : doux(() => chargerEtatSalons(), null, 'salles Discord'),
    doux(async () => chargerParcoursEleves(await chargerReglages()), [] as LigneParcours[], 'parcours élèves'),
    pipelineManquant().length ? Promise.resolve(null) : doux(() => chargerTodo(), null, 'todo correction'),
    doux(() => chargerPaiements(), null, 'paiements (détail)'),
  ]);

  const sessionsFutures = (salons?.sessions ?? []).filter((s) => !s.passe);
  const discord: ResumeDiscord = {
    configure: manquantsDiscord.length === 0,
    manquants: manquantsDiscord,
    serveur: salons?.serveur ?? null,
    erreur: salons?.erreur ?? null,
    salles_a_creer: sessionsFutures.filter((s) => !s.categorie_id).length,
    liens_manquants: sessionsFutures.filter((s) => s.liens_deposes < s.nb_eleves).length,
    comptes_non_relies: sessionsFutures.reduce(
      (n, s) => n + Math.max(0, s.nb_eleves - s.comptes_relies),
      0,
    ),
    categories_orphelines: salons?.categories_orphelines.length ?? 0,
  };

  const matieresCorrection = (todo?.matieres ?? []).map(resumerMatiere);
  const todoParMatiere = new Map((todo?.matieres ?? []).map((m) => [m.matiere, m]));
  const sessionsDiscord = new Map((salons?.sessions ?? []).map((s) => [s.session_id, s]));

  const [correction, paiements, emails, profs] = await Promise.all([
    sur(() => resumeCorrection(matieresCorrection), 'correction'),
    sur(resumePaiements, 'paiements'),
    sur(() => resumeEmails(parcours), 'e-mails'),
    sur(resumeProfs, 'professeurs'),
  ]);

  const bacs = await sur(
    () =>
      resumeBacs({
        discord,
        sessionsDiscord,
        emails,
        parcours,
        paiements,
        impayes: paiementsBruts?.lignes ?? [],
        todo: todoParMatiere,
        correctionDispo: pipelineManquant().length === 0 && todo !== null,
      }),
    'bacs blancs',
  );

  const partiel = { bacs, correction, paiements, emails, profs, discord };

  return {
    genere_le: new Date().toISOString(),
    ...partiel,
    taches: construireTaches(partiel),
  };
}
