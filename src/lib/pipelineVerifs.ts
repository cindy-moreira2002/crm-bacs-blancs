/**
 * Vérifications structurelles d'une matière — LA source unique des règles.
 *
 * Fonction pure, sans accès base : la vue matière (pipelineDetail) et le
 * centre d'anomalies global (pipelineSante) l'appellent tous les deux, pour
 * que la même règle donne le même verdict partout.
 */

export type NiveauDiag = 'bloquant' | 'attention' | 'ok';

/**
 * L'objet précis dont parle un diagnostic.
 *
 * Le texte cite déjà un identifiant entre guillemets, mais le relire au
 * caractère près pour fabriquer un lien est fragile : la moindre reformulation
 * casserait le bouton « aller voir ». On transporte donc l'identifiant tel
 * quel, à côté de la phrase.
 */
export type CibleDiag = {
  correction_id?: string;
  sujet_id?: string;
  exam_id?: string;
  exercise_type?: string;
  track?: string;
  grille_id?: string;
};

export type Diagnostic = {
  niveau: NiveauDiag;
  texte: string;
  /** Où corriger, si ce n'est pas dans la page elle-même. */
  piste?: string;
  cible?: CibleDiag;
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
  const diag = (niveau: NiveauDiag, texte: string, piste?: string, cible?: CibleDiag) =>
    diags.push({ niveau, texte, piste, cible });

  const grilleActivePour = (x: { track: string; exercise_type: string }) =>
    s.grilles.find((g) => g.track === x.track && g.exercise_type === x.exercise_type && g.status === 'active');
  // Une épreuve peut avoir plusieurs gabarits élève : la v1 archivée ET la v2
  // active. On cherche donc l'ACTIF d'abord — sinon la v1, rangée en premier,
  // ferait croire que le dossier élève est en brouillon alors qu'il est prêt.
  const gabaritElevePour = (x: { track: string; exercise_type: string }) => {
    const siens = s.gabarits.filter(
      (g) => g.audience === 'eleve' && g.track === x.track && g.exercise_type === x.exercise_type,
    );
    return siens.find((g) => g.status === 'active') ?? siens[0];
  };

  for (const su of s.sujets) {
    if (su.status === 'active' && !grilleActivePour(su)) {
      diag(
        'bloquant',
        `Sujet « ${su.id} » visible au dépôt SANS barème actif : la correction échouera.`,
        'Activer la grille de cette épreuve ou repasser le sujet en brouillon.',
        { sujet_id: su.id, track: su.track, exercise_type: su.exercise_type },
      );
    }
    const gab = gabaritElevePour(su);
    if (su.status === 'active' && (!gab || gab.status !== 'active')) {
      diag(
        'bloquant',
        `Sujet « ${su.id} » visible au dépôt mais dossier élève ${gab ? 'en brouillon' : 'absent'} : generate-dossier refusera.`,
        'Activer le gabarit élève de cette épreuve.',
        { sujet_id: su.id, track: su.track, exercise_type: su.exercise_type },
      );
    }
    if (su.nb_etalons === 0) {
      diag('attention', `Sujet « ${su.id} » sans aucune copie étalon : la note sortira sans référence.`, undefined, {
        sujet_id: su.id, track: su.track, exercise_type: su.exercise_type,
      });
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
      diag('bloquant', `Épreuve « ${ex} » sans gabarit de dossier élève.`, undefined, { exercise_type: ex });
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

/* ------------------------------------------------------------------ */
/*  Couche « barème propre au sujet »                                 */
/* ------------------------------------------------------------------ */

export type StructExamen = {
  id: string;
  code: string;
  titre: string;
  statut: string;
  /** Version affichée : l'active, sinon la plus récente. */
  version: string | null;
  statut_version: string | null;
  total_points: number | null;
  max_score: number | null;
  blocages: number;
  etalons: number;
  corrections_humaines: number;
  copies_comparees: number;
  biais_moyen: number | null;
  /** Copies d'élèves corrigées avec ce barème. */
  copies: number;
  /** Nombre de versions différentes employées dans le même lot. */
  versions_utilisees: number;
};

/**
 * Vérifications de la couche 1 (la note).
 *
 * Elles complètent `verifierStructureMatiere`, qui ne juge que la grille
 * générique — devenue couche de diagnostic. Les deux vivent ici pour que la
 * vue matière et le centre de santé rendent le même verdict.
 */
export function verifierBaremes(matiere: string, examens: StructExamen[]): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const diag = (niveau: NiveauDiag, texte: string, piste?: string, cible?: CibleDiag) =>
    diags.push({ niveau, texte, piste, cible });

  for (const e of examens) {
    if (e.statut === 'archived') continue;
    // Tout ce qui sort de ce tour de boucle parle de CE bac blanc : on stampe
    // son identifiant à la fin plutôt que de le répéter sur chaque appel.
    const debut = diags.length;

    // Le cas le plus grave : des copies notées avec deux barèmes différents.
    if (e.versions_utilisees > 1) {
      diag(
        'bloquant',
        `« ${e.titre} » : ${e.copies} copies corrigées avec ${e.versions_utilisees} versions de barème différentes — deux élèves n'ont pas été notés pareil.`,
        'Relancer les copies périmées depuis l’onglet Calibration de l’examen.',
      );
    }

    if (e.statut === 'correction_open' && e.statut_version !== 'locked') {
      diag(
        'bloquant',
        `« ${e.titre} » accepte des copies alors que son barème n'est pas verrouillé : il peut changer sous les élèves.`,
      );
    }

    // Un examen sans aucune version : la coquille existe, le barème non.
    if (e.version === null) {
      diag(
        'attention',
        `« ${e.titre} » n'a aucune version de barème : rien ne peut être corrigé avec.`,
        'Ouvrir l’examen dans /admin/bareme et créer son barème 1.0.',
      );
    }

    if (e.blocages > 0) {
      diag(
        e.statut === 'correction_open' ? 'bloquant' : 'attention',
        `« ${e.titre} » : ${e.blocages} blocage(s) dans le barème (total ≠ ${e.max_score ?? 20}, réponse attendue ou compétence manquante…).`,
        'Ouvrir l’examen dans /admin/bareme, onglet Éditeur de barème.',
      );
    } else if (
      e.total_points !== null &&
      e.max_score !== null &&
      Math.abs(e.total_points - e.max_score) > 0.001
    ) {
      diag('bloquant', `« ${e.titre} » : le barème totalise ${e.total_points} points au lieu de ${e.max_score}.`);
    }

    if (e.etalons === 0) {
      diag(
        'attention',
        `« ${e.titre} » n'a aucune copie étalon : le barème n'a jamais été comparé à un correcteur humain.`,
        'Importer 3 copies notées, dont une faible et une moyenne.',
      );
    } else if (e.copies_comparees === 0) {
      diag(
        'attention',
        `« ${e.titre} » : ${e.etalons} copie(s) étalon mais aucune corrigée des deux côtés — la calibration n'a pas été réalisée.`,
      );
    } else if (e.biais_moyen !== null && Math.abs(e.biais_moyen) >= 1) {
      diag(
        'attention',
        `« ${e.titre} » : l'IA note en moyenne ${e.biais_moyen > 0 ? '+' : ''}${e.biais_moyen} point(s) par rapport aux professeurs sur ${e.copies_comparees} copies.`,
        'Reprendre le barème pour TOUTES les copies, avant verrouillage — jamais copie par copie.',
      );
    }

    if (e.statut_version === 'locked' && e.statut !== 'correction_open' && e.statut !== 'archived') {
      diag(
        'attention',
        `« ${e.titre} » : barème verrouillé mais corrections pas encore ouvertes — aucune copie ne peut être déposée.`,
      );
    }

    for (let i = debut; i < diags.length; i += 1) diags[i].cible = { exam_id: e.id };
  }

  if (examens.length === 0) {
    diag(
      'attention',
      `Aucun bac blanc de ${matiere} n'a de barème propre : la note vient encore de la grille générique de compétences, la même pour tous les sujets.`,
      'Créer le bac blanc et son barème dans /admin/bareme.',
    );
  }

  return diags;
}

export function trierDiagnostics(diags: Diagnostic[]): Diagnostic[] {
  const poids: Record<NiveauDiag, number> = { bloquant: 0, attention: 1, ok: 2 };
  return [...diags].sort((a, b) => poids[a.niveau] - poids[b.niveau]);
}
