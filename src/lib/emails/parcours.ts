/**
 * Le parcours d'un élève : la liste ordonnée de TOUS les e-mails qu'une
 * inscription est censée déclencher, de la confirmation à la demande d'avis.
 *
 * Ce fichier est la référence unique affichée dans `/admin/emails` (le tableau
 * « ce qui est prévu ») ET la colonne vertébrale de la vue « Par élève ».
 * Les deux ne peuvent donc pas diverger.
 *
 * Fonction PURE : aucun appel réseau, aucune lecture de base. Les délais sont
 * lus dans les réglages, pas écrits en dur — ce qui s'affiche est ce que le
 * planificateur applique réellement.
 *
 * ⚠️ Un parcours = UNE inscription = un élève ET une matière. Un élève inscrit
 * à trois matières parcourt trois fois cette liste.
 */
import type { Reglages } from './reglages-libelles';
import { LIBELLE_TYPE, type TypeEmail } from './config';

/** Les grandes phases, dans l'ordre chronologique. */
export type PhaseParcours = 'inscription' | 'avant' | 'apres' | 'exception';

export const LIBELLE_PHASE: Record<PhaseParcours, string> = {
  inscription: 'À l’inscription',
  avant: 'Avant l’épreuve',
  apres: 'Après l’épreuve',
  exception: 'Si ça arrive',
};

export type EtapeParcours = {
  type: TypeEmail;
  /** Libellé long, celui du catalogue. */
  libelle: string;
  /** Libellé court, pour un en-tête de colonne. */
  court: string;
  phase: PhaseParcours;
  /** Quand il part, en français, délais réels compris. */
  quand: string;
  /** Ce qui le déclenche — utile quand une case reste vide. */
  declencheur: string;
  /** Le parent en reçoit une copie quand son adresse est renseignée. */
  parent: boolean;
};

/**
 * Le parcours complet, délais issus des réglages en vigueur.
 *
 * L'ordre est celui du temps réel : c'est aussi l'ordre des colonnes de la
 * vue « Par élève », pour qu'un trou se lise d'un coup d'œil.
 */
export function parcoursEleve(r: Reglages): EtapeParcours[] {
  const jours = (n: number) => (n === 1 ? '1 jour' : `${n} jours`);

  return [
    {
      type: 'inscription_confirmee',
      libelle: LIBELLE_TYPE.inscription_confirmee,
      court: 'Inscription',
      phase: 'inscription',
      quand: 'tout de suite',
      declencheur: 'l’inscription est enregistrée',
      parent: true,
    },
    {
      type: 'paiement_attente',
      libelle: LIBELLE_TYPE.paiement_attente,
      court: 'Relance paiement',
      phase: 'inscription',
      quand: `+ ${r.relance_paiement_heures_apres} h, ${r.relance_paiement_max} fois au maximum`,
      declencheur: 'le paiement est encore « en attente »',
      parent: true,
    },
    {
      type: 'paiement_confirme',
      libelle: LIBELLE_TYPE.paiement_confirme,
      court: 'Paiement OK',
      phase: 'inscription',
      quand: 'quand tu marques « payé » ou « offert »',
      declencheur: 'tu poses le statut de paiement',
      parent: true,
    },
    {
      type: 'infos_pratiques',
      libelle: LIBELLE_TYPE.infos_pratiques,
      court: 'Infos pratiques',
      phase: 'avant',
      quand: `${jours(r.infos_pratiques_jours_avant)} avant, à 10 h`,
      declencheur: 'la session a une date',
      parent: false,
    },
    {
      type: 'lien_visio',
      libelle: LIBELLE_TYPE.lien_visio,
      court: 'Lien visio',
      phase: 'avant',
      quand: `${jours(r.lien_visio_jours_avant)} avant, à 10 h`,
      declencheur: 'la session a une date',
      parent: false,
    },
    {
      type: 'rappel_veille',
      libelle: LIBELLE_TYPE.rappel_veille,
      court: 'Rappel veille',
      phase: 'avant',
      quand: `la veille à ${r.rappel_veille_heure} h`,
      declencheur: 'la session a une date',
      parent: false,
    },
    {
      type: 'dernier_rappel',
      libelle: LIBELLE_TYPE.dernier_rappel,
      court: 'Dernier rappel',
      phase: 'avant',
      quand: `${r.dernier_rappel_minutes_avant} min avant le début`,
      declencheur: 'la session a une date et une heure',
      parent: false,
    },
    {
      type: 'session_terminee',
      libelle: 'Copie bien reçue',
      court: 'Copie reçue',
      phase: 'apres',
      quand: 'dès que la copie est marquée reçue',
      declencheur: 'la copie est déposée',
      parent: false,
    },
    {
      type: 'correction_disponible',
      libelle: LIBELLE_TYPE.correction_disponible,
      court: 'Correction',
      phase: 'apres',
      quand: 'dès que la correction est publiée',
      declencheur: 'tu publies la correction',
      parent: true,
    },
    {
      type: 'demande_avis',
      libelle: LIBELLE_TYPE.demande_avis,
      court: 'Avis',
      phase: 'apres',
      quand: `${jours(r.demande_avis_jours_apres)} après la correction`,
      declencheur: 'la correction est publiée, l’élève était présent',
      parent: false,
    },
    {
      type: 'session_modifiee',
      libelle: LIBELLE_TYPE.session_modifiee,
      court: 'Session modifiée',
      phase: 'exception',
      quand: 'dès la modification',
      declencheur: 'la date ou l’horaire change',
      parent: true,
    },
    {
      type: 'session_annulee',
      libelle: LIBELLE_TYPE.session_annulee,
      court: 'Session annulée',
      phase: 'exception',
      quand: 'dès l’annulation',
      declencheur: 'la session est annulée',
      parent: true,
    },
  ];
}

/** Les étapes du parcours dont le parent reçoit une copie. */
export function etapesParent(r: Reglages): EtapeParcours[] {
  return parcoursEleve(r).filter((e) => e.parent);
}

/**
 * Combien d'envois une inscription produit dans le cours normal des choses —
 * c'est-à-dire sans modification ni annulation de session.
 *
 * Deux bornes : le minimum (paiement réglé tout de suite, donc aucune relance)
 * et le maximum (toutes les relances de paiement parties).
 */
export function volumeNominal(r: Reglages): {
  eleveMin: number;
  eleveMax: number;
  parentMin: number;
  parentMax: number;
  totalMin: number;
  totalMax: number;
} {
  const relances = Math.max(0, Math.min(5, r.relance_paiement_max));
  const nominales = parcoursEleve(r).filter((e) => e.phase !== 'exception');

  // Hors relance de paiement, chaque étape nominale part une seule fois.
  const eleveFixe = nominales.filter((e) => e.type !== 'paiement_attente').length;
  const parentFixe = nominales.filter((e) => e.parent && e.type !== 'paiement_attente').length;

  return {
    eleveMin: eleveFixe,
    eleveMax: eleveFixe + relances,
    parentMin: parentFixe,
    parentMax: parentFixe + relances,
    totalMin: eleveFixe + parentFixe,
    totalMax: eleveFixe + parentFixe + 2 * relances,
  };
}

// --- État d'une case du tableau « Par élève » -------------------------

/**
 * Ce qu'une case peut valoir. L'ordre compte : c'est celui de la gravité,
 * du plus rassurant au plus inquiétant.
 */
export type EtatCase =
  | 'envoye' // parti (ou délivré)
  | 'programme' // en file, partira à la date indiquée
  | 'attendu' // pas encore en file, mais le moteur le créera
  | 'sans_objet' // ne s'applique pas à cette inscription
  | 'annule' // annulé, volontairement ou par une vérification
  | 'bloque' // il manque une donnée
  | 'echec'; // Brevo a refusé

export const LIBELLE_ETAT: Record<EtatCase, string> = {
  envoye: 'envoyé',
  programme: 'programmé',
  attendu: 'à venir',
  sans_objet: 'sans objet',
  annule: 'annulé',
  bloque: 'bloqué',
  echec: 'en échec',
};

export const SYMBOLE_ETAT: Record<EtatCase, string> = {
  envoye: '✅',
  programme: '⏳',
  attendu: '⚪',
  sans_objet: '—',
  annule: '⊘',
  bloque: '🚫',
  echec: '❌',
};

/** Les états qui doivent attirer l'œil : quelque chose ne partira pas. */
export const ETATS_PROBLEME: EtatCase[] = ['bloque', 'echec'];

/** Un statut de la table `emails` traduit en état de case. */
export function etatDepuisStatut(statut: string): EtatCase {
  switch (statut) {
    case 'sent':
    case 'delivered':
      return 'envoye';
    case 'pending':
    case 'scheduled':
    case 'processing':
      return 'programme';
    case 'failed':
      return 'echec';
    case 'bloque':
      return 'bloque';
    case 'cancelled':
      return 'annule';
    default:
      return 'attendu';
  }
}
