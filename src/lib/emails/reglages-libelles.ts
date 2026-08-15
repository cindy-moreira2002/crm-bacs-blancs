/**
 * Le type des réglages et leurs libellés — sans aucun accès base.
 *
 * Séparé de reglages.ts pour que l'interface d'administration (composant
 * client) puisse afficher les libellés sans embarquer le client Supabase.
 */

export type Reglages = {
  infos_pratiques_jours_avant: number;
  lien_visio_jours_avant: number;
  rappel_veille_heure: number;
  dernier_rappel_minutes_avant: number;
  relance_paiement_heures_apres: number;
  relance_paiement_max: number;
  demande_avis_jours_apres: number;
  prof_infos_jours_avant: number;
  prof_rappel_heures_avant: number;
  prof_echeance_correction_jours: number;
  relance_interet_jours_apres: number;
  quota_quotidien: number;
  quota_marge: number;
  lien_avis_url: string;
  paiement_instructions: string;
  paiement_montant_defaut: string;
  envoi_actif: string;
  /**
   * « oui » = rien ne part sans un clic de l'administratrice. Le planificateur
   * continue de tout préparer, le moteur automatique n'envoie plus rien, et
   * chaque message attend le bouton « Valider et envoyer ».
   */
  validation_manuelle: string;
  actif_depuis: string;
};

export const LIBELLE_REGLAGE: Record<keyof Reglages, string> = {
  infos_pratiques_jours_avant: 'Informations pratiques — combien de jours avant',
  lien_visio_jours_avant: 'Lien de visioconférence — combien de jours avant',
  rappel_veille_heure: 'Rappel la veille — à quelle heure (0 à 23)',
  dernier_rappel_minutes_avant: 'Dernier rappel — combien de minutes avant',
  relance_paiement_heures_apres: 'Relance paiement — combien d’heures après l’inscription',
  relance_paiement_max: 'Relance paiement — nombre maximum de relances',
  demande_avis_jours_apres: 'Demande d’avis — combien de jours après la correction',
  prof_infos_jours_avant: 'Prof, informations pratiques — combien de jours avant',
  prof_rappel_heures_avant: 'Prof, rappel — combien d’heures avant',
  prof_echeance_correction_jours: 'Prof, échéance de correction — combien de jours après',
  relance_interet_jours_apres: 'Relance des intéressés — combien de jours après',
  quota_quotidien: 'Limite d’envois par jour (offre Brevo)',
  quota_marge: 'Marge de sécurité réservée aux e-mails indispensables',
  lien_avis_url: 'Adresse du questionnaire d’avis',
  paiement_instructions: 'Instructions de virement (IBAN, référence…)',
  paiement_montant_defaut: 'Montant par défaut d’un bac blanc (€)',
  envoi_actif: 'Envoi réel actif ? (oui / non)',
  validation_manuelle: 'Je valide chaque e-mail avant qu’il parte ? (oui / non)',
  actif_depuis: 'Système actif depuis (rien d’antérieur n’est envoyé)',
};
