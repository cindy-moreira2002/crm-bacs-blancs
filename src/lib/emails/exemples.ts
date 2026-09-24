/**
 * Les valeurs d'exemple qui servent à RELIRE un modèle d'e-mail.
 *
 * Fichier PUR : aucune lecture de base, aucun appel réseau. Il est utilisé à
 * deux endroits, et c'est volontaire — les deux doivent montrer exactement le
 * même rendu :
 *
 *  - `npm run apercu:emails`, qui écrit les 33 modèles en HTML ;
 *  - l'onglet « Modèles » de /direction/emails, où tu les relis à l'écran.
 *
 * Aucune valeur réelle ici : ni vrai IBAN, ni vraie adresse d'élève. L'IBAN
 * d'exemple est celui de la documentation de la Banque de France.
 */

export const VARIABLES_EXEMPLE: Record<string, string> = {
  first_name: 'Léa',
  student_name: 'Léa Martin',
  parent_name: 'Mme Martin',
  subject_name: 'Français',
  session_date: 'samedi 6 septembre 2026',
  session_date_court: 'sam. 6 sept.',
  session_date_iso: '2026-09-06',
  start_time: '9 h 00',
  end_time: '13 h 00',
  connection_time: '8 h 45',
  teacher_name: 'Camille Durand',
  student_space_url: 'https://espaces.matineesdubac.fr/espace-eleve',
  // Le code de l'épreuve : présent dans l'aperçu pour qu'on voie l'encadré du
  // rappel de la veille tel que l'élève le recevra.
  exam_code: 'K7M2-P4X9',
  teacher_space_url: 'https://espaces.matineesdubac.fr/espace-prof',
  // Forme réelle d'une adresse de salle Discord : serveur, puis salon.
  video_room_url: 'https://discord.com/channels/000000000000000000/111111111111111111',
  inscription_url: 'https://inscription.matineesdubac.fr/inscription',
  // Les offres : codes promo, trios, packs, avoirs. Valeurs d'exemple, du
  // même format que les vraies — c'est ce qu'on relit pour valider un texte.
  trio_code: 'LEA39',
  trio_deadline: 'mardi 22 septembre à 16:26',
  trio_manquants: '2',
  pack_label: 'Pack fidélité 3',
  pack_total: '3',
  pack_restantes: '2',
  pack_expire: '20 septembre 2027',
  credit_amount: '10',
  credit_total: '25',
  filleul_name: 'Jules',
  code_1: 'LEA1K7B',
  code_2: 'LEA2M4Q',
  code_3: 'LEA3T9R',
  correction_url: 'https://espaces.matineesdubac.fr/espace-eleve',
  survey_url: 'https://exemple.fr/avis',
  support_email: 'matineesdubac@gmail.com',
  site_url: 'https://matineesdubac.fr',
  inscription_ref: 'A1B2C3D4',
  amount: '29',
  payment_reference: 'VIR-2026-014',
  payment_status: 'en_attente',
  payment_status_label: 'en attente',
  payment_instructions: 'Le virement peut être fait depuis n’importe quelle banque.',
  // Un IBAN d'exemple : la documentation de la Banque de France utilise cette
  // forme. Jamais le vrai — il vit dans `email_reglages`, pas dans le dépôt.
  payment_iban: 'FR76 3000 6000 0112 3456 7890 189',
  payment_holder: 'Les Matinées du Bac',
  payment_bic: 'AGRIFRPP',
  payment_deadline_minutes: '10',
  old_value: 'samedi 6 septembre 2026 à 9 h 00',
  new_value: 'samedi 20 septembre 2026 à 9 h 00',
  change_reason: 'Le professeur est empêché ce jour-là.',
  student_count: '8',
  copy_count: '8',
  deadline_date: 'samedi 13 septembre 2026',
  remuneration: '40',
  grade: '14/20',
  places_restantes: '3',
  // La facture vient du classeur financier, jamais du CRM : valeurs
  // d'exemple, pour que le modèle soit relisible comme les autres.
  invoice_number: 'F-2026-0042',
  invoice_url: 'https://drive.google.com/file/d/exemple/view',
};
