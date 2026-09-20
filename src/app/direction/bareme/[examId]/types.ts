/** Formes échangées entre l'écran examen et /api/admin/bareme/[examId]. */

export type Palier = {
  id?: string;
  code?: string | null;
  libelle: string;
  points: number;
  nature: 'resultat' | 'methode' | 'etape' | 'alternative' | 'bonus';
  description?: string | null;
  cumulable: boolean;
};

export type Question = {
  id?: string;
  question_key: string;
  numero: string;
  libelle: string;
  partie: string | null;
  exercice_code?: string | null;
  ordre: number;
  max_points: number;
  reponse_attendue: string | null;
  raisonnement_attendu: string | null;
  etapes: { libelle: string; points?: number }[];
  reponses_equivalentes: string[];
  methodes_alternatives: { libelle: string; commentaire?: string }[];
  erreurs_frequentes: { libelle: string }[];
  unites_attendues: string | null;
  precision_attendue: string | null;
  conditions_hypotheses: string | null;
  calculatrice: 'autorisee' | 'interdite' | 'indifferent';
  tolerances: string | null;
  competences: string[];
  codes_erreurs: string[];
  depend_de: string[];
  regle_non_double_sanction: string | null;
  regle_poursuite: string | null;
  regle_resultat_sans_justification: string | null;
  regle_raisonnement_juste_calcul_faux: string | null;
  criteres_relecture_humaine: string | null;
  paliers: Palier[];
};

export type Exercice = { id?: string; code: string; titre: string | null; ordre: number };

export type VersionBareme = {
  id: string;
  version: string;
  statut: string;
  total_points: number;
  max_score: number;
  verrouille_le: string | null;
  valide_le: string | null;
  controles: Controles | null;
};

export type Controles = {
  ok: boolean;
  total_points: number;
  blocages: { code: string; question_key?: string; message: string }[];
  avertissements: { code: string; question_key?: string; message: string }[];
};

export type Examen = {
  id: string;
  code: string;
  matiere: string;
  track: string;
  exercise_type: string | null;
  titre: string;
  session: string | null;
  date_epreuve: string | null;
  subject_id: string | null;
  sujet_url: string | null;
  sujet_texte: string | null;
  corrige_url: string | null;
  corrige_texte: string | null;
  consignes_correcteur?: string | null;
  statut: string;
  bareme_version_active: string | null;
};

export type Competence = { code: string; libelle: string; description: string | null; toujours_mobilisee: boolean };
export type CodeErreur = { code: string; description: string; gravite: string; nature: string; domaine: string | null };

export type Bareme = {
  examen: Examen;
  version: VersionBareme;
  exercices: Exercice[];
  questions: Question[];
  referentiel: Competence[];
  codesErreurs: CodeErreur[];
};

export type Etalon = {
  id: string;
  libelle: string;
  niveau_cible: string | null;
  frontiere: boolean;
  statut: string;
  storage_path: string | null;
  source_url: string | null;
  correction_id: string | null;
  commentaire: string | null;
  nb_corrections_humaines: number;
  nb_corrections_ia: number;
};

export type VueExamen = {
  examen: Examen;
  versions: VersionBareme[];
  bareme: Bareme | null;
  controles: Controles | null;
  controles_locaux: Controles | null;
  etalons: Etalon[];
  couverture: { couverts: string[]; manquants: { code: string; libelle: string; plage: string }[] };
  corrections: { total: number; en_relecture: number; par_version: Record<string, number> };
  derniere_calibration: { id: string; lance_le: string; stats: unknown } | null;
};

export type Comparaison = {
  etalon_id: string;
  libelle: string;
  note_ia: number | null;
  note_humaine_moyenne: number | null;
  note_humaine_mediane: number | null;
  amplitude_humaine: number | null;
  nb_correcteurs: number;
  ecart_total: number | null;
  ecarts_par_question: { question_key: string; ia: number | null; humain: number | null; ecart: number | null }[];
  questions_en_desaccord_entre_profs: string[];
  reference_fiable: boolean;
};

export type StatsCalibration = {
  copies_testees: number;
  ecart_absolu_moyen: number | null;
  ecart_median: number | null;
  ecart_maximal: number | null;
  biais_moyen: number | null;
  taux_accord_exact: number | null;
  taux_accord_025: number | null;
  taux_relecture: number | null;
  questions_en_desaccord: { question_key: string; ecart_absolu_moyen: number; copies: number }[];
  references_non_fiables: number;
};

export type TableauCalibration = {
  version_id: string;
  version: string;
  comparaisons: Comparaison[];
  stats: StatsCalibration;
  calibration_realisee: boolean;
};

export const QUESTION_VIDE = (ordre: number): Question => ({
  question_key: `q${ordre + 1}`,
  numero: String(ordre + 1),
  libelle: '',
  partie: null,
  exercice_code: null,
  ordre,
  max_points: 1,
  reponse_attendue: '',
  raisonnement_attendu: '',
  etapes: [],
  reponses_equivalentes: [],
  methodes_alternatives: [],
  erreurs_frequentes: [],
  unites_attendues: null,
  precision_attendue: null,
  conditions_hypotheses: null,
  calculatrice: 'indifferent',
  tolerances: null,
  competences: [],
  codes_erreurs: [],
  depend_de: [],
  regle_non_double_sanction: null,
  regle_poursuite: null,
  regle_resultat_sans_justification: null,
  regle_raisonnement_juste_calcul_faux: null,
  criteres_relecture_humaine: null,
  paliers: [],
});
