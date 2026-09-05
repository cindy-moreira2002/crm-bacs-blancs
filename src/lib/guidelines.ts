/**
 * OÙ SE TROUVE LA GRILLE DE CORRECTION D'UNE MATIÈRE — une seule table.
 *
 * Depuis août 2026, les professeurs corrigent avec les « guidelines » : un
 * classeur Google Sheets par matière, qui contient le barème détaillé (parties,
 * blocs, critères, paliers) et une page de correction à cocher, un bloc par
 * élève. C'est CE fichier que le prof ouvre, et c'est son export CSV qu'il
 * dépose dans l'espace prof (`importGrille.ts` reconnaît les deux formats).
 *
 * Fichier volontairement SANS aucun import : serveur et client le lisent.
 *
 * Ce que ce module NE fait pas : il ne remplace pas
 * `sessions_bacs_blancs.sheet_correction_url`. Si une session porte son propre
 * lien (un classeur dupliqué pour un bac blanc précis), ce lien-là gagne. La
 * table ci-dessous n'est que le défaut de la matière, pour ne pas avoir à
 * recopier une URL sur chaque session.
 */

export type Guideline = {
  /** Le lien du classeur, ou null tant qu'il n'est pas partagé avec le CRM. */
  url: string | null;
  /** Le nom du fichier, tel qu'il apparaît dans le Drive des Matinées. */
  titre: string;
  /** Ce que le prof doit savoir avant de l'ouvrir. */
  note?: string;
};

const SHEET = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

/**
 * Les classeurs par matière, d'après l'index
 * « Guideline de correction : template toutes matières ».
 *
 * Une URL à null n'est pas un oubli de code : ce classeur n'existe pas encore.
 * L'espace prof le dit alors franchement, plutôt que d'ouvrir un lien mort.
 *
 * ⚠️ Ces classeurs appartiennent au Drive de Maël. Ils s'ouvrent pour qui a
 * reçu le partage — un prof qui ne l'a pas voit « Demander l'accès ».
 */
export const GUIDELINES: Record<string, Guideline> = {
  francais: {
    url: SHEET('13xVWAQrvTQb6pLZjwKEsIDojqLR-Y8TdMx8kFFaPKdg'),
    titre: 'Guideline correction épreuve bac français V0',
    note: 'Trois pages : barème général, commentaire de texte, dissertation.',
  },
  philosophie: {
    url: SHEET('1Mc3JaTOJEYiYlGPy8JGCw_q_0Az9BeOozFkvMvCjn30'),
    titre: 'Guideline correction épreuve bac philo V0',
  },
  maths: {
    url: SHEET('1TB7tp1ZQ65swxN53k8lNYYX8QRjcXdRRaXKruNeNxDw'),
    titre: 'Guideline correction épreuve bac spé maths V0',
    note: 'Épreuve à questions numérotées : la guideline dit COMMENT compter, le barème du sujet dit COMBIEN vaut chaque question (/admin/bareme). La version 1ère tronc commun est ici : https://docs.google.com/spreadsheets/d/1k3Bt0d818xUCaBzp9zJwtgN2RMoR--_BW1w7ki8bV0E/edit',
  },
  ses: {
    url: SHEET('1mHcvJNt6ONZw85_AMoKIDeL1Oi3YnNkdfhKYjzGkE4w'),
    titre: 'Guideline correction épreuve bac SES V0',
  },
  hggsp: {
    url: SHEET('1QbmMzkS8TtvxmmFvzmsRiOoYF1SLdM5liJCid9zk1Ec'),
    titre: 'Guideline correction HGGSP V1',
    note:
      'Dissertation /10 + étude critique /10. Même barème que la V0_2, remis dans la mise en page ' +
      'que le CRM lit sans erreur : une lettre chapeaute, un numéro se coche, et chaque critère a ' +
      'un vrai palier 0. La page à cocher est « Correction HGGSP » ; l’onglet « Vérification du ' +
      'barème » doit afficher 20,00 et un écart de 0.',
  },
  'histoire-geo': { url: null, titre: 'Guideline correction histoire-géographie' },
  hlp: { url: null, titre: 'Guideline correction HLP' },
  svt: { url: null, titre: 'Guideline correction SVT' },
  'physique-chimie': { url: null, titre: 'Guideline correction physique-chimie' },
  anglais: { url: null, titre: 'Guideline correction LLCER anglais' },
};

/** L'index qui liste toutes les guidelines, matière par matière. */
export const INDEX_GUIDELINES =
  'https://docs.google.com/spreadsheets/d/1nOn3ORXBFlYI6HqGLzJX5ddtrD1AGUpIK3TBCjGTVuo/edit';

export function guidelinePour(matiere: string): Guideline | null {
  return GUIDELINES[matiere] ?? null;
}

/**
 * Le lien que le prof doit ouvrir pour cette session : le classeur de la
 * session s'il existe, sinon celui de la matière, sinon rien.
 */
export function lienCorrection(
  matiere: string,
  sheetSession: string | null,
): { url: string | null; origine: 'session' | 'matiere' | 'aucun'; guideline: Guideline | null } {
  const guideline = guidelinePour(matiere);
  if (sheetSession) return { url: sheetSession, origine: 'session', guideline };
  if (guideline?.url) return { url: guideline.url, origine: 'matiere', guideline };
  return { url: null, origine: 'aucun', guideline };
}
