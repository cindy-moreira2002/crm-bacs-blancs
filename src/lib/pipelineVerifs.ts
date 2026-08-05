/**
 * Vérifications structurelles d'une matière — LA source unique des règles.
 *
 * Fonction pure, sans accès base : la vue matière (pipelineDetail) et le
 * centre d'anomalies global (pipelineSante) l'appellent tous les deux, pour
 * que la même règle donne le même verdict partout.
 */

export type NiveauDiag = 'bloquant' | 'attention' | 'ok';

export type Diagnostic = {
  niveau: NiveauDiag;
  texte: string;
  /** Où corriger, si ce n'est pas dans la page elle-même. */
  piste?: string;
};

export type StructGrille = {
  id: string;
  track: string;
  exercise_type: string;
  status: string;
  bareme_total: number | null;
  nb_criteres: number;
  nb_taxonomie: number;
  system_prompt_chars: number;
  echelle_ok: boolean;
};

export type StructSujet = {
  id: string;
  track: string;
  exercise_type: string;
  status: string;
  nb_etalons: number;
  source_status: string | null;
};

export type StructGabarit = {
  track: string;
  exercise_type: string;
  audience: string;
  status: string;
};

export type StructEtalon = {
  origine: 'synthetique' | 'reel';
  validation_status: string | null;
};

export type StructMatiere = {
  matiere: string;
  grilles: StructGrille[];
  sujets: StructSujet[];
  gabarits: StructGabarit[];
  etalons: StructEtalon[];
  orphelins: number;
  orphelins_reels: number;
  corrections_total: number;
  corrections_echecs: number;
};

/** Barème ≠ 20 : le system_prompt doit expliquer la conversion sur 20. */
export function echelleExpliquee(bareme: number | null, systemPrompt: string): boolean {
  if (bareme == null || bareme === 20) return true;
  return new RegExp(`(sur|/|\\bde\\b)\\s*${bareme}\\b|normalis|ramen`, 'i').test(systemPrompt);
}

export function verifierStructureMatiere(s: StructMatiere): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const diag = (niveau: NiveauDiag, texte: string, piste?: string) => diags.push({ niveau, texte, piste });

  const grilleActivePour = (x: { track: string; exercise_type: string }) =>
    s.grilles.find((g) => g.track === x.track && g.exercise_type === x.exercise_type && g.status === 'active');
  const gabaritElevePour = (x: { track: string; exercise_type: string }) =>
    s.gabarits.find((g) => g.audience === 'eleve' && g.track === x.track && g.exercise_type === x.exercise_type);

  for (const su of s.sujets) {
    if (su.status === 'active' && !grilleActivePour(su)) {
      diag(
        'bloquant',
        `Sujet « ${su.id} » visible au dépôt SANS barème actif : la correction échouera.`,
        'Activer la grille de cette épreuve ou repasser le sujet en brouillon.',
      );
    }
    const gab = gabaritElevePour(su);
    if (su.status === 'active' && (!gab || gab.status !== 'active')) {
      diag(
        'bloquant',
        `Sujet « ${su.id} » visible au dépôt mais dossier élève ${gab ? 'en brouillon' : 'absent'} : generate-dossier refusera.`,
        'Activer le gabarit élève de cette épreuve.',
      );
    }
    if (su.nb_etalons === 0) {
      diag('attention', `Sujet « ${su.id} » sans aucune copie étalon : la note sortira sans référence.`);
    }
    if ((su.source_status ?? '').includes('synthetic') && su.exercise_type.includes('explication')) {
      diag('attention', `Texte du sujet « ${su.id} » à vérifier mot à mot sur une édition de référence avant activation.`);
    }
  }

  for (const g of s.grilles) {
    if (g.system_prompt_chars === 0) {
      diag('bloquant', `Barème « ${g.id} » sans consigne correcteur (system_prompt vide) : l'IA n'a aucune instruction.`);
    }
    if (g.nb_criteres === 0) {
      diag('bloquant', `Barème « ${g.id} » sans aucun critère.`);
    }
    if (!g.echelle_ok) {
      diag(
        'attention',
        `Barème « ${g.id} » noté sur ${g.bareme_total} mais la consigne n'explique pas la conversion sur 20.`,
        'Ajouter l’échelle dans le system_prompt (gotcha connu).',
      );
    }
    // Le français a sa taxonomie dans la table error_taxonomy, pas dans la grille.
    if (s.matiere !== 'francais' && g.nb_taxonomie === 0) {
      diag('attention', `Barème « ${g.id} » sans taxonomie d'erreurs : les codes d'erreur du dossier seront pauvres.`);
    }
  }

  const typesEpreuves = [...new Set([...s.grilles, ...s.sujets].map((x) => x.exercise_type))];
  for (const ex of typesEpreuves) {
    if (!s.gabarits.some((g) => g.audience === 'eleve' && g.exercise_type === ex)) {
      diag('bloquant', `Épreuve « ${ex} » sans gabarit de dossier élève.`);
    }
  }

  const reels = s.etalons.filter((e) => e.origine === 'reel').length;
  const valides = s.etalons.filter((e) => e.validation_status === 'validated').length;
  if (s.etalons.length > 0 && reels === 0) {
    diag(
      'attention',
      `Les ${s.etalons.length} étalons sont tous synthétiques : l'échelle de notes n'a jamais été calée sur de vraies copies (calibration sévère connue).`,
      '3 vraies copies notées par un prof suffisent pour recaler.',
    );
  }
  if (s.etalons.length > 0 && valides === 0) {
    diag('attention', `Aucun étalon validé par un prof (« validated ») sur ${s.etalons.length}.`);
  }
  if (s.orphelins > 0) {
    diag(
      'attention',
      `${s.orphelins} étalons orphelins rattachés à cette matière par leur épreuve${
        s.orphelins_reels ? ` — dont ${s.orphelins_reels} VRAIES copies` : ''
      } : ils ne participent plus au calage des notes.`,
      'Réaffecter leur subject_id.',
    );
  }
  if (s.corrections_echecs > 0) {
    diag('attention', `${s.corrections_echecs} correction(s) en échec sur les ${s.corrections_total} dernières de la matière.`);
  }

  return diags;
}

export function trierDiagnostics(diags: Diagnostic[]): Diagnostic[] {
  const poids: Record<NiveauDiag, number> = { bloquant: 0, attention: 1, ok: 2 };
  return [...diags].sort((a, b) => poids[a.niveau] - poids[b.niveau]);
}
