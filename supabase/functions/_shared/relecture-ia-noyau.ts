/**
 * NOYAU DE LA DEUXIÈME LECTURE PAR L'IA (matières sans prof relecteur).
 *
 * Décision de Cindy du 2026-09-29 : seuls le français, la philosophie, les
 * maths et l'HGGSP ont un professeur relecteur. En SES, HLP, LLCER anglais,
 * SVT et physique-chimie, PERSONNE ne relira : l'IA doit se relire seule.
 *
 * Fichier volontairement PUR (aucun import, aucun réseau), comme
 * `bareme-noyau.ts` : l'Edge Function `review-copy` (Deno) l'importe en
 * `../_shared/relecture-ia-noyau.ts`, l'application Next.js et les tests hors
 * ligne en `@/lib/relectureIaNoyau`. Une seule écriture des règles.
 *
 * CE QUI SE PASSE POUR UNE COPIE DE CES CINQ MATIÈRES
 * ---------------------------------------------------
 *  1. transcription douteuse → UNE relance automatique de la transcription ;
 *     toujours douteuse → file « à regarder par Cindy » (SQL 58, trigger) ;
 *  2. correction faite → deuxième lecture (`review-copy`) : chaque point est
 *     vérifié contre la copie, puis confirmé ou ajusté, avec un journal ;
 *  3. doute persistant après la deuxième lecture → UNE recorrection complète
 *     (correction + deuxième lecture) ; doute toujours là → file Cindy.
 *  Jamais de boucle : chaque relance a son compteur en base, plafonné à 1.
 */

/* ------------------------------------------------------------------ */
/*  Périmètre et bornes                                               */
/* ------------------------------------------------------------------ */

/**
 * Matières SANS prof relecteur. La base en garde la copie qui fait foi à
 * l'exécution (`ia_reglages.matieres_relecture_ia`, SQL 58) ; cette liste sert
 * à l'affichage et aux tests. Un test vérifie que les deux disent la même chose
 * dans le fichier SQL.
 */
export const MATIERES_RELECTURE_IA = ['ses', 'hlp', 'anglais', 'svt', 'physique-chimie'] as const;

/** Matières AVEC prof relecteur : leur chaîne ne change pas d'un octet. */
export const MATIERES_AVEC_PROF = ['francais', 'philosophie', 'maths', 'hggsp'] as const;

/** Une seule recorrection automatique, jamais plus. */
export const MAX_RECORRECTIONS = 1;
/** Une seule relance automatique de la transcription, jamais plus. */
export const MAX_RELANCES_TRANSCRIPTION = 1;
/**
 * Écart entre les deux lectures, en part du barème, au-delà duquel on ne fait
 * plus confiance à aucune des deux : 25 % (5 points sur 20).
 */
export const SEUIL_ECART_RELECTURE = 0.25;
/**
 * En deçà de cette part du barème (0,5 point sur 20), un point sans citation
 * n'appelle pas un humain : un critère de langue ou d'expression se juge sur
 * toute la copie, pas sur une phrase (vu au premier essai réel, 2026-09-29).
 */
export const SEUIL_CITATION_OBLIGATOIRE = 0.025;
/** Confiance de transcription sous laquelle la lecture reste douteuse. */
export const SEUIL_CONFIANCE_TRANSCRIPTION = 0.85;

export function relectureIaConcernee(matiere: string | null | undefined): boolean {
  return (MATIERES_RELECTURE_IA as readonly string[]).includes(String(matiere ?? '').trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  Motifs persistants                                                */
/* ------------------------------------------------------------------ */

/**
 * D'où vient un doute — c'est ce qui décide si une recorrection peut le lever.
 *  - `correction`    : un jugement de correcteur (une recorrection peut aider) ;
 *  - `transcription` : la copie est mal lue (recorriger la même lecture ne
 *                      change rien) ;
 *  - `systeme`       : le barème ou le sujet lui-même, ou le plafond de dépense.
 */
export type NatureMotif = 'correction' | 'transcription' | 'systeme';

export type MotifPersistant = {
  nature: NatureMotif;
  code: string;
  message: string;
  /** Critère (grille) ou question (barème) concerné, s'il y en a un. */
  cible?: string;
};

/** Un score modifié par la deuxième lecture : c'est le journal des changements. */
export type Changement = {
  cible: string;
  avant: number;
  apres: number;
  motif: string;
  citation?: string;
};

/** Mots qui trahissent un doute de LECTURE plutôt qu'un doute de correction. */
const RE_TRANSCRIPTION =
  /transcri|illisible|lisibilit|mal lu|lecture de la copie|non transcrit|sch[eé]ma|graphique|image d.origine|manuscrit/i;

export function natureDepuisTexte(texte: string): NatureMotif {
  return RE_TRANSCRIPTION.test(texte) ? 'transcription' : 'correction';
}

/**
 * Motifs du premier passage que la normalisation a DÉJÀ réglés : les
 * soumettre au relecteur ne servirait qu'à les voir revenir.
 */
const RE_MOTIF_DEJA_REGLE = /^(Note du modèle \(|Score hors limites corrigé)/;

export function motifsPremierPassage(resultat: Record<string, unknown>): string[] {
  const bruts = Array.isArray(resultat.human_review_reasons) ? resultat.human_review_reasons : [];
  return bruts
    .map((m) =>
      typeof m === 'string'
        ? m
        : m && typeof m === 'object' && typeof (m as { message?: unknown }).message === 'string'
          ? String((m as { message: string }).message)
          : '',
    )
    .filter((m) => m.trim() && !RE_MOTIF_DEJA_REGLE.test(m));
}

/* ------------------------------------------------------------------ */
/*  Citations : le point est-il vraiment dans la copie ?              */
/* ------------------------------------------------------------------ */

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normaliserPourCitation(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texte intégral de la transcription, pages dans l'ordre. */
export function texteTranscription(transcription: Record<string, unknown> | null | undefined): string {
  const pages = Array.isArray(transcription?.pages) ? (transcription!.pages as unknown[]) : [];
  return pages
    .map((p) => (p && typeof p === 'object' ? String((p as { text?: unknown }).text ?? '') : ''))
    .join('\n');
}

function trigrammes(mots: string[]): string[] {
  const t: string[] = [];
  for (let i = 0; i + 3 <= mots.length; i++) t.push(mots.slice(i, i + 3).join(' '));
  return t;
}

/**
 * La citation se retrouve-t-elle dans la copie ?
 *
 * Tolérante exprès : le relecteur coupe avec « … », et un transcripteur ou un
 * modèle déplace parfois une virgule ou un accent. Chaque morceau d'au moins
 * deux mots doit se retrouver tel quel ; à défaut, un long morceau (6 mots et
 * plus) passe si 70 % de ses groupes de trois mots sont dans la copie. Une
 * citation vide ou introuvable renvoie false.
 */
export function citationPresente(citation: string | null | undefined, texteCopie: string): boolean {
  const copie = normaliserPourCitation(texteCopie);
  if (!copie) return false;
  const morceaux = String(citation ?? '')
    .split(/…|\.\.\.|\[\s*\.\.\.\s*\]|\[…\]/)
    .map(normaliserPourCitation)
    .filter(Boolean);
  if (!morceaux.length) return false;

  const utiles = morceaux.filter((m) => m.split(' ').length >= 2);
  // Citation très courte (« x = 3 », un seul mot) : on la cherche entière.
  if (!utiles.length) return morceaux.some((m) => (` ${copie} `).includes(` ${m} `));

  return utiles.every((m) => {
    if (copie.includes(m)) return true;
    const mots = m.split(' ');
    if (mots.length < 6) return false;
    const t = trigrammes(mots);
    const trouves = t.filter((x) => copie.includes(x)).length;
    return trouves / t.length >= 0.7;
  });
}

/* ------------------------------------------------------------------ */
/*  Motifs tenant à la transcription elle-même                        */
/* ------------------------------------------------------------------ */

/**
 * Doutes qui tiennent à la lecture de la copie, pas au correcteur.
 * `forcee` : Cindy a regardé la copie et demandé « corriger quand même » —
 * la lecture est alors acceptée telle quelle, on ne la remet plus en cause.
 */
export function motifsTranscription(
  transcription: Record<string, unknown> | null | undefined,
  forcee: boolean,
): MotifPersistant[] {
  if (forcee || !transcription) return [];
  const motifs: MotifPersistant[] = [];
  const confiance = Number(transcription.overall_confidence ?? 1);
  if (Number.isFinite(confiance) && confiance < SEUIL_CONFIANCE_TRANSCRIPTION) {
    motifs.push({
      nature: 'transcription',
      code: 'confiance_transcription',
      message: `Lecture de la copie peu sûre (confiance ${confiance}).`,
    });
  }
  if (transcription.requires_human_review === true) {
    motifs.push({
      nature: 'transcription',
      code: 'transcription_douteuse',
      message: 'Le transcripteur a lui-même demandé une vérification de la lecture.',
    });
  }
  return motifs;
}

/* ------------------------------------------------------------------ */
/*  Deuxième lecture — moteur « grille commune »                      */
/* ------------------------------------------------------------------ */

export type VerdictCritere = 'confirme' | 'ajuste';

export type RelectureCritere = {
  code: string;
  verdict: VerdictCritere;
  score: number;
  citation: string;
  motif: string;
};

export type RelectureMotif = { index: number; resolu: boolean; explication: string };

export type RelectureGrilleIA = {
  criteres: RelectureCritere[];
  motifs_premiere_lecture: RelectureMotif[];
  doutes_persistants: string[];
  lecture_douteuse: string[];
  appreciation_corrigee: string;
  synthese: string;
  confiance: number;
};

type CritereGrille = { code?: unknown; name?: unknown; maximum_score?: unknown };
type CritereResultat = {
  code: string;
  score: number;
  maximum: number;
  justification?: string;
  evidence?: { quote?: string }[];
  [k: string]: unknown;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Doutes non résolus du premier passage, + doutes et lectures douteuses du relecteur. */
export function motifsDuRelecteur(
  motifsInitiaux: string[],
  relecture: {
    motifs_premiere_lecture?: RelectureMotif[];
    doutes_persistants?: string[];
    lecture_douteuse?: string[];
  },
): MotifPersistant[] {
  const motifs: MotifPersistant[] = [];
  const traites = new Map((relecture.motifs_premiere_lecture ?? []).map((m) => [Number(m.index), m]));
  motifsInitiaux.forEach((texte, i) => {
    const t = traites.get(i);
    if (t?.resolu === true) return;
    motifs.push({
      nature: natureDepuisTexte(texte),
      code: 'doute_premier_passage',
      message: t?.explication ? `${texte} — ${t.explication}` : texte,
    });
  });
  for (const d of relecture.doutes_persistants ?? []) {
    if (String(d).trim()) motifs.push({ nature: natureDepuisTexte(d), code: 'doute_relecteur', message: String(d) });
  }
  for (const d of relecture.lecture_douteuse ?? []) {
    if (String(d).trim()) motifs.push({ nature: 'transcription', code: 'lecture_douteuse', message: String(d) });
  }
  return motifs;
}

/** Contrôle d'écart : au-delà de 25 % du barème, aucune des deux lectures ne fait foi. */
export function motifEcart(noteAvant: number, noteApres: number, bareme: number): MotifPersistant[] {
  if (!(bareme > 0)) return [];
  const ecart = Math.abs(noteApres - noteAvant);
  if (ecart > SEUIL_ECART_RELECTURE * bareme + 1e-9) {
    return [{
      nature: 'correction',
      code: 'ecart_important',
      message:
        `Les deux lectures divergent de ${arrondi(ecart)} points sur ${bareme} ` +
        `(${noteAvant} → ${noteApres}) : aucune des deux ne fait foi seule.`,
    }];
  }
  return [];
}

/**
 * Applique la deuxième lecture à une correction « grille commune ».
 *
 * La grille fait foi : un critère que le relecteur oublie garde son score du
 * premier passage ; un score hors barème est ramené dans les bornes. La note
 * reste la somme des critères, exactement comme dans `correct-french-copy`.
 */
export function appliquerRelectureGrille(entree: {
  resultat: Record<string, unknown>;
  rubricJson: Record<string, unknown>;
  relecture: RelectureGrilleIA;
  transcription: Record<string, unknown> | null;
  transcriptionForcee?: boolean;
}): {
  resultat: Record<string, unknown>;
  changements: Changement[];
  motifs: MotifPersistant[];
  noteAvant: number;
  noteApres: number;
  bareme: number;
} {
  const { resultat, rubricJson, relecture } = entree;
  const grille = (Array.isArray(rubricJson.criteria) ? rubricJson.criteria : []) as CritereGrille[];
  const premiers = (Array.isArray(resultat.criteria) ? resultat.criteria : []) as CritereResultat[];
  const relus = new Map((relecture.criteres ?? []).map((c) => [String(c.code), c]));
  const texte = texteTranscription(entree.transcription);
  const changements: Changement[] = [];
  const motifs: MotifPersistant[] = [];

  const bareme = grille.reduce((s, g) => s + Number(g.maximum_score ?? 0), 0) ||
    Number(rubricJson.maximum_score ?? 20);

  const criteres = grille.map((g) => {
    const code = String(g.code ?? '');
    const maximum = Number(g.maximum_score ?? 0);
    const premier = premiers.find((c) => String(c.code) === code) ??
      { code, score: 0, maximum, justification: '', evidence: [] };
    const avant = Number(premier.score ?? 0);
    const relu = relus.get(code);

    let apres = avant;
    let justification = String(premier.justification ?? '');
    if (!relu) {
      motifs.push({
        nature: 'correction',
        code: 'critere_non_relu',
        cible: code,
        message: `Critère ${code} : la deuxième lecture ne l'a pas vérifié.`,
      });
    } else {
      const propose = Number(relu.score);
      apres = Number.isFinite(propose) ? arrondi(Math.max(0, Math.min(maximum, propose))) : avant;
      if (Math.abs(apres - avant) > 0.001) {
        changements.push({
          cible: code,
          avant,
          apres,
          motif: String(relu.motif ?? '').trim() || 'Ajusté par la deuxième lecture.',
          citation: relu.citation || undefined,
        });
        justification = `${justification}\n[Deuxième lecture : ${avant} → ${apres}] ${String(relu.motif ?? '').trim()}`.trim();
      }
      // Tout point conservé doit se retrouver dans la copie (sauf enjeu minime).
      if (apres > SEUIL_CITATION_OBLIGATOIRE * bareme + 1e-9) {
        const citations = [relu.citation, ...((premier.evidence ?? []).map((e) => e?.quote ?? ''))];
        if (!citations.some((c) => citationPresente(c, texte))) {
          motifs.push({
            nature: 'correction',
            code: 'citation_introuvable',
            cible: code,
            message: `Critère ${code} : ${apres} point(s) sans passage de la copie retrouvé à l'appui.`,
          });
        }
      }
    }
    return { ...premier, code, maximum, score: apres, justification };
  });

  const noteAvant = arrondi(premiers.reduce((s, c) => s + Number(c.score ?? 0), 0));
  const noteApres = arrondi(criteres.reduce((s, c) => s + Number(c.score ?? 0), 0));

  motifs.push(...motifsDuRelecteur(motifsPremierPassage(resultat), relecture));
  motifs.push(...motifsTranscription(entree.transcription, entree.transcriptionForcee === true));
  motifs.push(...motifEcart(noteAvant, noteApres, bareme));

  const appreciation = String(relecture.appreciation_corrigee ?? '').trim();
  return {
    resultat: {
      ...resultat,
      criteria: criteres,
      note_finale: noteApres,
      analytic_sum: noteApres,
      ...(appreciation ? { appreciation_generale: appreciation } : {}),
      human_review_required: motifs.length > 0,
      human_review_reasons: motifs.map((m) => m.message),
    },
    changements,
    motifs,
    noteAvant,
    noteApres,
    bareme,
  };
}

/* ------------------------------------------------------------------ */
/*  Deuxième lecture — moteur « barème par sujet » (SVT, PC)          */
/* ------------------------------------------------------------------ */

export type RelectureQuestion = {
  question_key: string;
  verdict: VerdictCritere;
  score: number;
  citation: string;
  motif: string;
  /** Après ta vérification, un humain doit-il ENCORE trancher cette question ? */
  relecture_humaine: boolean;
  transcription_incertaine: boolean;
  /** Méthode hors barème que le relecteur juge valide : il tranche à la place d'un prof. */
  methode_alternative_validee: boolean;
};

/** Question telle que le premier passage l'a laissée (sous-ensemble de QuestionCorrigee). */
export type QuestionPremierPassage = {
  question_key: string;
  points: number;
  max_points: number;
  elements_observes?: string[];
  elements_manquants?: string[];
  erreurs?: unknown[];
  preuves?: { page?: number; citation: string; explication?: string }[];
  transcription_incertaine?: boolean;
  relecture_humaine?: boolean;
  methode_alternative?: boolean;
  poursuite_depuis?: string | null;
  competences?: string[];
};

/**
 * Reconstruit la « sortie du modèle » que `construireResultat()` attend, à
 * partir du premier passage et de la deuxième lecture. Les règles du barème
 * (somme mécanique, double sanction, jamais zéro d'office…) sont ensuite
 * rejouées par le même noyau que le premier passage : rien n'est réécrit ici.
 */
export function sortieDepuisRelecture(
  premier: QuestionPremierPassage[],
  relecture: RelectureQuestion[],
): { sortie: Record<string, unknown>[]; changements: Changement[]; nonRelues: string[] } {
  const relus = new Map(relecture.map((r) => [String(r.question_key), r]));
  const changements: Changement[] = [];
  const nonRelues: string[] = [];

  const sortie = premier.map((q) => {
    const r = relus.get(q.question_key);
    if (!r) nonRelues.push(q.question_key);
    const avant = Number(q.points ?? 0);
    const propose = r ? Number(r.score) : avant;
    const apres = Number.isFinite(propose) ? arrondi(Math.max(0, Math.min(Number(q.max_points), propose))) : avant;
    if (r && Math.abs(apres - avant) > 0.001) {
      changements.push({
        cible: q.question_key,
        avant,
        apres,
        motif: String(r.motif ?? '').trim() || 'Ajusté par la deuxième lecture.',
        citation: r.citation || undefined,
      });
    }
    const preuves = [...(q.preuves ?? [])];
    if (r?.citation && !preuves.some((p) => p.citation === r.citation)) {
      preuves.push({ citation: r.citation, explication: `Deuxième lecture : ${String(r.motif ?? '').trim()}` });
    }
    return {
      question_key: q.question_key,
      score: apres,
      elements_observes: q.elements_observes ?? [],
      elements_manquants: q.elements_manquants ?? [],
      erreurs: q.erreurs ?? [],
      preuves,
      transcription_incertaine: r ? r.transcription_incertaine === true : q.transcription_incertaine === true,
      relecture_humaine: r ? r.relecture_humaine === true : q.relecture_humaine === true,
      motifs_relecture: r && r.relecture_humaine ? [String(r.motif ?? '')].filter(Boolean) : [],
      methode_alternative: q.methode_alternative === true && !(r?.methode_alternative_validee === true),
      poursuite_depuis: q.poursuite_depuis ?? null,
      competences: q.competences ?? [],
    };
  });
  return { sortie, changements, nonRelues };
}

/** Nature d'un motif de relecture du noyau du barème. */
export function natureMotifBareme(code: string): NatureMotif {
  if (code === 'transcription_incertaine' || code === 'formule_illisible') return 'transcription';
  if (code === 'anomalie_sujet' || code === 'regles_contradictoires' || code === 'total_incoherent') return 'systeme';
  return 'correction';
}

/** Questions notées sans aucun passage de la copie retrouvé. */
export function motifsCitationsBareme(
  questions: { question_key: string; points: number; preuves?: { citation?: string }[] }[],
  texteCopie: string,
  bareme = 20,
): MotifPersistant[] {
  return questions
    .filter((q) => q.points > SEUIL_CITATION_OBLIGATOIRE * bareme + 1e-9 && !(q.preuves ?? []).some((p) => citationPresente(p.citation, texteCopie)))
    .map((q) => ({
      nature: 'correction' as NatureMotif,
      code: 'citation_introuvable',
      cible: q.question_key,
      message: `Question ${q.question_key} : ${q.points} point(s) sans passage de la copie retrouvé à l'appui.`,
    }));
}

/* ------------------------------------------------------------------ */
/*  La règle du drapeau                                               */
/* ------------------------------------------------------------------ */

export type Suite = 'terminer' | 'recorriger' | 'file_cindy';

/**
 * Que faire d'une copie après sa deuxième lecture ?
 *
 *  - plus aucun doute                                → terminer ;
 *  - déjà recorrigée une fois                        → file Cindy ;
 *  - doutes qu'une recorrection ne peut pas lever
 *    (lecture de la copie, barème, plafond)          → file Cindy ;
 *  - plafond de dépense atteint                      → file Cindy ;
 *  - sinon                                           → UNE recorrection.
 *
 * `recorrectionsFaites` vient d'un compteur en base : la boucle est bornée par
 * construction, même si la fonction était rappelée à l'infini.
 */
export function deciderSuite(entree: {
  motifs: MotifPersistant[];
  recorrectionsFaites: number;
  budgetDisponible: boolean;
}): { suite: Suite; raison: string } {
  const { motifs } = entree;
  if (!motifs.length) return { suite: 'terminer', raison: 'Deuxième lecture sans doute restant.' };
  if (entree.recorrectionsFaites >= MAX_RECORRECTIONS) {
    return { suite: 'file_cindy', raison: 'Le doute persiste après la recorrection automatique.' };
  }
  if (motifs.every((m) => m.nature !== 'correction')) {
    return {
      suite: 'file_cindy',
      raison: 'Doute sur la lecture de la copie ou sur le barème : recorriger la même lecture ne le lèverait pas.',
    };
  }
  if (!entree.budgetDisponible) {
    return { suite: 'file_cindy', raison: 'Plafond de dépense IA du jour atteint : pas de recorrection.' };
  }
  return { suite: 'recorriger', raison: 'Doute de correction : une recorrection complète est lancée (une seule fois).' };
}

export type SuiteTranscription = 'corriger' | 'retranscrire' | 'file_cindy';

/**
 * Transcription douteuse — même règle que le SQL 58
 * (`private.auto_launch_french_correction`), écrite ici pour être testée.
 */
export function deciderTranscription(entree: {
  douteuse: boolean;
  relancesFaites: number;
  budgetDisponible: boolean;
}): SuiteTranscription {
  if (!entree.douteuse) return 'corriger';
  if (entree.relancesFaites >= MAX_RELANCES_TRANSCRIPTION) return 'file_cindy';
  return entree.budgetDisponible ? 'retranscrire' : 'file_cindy';
}

/* ------------------------------------------------------------------ */
/*  Plafond de dépense                                                */
/* ------------------------------------------------------------------ */

/**
 * Ce que coûte chaque action, en « unités » (≈ un appel au modèle, soit
 * ~0,07 $). Même table que le SQL 58 et que `accesDepot.ts`.
 */
export const UNITES_IA = {
  depot: 2, // transcription + correction
  relance: 2, // idem, relancées à la main
  dossier: 1,
  relecture: 1, // deuxième lecture automatique
  recorrection: 1,
  retranscription: 1,
  forcage: 1, // « corriger quand même » de Cindy
} as const;

export type NatureDepense = keyof typeof UNITES_IA;

/** Plafond journalier par défaut (unités), si la base n'en dit rien. */
export const PLAFOND_JOUR_DEFAUT = 400;

/** Même règle que `public.ia_budget_consommer` : on refuse ce qui dépasserait. */
export function decisionPlafond(utiliseAujourdhui: number, unites: number, max: number): boolean {
  return utiliseAujourdhui + Math.max(1, unites) <= max;
}
