/**
 * Libellés des matières et des épreuves.
 *
 * Fichier volontairement SANS aucun import : il est chargé aussi bien par des
 * composants client que par le serveur. `pipelineEtat.ts` le ré-exporte, mais
 * lui touche la base avec la clé service_role — un composant client ne doit
 * jamais l'importer, même pour un simple libellé.
 */

export const LABELS_MATIERES: Record<string, string> = {
  francais: 'Français',
  philosophie: 'Philosophie',
  maths: 'Mathématiques',
  'physique-chimie': 'Physique-Chimie',
  'histoire-geo': 'Histoire-Géo',
  ses: 'SES',
  svt: 'SVT',
  hggsp: 'HGGSP',
  hlp: 'HLP',
  // Le brevet : même pipeline, autre examen. Sans ces deux libellés, les pages
  // d'administration affichent le nom technique de la matière.
  brevet_francais: 'Brevet — Français',
  brevet_mathematiques: 'Brevet — Mathématiques',
};

const LABELS_EXERCICES: Record<string, string> = {
  commentaire: 'Commentaire',
  dissertation: 'Dissertation',
  contraction: 'Contraction de texte',
  essai: 'Essai',
  epreuve_composee_partie_1: 'Épreuve composée — EC1',
  epreuve_composee_partie_2: 'Épreuve composée — EC2',
  epreuve_composee_partie_3: 'Épreuve composée — EC3',
  maths_analyse: 'Analyse',
  maths_probabilites: 'Probabilités',
  maths_geometrie_espace: 'Géométrie dans l’espace',
  maths_qcm_justifie: 'QCM justifié',
  philo_dissertation: 'Dissertation',
  philo_explication_texte: 'Explication de texte',
  hg_question_problematisee: 'Question problématisée',
  hg_analyse_document: 'Analyse de document',
  hg_croquis: 'Croquis',
  hg_tech_questions: 'Questions (voie techno)',
  pc_probleme: 'Résolution de problème',
  pc_analyse_documentaire: 'Analyse documentaire',
  pc_protocole: 'Protocole expérimental',
  pc_ece: 'ECE',
  svt_exercice_1: 'Exercice 1',
  svt_exercice_2: 'Exercice 2',
  hggsp_dissertation: 'Dissertation',
  hggsp_etude_critique: 'Étude critique de documents',
  hlp_interpretation: 'Question d’interprétation',
  hlp_essai: 'Essai',
};

export function labelExercice(type: string): string {
  return LABELS_EXERCICES[type] ?? type.replace(/_/g, ' ');
}
