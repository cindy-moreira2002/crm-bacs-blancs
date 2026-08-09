/**
 * Barèmes et corrections du BREVET — accès base.
 *
 * ⚠️ SERVEUR UNIQUEMENT : lit la base pipeline avec la clé service_role.
 * Toutes les tables de ce module ont RLS activée sans aucune policy, donc
 * seuls le serveur de l'application et les Edge Functions y accèdent. Aucune
 * clé ne descend jamais au navigateur : les écrans passent par
 * `/api/admin/brevet/*`.
 *
 * Les RÈGLES ne sont pas ici : elles vivent dans `brevetNoyau.ts`,
 * `brevetFrancaisNoyau.ts` et `brevetMathsNoyau.ts`, partagés avec les Edge
 * Functions et testés hors ligne. Ce module ne fait que lire et écrire.
 *
 * ÉTANCHÉITÉ : chaque fonction publique de ce fichier prend la matière en
 * paramètre et filtre dessus. `chargerExamenBrevet()` refuse un examen qui
 * n'est pas de niveau DNB — un identifiant d'examen de bac ne peut donc pas
 * ouvrir un écran de brevet, même en tapant l'URL à la main.
 */
import { pipelineDb } from '@/lib/pipeline';
import {
  estMatiereBrevet,
  type MatiereBrevet,
  type SerieBrevet,
} from '@/lib/brevetNoyau';

/* ------------------------------------------------------------------ */
/*  Formes lues en base                                               */
/* ------------------------------------------------------------------ */

export type ExamenBrevet = {
  id: string;
  code: string;
  matiere: MatiereBrevet;
  examen: 'DNB';
  serie: SerieBrevet;
  niveau: string | null;
  titre: string;
  session: string | null;
  date_epreuve: string | null;
  subject_id: string | null;
  sujet_url: string | null;
  sujet_texte: string | null;
  corrige_url: string | null;
  corrige_texte: string | null;
  consignes_correcteur: string | null;
  statut: string;
  bareme_version_active: string | null;
  commentaire: string | null;
  cree_le: string;
  maj_le: string;
};

export type VersionBrevet = {
  id: string;
  exam_id: string;
  version: string;
  matiere: string;
  statut: string;
  total_points: number;
  max_score: number;
  controles: ControlesBrevet | null;
  valide_par: string | null;
  valide_le: string | null;
  verrouille_par: string | null;
  verrouille_le: string | null;
  cree_le: string;
};

export type ControlesBrevet = {
  ok: boolean;
  total_points: number;
  moteur?: string;
  blocages: { code: string; question_key?: string; message: string }[];
  avertissements: { code: string; question_key?: string; message: string }[];
  verifie_le?: string;
};

export type QuestionBrevetLigne = {
  id: string;
  question_key: string;
  numero: string;
  sous_numero: string | null;
  partie: string;
  libelle: string;
  ordre: number;
  max_points: number;
  type_reponse: string | null;
  elements_attendus: string[];
  citations_attendues: string[];
  degre_justification: string | null;
  reponses_equivalentes: string[];
  methodes_alternatives: { libelle: string; description: string }[];
  erreurs_frequentes: string[];
  regles_points_partiels: { points: number; condition: string; cumulable: boolean }[];
  etapes: { code: string; libelle: string; points: number }[];
  reponse_attendue: string | null;
  raisonnement_attendu: string | null;
  unites_attendues: string | null;
  precision_attendue: string | null;
  justification_attendue: string | null;
  domaines: string[];
  connaissances: string[];
  competences: string[];
  codes_erreurs: string[];
  depend_de: string[];
  regle_cascade: string | null;
  etapes_geometrie: string[];
  calculatrice: string;
};

export type BaremeBrevet = {
  examen: ExamenBrevet;
  version: VersionBrevet;
  questions: QuestionBrevetLigne[];
  // Français
  reecriture: {
    config: {
      max_points: number;
      penalite_erreur_copie: number | null;
      plafond_erreurs_copie: number | null;
      consigne: string | null;
      bareme_du_sujet_fourni: boolean;
    } | null;
    items: {
      id: string;
      cle: string;
      ordre: number;
      forme_originale: string;
      forme_attendue: string;
      transformation: string;
      points: number;
      variantes_admises: string[];
    }[];
  };
  dictee: {
    config: {
      max_points: number;
      texte_attendu: string;
      longueur_signes: number | null;
      plancher: number;
      graphies_admises: string[];
      source_bareme: string | null;
      consigne: string | null;
    } | null;
    regles: {
      id: string;
      categorie: string;
      sous_categorie: string | null;
      penalite: number;
      plafond: number | null;
      cumul_repetitions: boolean;
      regle: string;
      ordre: number;
    }[];
  };
  redaction: {
    id: string;
    type_sujet: 'imagination' | 'reflexion';
    intitule: string;
    max_points: number;
    longueur_minimale: number | null;
    issue_du_sujet: boolean;
    consigne: string | null;
    criteres: {
      id: string;
      code: string;
      libelle: string;
      max_points: number;
      descripteurs: { niveau: string; description: string; points: number }[];
      famille: string | null;
      cumul_famille_autorise: boolean;
      actif: boolean;
      ordre: number;
    }[];
  }[];
  // Mathématiques
  automatismes: {
    id: string;
    item_key: string;
    numero: string;
    ordre: number;
    notion: string;
    theme: string;
    competence: string;
    reponse_attendue: string;
    variantes_acceptees: string[];
    unite_attendue: string | null;
    tolerance: number | null;
    forme_exigee: string | null;
    points: number;
    codes_erreurs: string[];
  }[];
  qualiteRedaction: {
    id: string;
    code: string;
    libelle: string;
    max_points: number;
    descripteurs: unknown[];
    actif: boolean;
    ordre: number;
  }[];
  referentiel: { code: string; libelle: string; description: string | null; toujours_mobilisee: boolean }[];
  taxonomie: {
    code: string;
    domaine: string | null;
    description: string;
    gravite: string;
    nature: string;
    partie: string | null;
    sous_categorie: string | null;
    libelle_eleve: string | null;
    penalite_defaut: number | null;
    regle_application: string | null;
    plafond_perte: number | null;
    cumul_autorise: boolean;
    conseil: string | null;
    competence: string | null;
  }[];
};

/* ------------------------------------------------------------------ */
/*  Lecture                                                           */
/* ------------------------------------------------------------------ */

/** Les examens d'UNE matière du brevet. Jamais ceux du bac, jamais l'autre matière. */
export async function listerExamensBrevet(matiere: MatiereBrevet): Promise<
  (ExamenBrevet & {
    versions: VersionBrevet[];
    nb_etalons: number;
    nb_corrections: number;
    nb_en_relecture: number;
  })[]
> {
  const db = pipelineDb();
  const [examsRes, versionsRes, etalonsRes, corrRes] = await Promise.all([
    db
      .from('exams')
      .select('*')
      .eq('examen', 'DNB')
      .eq('matiere', matiere)
      .order('date_epreuve', { ascending: true, nullsFirst: false }),
    db.from('bareme_versions').select('*').eq('matiere', matiere).order('cree_le'),
    db.from('etalon_copies').select('id, exam_id'),
    db
      .from('corrections')
      .select('id, exam_id, human_review_required')
      .eq('moteur', matiere),
  ]);
  if (examsRes.error) throw new Error(`Lecture des examens : ${examsRes.error.message}`);

  const versions = (versionsRes.data ?? []) as VersionBrevet[];
  const etalons = (etalonsRes.data ?? []) as { exam_id: string }[];
  const corrections = (corrRes.data ?? []) as {
    exam_id: string | null;
    human_review_required: boolean | null;
  }[];

  return ((examsRes.data ?? []) as ExamenBrevet[]).map((e) => ({
    ...e,
    versions: versions.filter((v) => v.exam_id === e.id),
    nb_etalons: etalons.filter((x) => x.exam_id === e.id).length,
    nb_corrections: corrections.filter((c) => c.exam_id === e.id).length,
    nb_en_relecture: corrections.filter((c) => c.exam_id === e.id && c.human_review_required).length,
  }));
}

/**
 * Charge un examen ET vérifie qu'il est bien du brevet, dans la bonne matière.
 *
 * C'est le garde-fou d'URL : ouvrir `/admin/brevet/francais/<id d'un examen de
 * maths ou de bac>` ne montre rien.
 */
export async function chargerExamenBrevet(
  examId: string,
  matiere: MatiereBrevet,
): Promise<ExamenBrevet | null> {
  const db = pipelineDb();
  const { data, error } = await db.from('exams').select('*').eq('id', examId).maybeSingle();
  if (error) throw new Error(`Lecture de l'examen : ${error.message}`);
  if (!data) return null;
  const e = data as ExamenBrevet;
  if (e.examen !== 'DNB' || e.matiere !== matiere) return null;
  return e;
}

/** Le barème complet d'une version, avec tout ce que sa matière comporte. */
export async function chargerBaremeBrevet(
  versionId: string,
  matiere: MatiereBrevet,
): Promise<BaremeBrevet | null> {
  const db = pipelineDb();

  const { data: version, error } = await db
    .from('bareme_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw new Error(`Lecture de la version : ${error.message}`);
  if (!version) return null;
  const v = version as VersionBrevet;
  if (v.matiere !== matiere) return null;

  const examen = await chargerExamenBrevet(v.exam_id, matiere);
  if (!examen) return null;

  const [qRes, refRes, taxoRes] = await Promise.all([
    db.from('bareme_questions').select('*').eq('bareme_version_id', versionId).order('ordre'),
    db
      .from('competence_referentiels')
      .select('code, libelle, description, toujours_mobilisee')
      .eq('matiere', matiere)
      .order('ordre'),
    db
      .from('taxonomie_erreurs')
      .select(
        'code, domaine, description, gravite, nature, partie, sous_categorie, libelle_eleve, ' +
          'penalite_defaut, regle_application, plafond_perte, cumul_autorise, conseil, competence',
      )
      .eq('matiere', matiere)
      .order('code'),
  ]);

  const base = {
    examen,
    version: v,
    questions: (qRes.data ?? []) as QuestionBrevetLigne[],
    referentiel: (refRes.data ?? []) as BaremeBrevet['referentiel'],
    taxonomie: (taxoRes.data ?? []) as unknown as BaremeBrevet['taxonomie'],
    reecriture: { config: null, items: [] },
    dictee: { config: null, regles: [] },
    redaction: [],
    automatismes: [],
    qualiteRedaction: [],
  } as BaremeBrevet;

  if (matiere === 'brevet_francais') {
    const [cfgR, itemsR, cfgD, reglesD, grillesR] = await Promise.all([
      db.from('brevet_reecriture_config').select('*').eq('bareme_version_id', versionId).maybeSingle(),
      db.from('brevet_reecriture_items').select('*').eq('bareme_version_id', versionId).order('ordre'),
      db.from('brevet_dictee_config').select('*').eq('bareme_version_id', versionId).maybeSingle(),
      db.from('brevet_dictee_regles').select('*').eq('bareme_version_id', versionId).order('ordre'),
      db.from('brevet_redaction_grilles').select('*').eq('bareme_version_id', versionId).order('type_sujet'),
    ]);
    const grilles = (grillesR.data ?? []) as Record<string, unknown>[];
    const criteres = grilles.length
      ? await db
          .from('brevet_redaction_criteres')
          .select('*')
          .in(
            'grille_id',
            grilles.map((g) => g.id as string),
          )
          .order('ordre')
      : { data: [] as Record<string, unknown>[] };

    base.reecriture = {
      config: (cfgR.data as BaremeBrevet['reecriture']['config']) ?? null,
      items: (itemsR.data ?? []) as BaremeBrevet['reecriture']['items'],
    };
    base.dictee = {
      config: (cfgD.data as BaremeBrevet['dictee']['config']) ?? null,
      regles: (reglesD.data ?? []) as BaremeBrevet['dictee']['regles'],
    };
    base.redaction = grilles.map((g) => ({
      ...(g as unknown as BaremeBrevet['redaction'][number]),
      criteres: ((criteres.data ?? []) as Record<string, unknown>[]).filter(
        (c) => c.grille_id === g.id,
      ) as unknown as BaremeBrevet['redaction'][number]['criteres'],
    }));
  } else {
    const [autoR, qualiteR] = await Promise.all([
      db.from('brevet_automatismes').select('*').eq('bareme_version_id', versionId).order('ordre'),
      db
        .from('brevet_qualite_redaction_criteres')
        .select('*')
        .eq('bareme_version_id', versionId)
        .order('ordre'),
    ]);
    base.automatismes = (autoR.data ?? []) as BaremeBrevet['automatismes'];
    base.qualiteRedaction = (qualiteR.data ?? []) as BaremeBrevet['qualiteRedaction'];
  }

  return base;
}

/** Le barème actif d'un examen, ou la dernière version si aucune n'est active. */
export async function chargerBaremeActifBrevet(
  examId: string,
  matiere: MatiereBrevet,
): Promise<BaremeBrevet | null> {
  const examen = await chargerExamenBrevet(examId, matiere);
  if (!examen) return null;
  if (examen.bareme_version_active) return chargerBaremeBrevet(examen.bareme_version_active, matiere);

  const db = pipelineDb();
  const { data } = await db
    .from('bareme_versions')
    .select('id')
    .eq('exam_id', examId)
    .order('cree_le', { ascending: false })
    .limit(1);
  const id = (data ?? [])[0]?.id as string | undefined;
  return id ? chargerBaremeBrevet(id, matiere) : null;
}

/* ------------------------------------------------------------------ */
/*  Contrôles, verrouillage, ouverture                                */
/* ------------------------------------------------------------------ */

/** Contrôles faisant autorité : ceux de la base. Met aussi `controles` à jour. */
export async function verifierBaremeEnBase(versionId: string): Promise<ControlesBrevet> {
  const db = pipelineDb();
  const { data, error } = await db.rpc('brevet_verifier', { p_version: versionId });
  if (error) throw new Error(`Vérification du barème : ${error.message}`);
  return data as ControlesBrevet;
}

export async function verrouillerBaremeBrevet(versionId: string, auteur: string) {
  const db = pipelineDb();
  const { data, error } = await db.rpc('brevet_verrouiller', {
    p_version: versionId,
    p_auteur: auteur,
  });
  if (error) throw new Error(error.message);
  return data as ControlesBrevet;
}

export async function ouvrirCorrectionsBrevet(examId: string, auteur: string) {
  const db = pipelineDb();
  const { data, error } = await db.rpc('exam_ouvrir_correction', {
    p_exam: examId,
    p_auteur: auteur,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; version: string };
}

export async function nouvelleVersionBrevet(versionId: string, nouvelle: string, auteur: string) {
  const db = pipelineDb();
  const { data, error } = await db.rpc('bareme_nouvelle_version', {
    p_version: versionId,
    p_nouvelle: nouvelle,
    p_auteur: auteur,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/* ------------------------------------------------------------------ */
/*  Écriture                                                          */
/* ------------------------------------------------------------------ */

/**
 * Crée un bac blanc de brevet et sa version 1.0, vide, en brouillon.
 *
 * Le maximum de la version vaut 100 en français et 20 en mathématiques :
 * c'est ce que la note de service impose, et `brevet_verifier()` refuse
 * ensuite tout barème qui ne l'atteint pas exactement.
 */
export async function creerExamenBrevet(entree: {
  code: string;
  matiere: MatiereBrevet;
  titre: string;
  serie?: SerieBrevet;
  session?: string | null;
  date_epreuve?: string | null;
  subject_id?: string | null;
  auteur: string;
}): Promise<{ examen: ExamenBrevet; version: VersionBrevet }> {
  if (!estMatiereBrevet(entree.matiere)) {
    throw new Error(`« ${entree.matiere} » n'est pas une matière du brevet.`);
  }
  const db = pipelineDb();
  const maxScore = entree.matiere === 'brevet_francais' ? 100 : 20;

  const { data: examen, error } = await db
    .from('exams')
    .insert({
      code: entree.code,
      matiere: entree.matiere,
      examen: 'DNB',
      serie: entree.serie ?? 'generale',
      niveau: 'troisieme',
      track: 'generale',
      titre: entree.titre,
      session: entree.session ?? null,
      date_epreuve: entree.date_epreuve ?? null,
      subject_id: entree.subject_id ?? null,
      statut: 'draft',
      cree_par: entree.auteur,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Création de l'examen : ${error.message}`);

  const { data: version, error: errV } = await db
    .from('bareme_versions')
    .insert({
      exam_id: (examen as ExamenBrevet).id,
      version: '1.0',
      matiere: entree.matiere,
      statut: 'draft',
      max_score: maxScore,
      cree_par: entree.auteur,
    })
    .select('*')
    .single();
  if (errV) throw new Error(`Création du barème : ${errV.message}`);

  const versionId = (version as VersionBrevet).id;

  // Les blocs naissent avec le barème : ils portent le maximum officiel et
  // l'éditeur affiche tout de suite ce qui reste à répartir.
  const blocs =
    entree.matiere === 'brevet_francais'
      ? [
          { code: 'texte', libelle: 'Travail sur le texte (réécriture comprise)', max_points: 50, ordre: 0 },
          { code: 'dictee', libelle: 'Dictée', max_points: 10, ordre: 1 },
          { code: 'redaction', libelle: 'Rédaction', max_points: 40, ordre: 2 },
        ]
      : [
          { code: 'automatismes', libelle: 'Partie 1 — Automatismes', max_points: 6, ordre: 0 },
          { code: 'raisonnement', libelle: 'Partie 2 — Raisonnement (rédaction comprise)', max_points: 14, ordre: 1 },
        ];
  await db
    .from('brevet_parties')
    .insert(blocs.map((b) => ({ ...b, bareme_version_id: versionId })));

  if (entree.matiere === 'brevet_francais') {
    // Les deux grilles de rédaction sont obligatoires : on les crée vides
    // plutôt que de laisser l'administratrice découvrir le blocage plus tard.
    await db.from('brevet_redaction_grilles').insert([
      { bareme_version_id: versionId, type_sujet: 'imagination', max_points: 40, issue_du_sujet: false },
      { bareme_version_id: versionId, type_sujet: 'reflexion', max_points: 40, issue_du_sujet: false },
    ]);
    await db.from('brevet_dictee_config').insert({ bareme_version_id: versionId, max_points: 10 });
    await db
      .from('brevet_reecriture_config')
      .insert({ bareme_version_id: versionId, max_points: 0, bareme_du_sujet_fourni: false });
  } else {
    // Les 2 points de qualité rédactionnelle, répartis sur les huit points de
    // contrôle de la note de service. Ils sont COMPRIS dans les 14.
    const criteres = [
      ['clarte', 'Clarté'],
      ['precision', 'Précision'],
      ['presentation_calculs', 'Présentation des calculs'],
      ['justification', 'Justification'],
      ['vocabulaire', 'Utilisation correcte du vocabulaire'],
      ['unites', 'Présence des unités'],
      ['conclusions', 'Conclusions'],
      ['enchainement', 'Lisibilité de l’enchaînement'],
    ];
    await db.from('brevet_qualite_redaction_criteres').insert(
      criteres.map(([code, libelle], i) => ({
        bareme_version_id: versionId,
        code,
        libelle,
        max_points: 0.25,
        ordre: i,
      })),
    );
  }

  await verifierBaremeEnBase(versionId);
  return { examen: examen as ExamenBrevet, version: version as VersionBrevet };
}

export async function majExamenBrevet(
  examId: string,
  matiere: MatiereBrevet,
  champs: Partial<ExamenBrevet>,
): Promise<ExamenBrevet> {
  const existant = await chargerExamenBrevet(examId, matiere);
  if (!existant) throw new Error('Examen de brevet introuvable pour cette matière.');

  const db = pipelineDb();
  const autorises: (keyof ExamenBrevet)[] = [
    'titre', 'session', 'date_epreuve', 'subject_id', 'sujet_url', 'sujet_texte',
    'corrige_url', 'corrige_texte', 'consignes_correcteur', 'commentaire', 'statut', 'serie',
  ];
  const payload: Record<string, unknown> = { maj_le: new Date().toISOString() };
  for (const cle of autorises) if (cle in champs) payload[cle] = champs[cle];

  const { data, error } = await db.from('exams').update(payload).eq('id', examId).select('*').single();
  if (error) throw new Error(`Mise à jour de l'examen : ${error.message}`);
  return data as ExamenBrevet;
}

/** Refuse toute écriture sur une version verrouillée. Le trigger le fait aussi. */
async function refuserSiVerrouille(versionId: string): Promise<void> {
  const db = pipelineDb();
  const { data } = await db
    .from('bareme_versions')
    .select('statut')
    .eq('id', versionId)
    .maybeSingle();
  if (!data) throw new Error('Version de barème introuvable.');
  if ((data as { statut: string }).statut === 'locked') {
    throw new Error(
      'Ce barème est verrouillé. Crée une nouvelle version pour le modifier : les copies déjà corrigées doivent garder la leur.',
    );
  }
}

export type SaisieQuestionBrevet = {
  question_key: string;
  numero: string;
  sous_numero?: string | null;
  partie: string;
  libelle?: string;
  ordre?: number;
  max_points: number;
  type_reponse?: string | null;
  elements_attendus?: string[];
  citations_attendues?: string[];
  degre_justification?: string | null;
  reponses_equivalentes?: string[];
  methodes_alternatives?: unknown[];
  erreurs_frequentes?: string[];
  regles_points_partiels?: unknown[];
  etapes?: unknown[];
  reponse_attendue?: string | null;
  raisonnement_attendu?: string | null;
  unites_attendues?: string | null;
  precision_attendue?: string | null;
  justification_attendue?: string | null;
  domaines?: string[];
  connaissances?: string[];
  competences?: string[];
  codes_erreurs?: string[];
  depend_de?: string[];
  regle_cascade?: string | null;
  etapes_geometrie?: string[];
  calculatrice?: 'autorisee' | 'interdite' | 'indifferent';
};

/** Remplace intégralement les questions d'une version. */
export async function enregistrerQuestionsBrevet(
  versionId: string,
  questions: SaisieQuestionBrevet[],
): Promise<void> {
  await refuserSiVerrouille(versionId);
  const db = pipelineDb();

  const { data: avant } = await db
    .from('bareme_questions')
    .select('id, question_key')
    .eq('bareme_version_id', versionId);
  const gardees = new Set(questions.map((q) => q.question_key));
  const aSupprimer = ((avant ?? []) as { id: string; question_key: string }[])
    .filter((q) => !gardees.has(q.question_key))
    .map((q) => q.id);
  if (aSupprimer.length) {
    const { error } = await db.from('bareme_questions').delete().in('id', aSupprimer);
    if (error) throw new Error(`Suppression des questions retirées : ${error.message}`);
  }

  if (questions.length) {
    const { error } = await db.from('bareme_questions').upsert(
      questions.map((q, i) => ({
        bareme_version_id: versionId,
        question_key: q.question_key,
        numero: q.numero,
        sous_numero: q.sous_numero ?? null,
        partie: q.partie,
        libelle: q.libelle ?? '',
        ordre: q.ordre ?? i,
        max_points: q.max_points,
        type_reponse: q.type_reponse ?? null,
        elements_attendus: q.elements_attendus ?? [],
        citations_attendues: q.citations_attendues ?? [],
        degre_justification: q.degre_justification ?? null,
        reponses_equivalentes: q.reponses_equivalentes ?? [],
        methodes_alternatives: q.methodes_alternatives ?? [],
        erreurs_frequentes: q.erreurs_frequentes ?? [],
        regles_points_partiels: q.regles_points_partiels ?? [],
        etapes: q.etapes ?? [],
        reponse_attendue: q.reponse_attendue ?? null,
        raisonnement_attendu: q.raisonnement_attendu ?? null,
        unites_attendues: q.unites_attendues ?? null,
        precision_attendue: q.precision_attendue ?? null,
        justification_attendue: q.justification_attendue ?? null,
        domaines: q.domaines ?? [],
        connaissances: q.connaissances ?? [],
        competences: q.competences ?? [],
        codes_erreurs: q.codes_erreurs ?? [],
        depend_de: q.depend_de ?? [],
        regle_cascade: q.regle_cascade ?? null,
        etapes_geometrie: q.etapes_geometrie ?? [],
        calculatrice: q.calculatrice ?? 'indifferent',
        maj_le: new Date().toISOString(),
      })),
      { onConflict: 'bareme_version_id,question_key' },
    );
    if (error) throw new Error(`Enregistrement des questions : ${error.message}`);
  }

  await verifierBaremeEnBase(versionId);
}

/** Remplace intégralement un sous-ensemble du barème (réécriture, dictée, etc.). */
export async function remplacerLignes(
  versionId: string,
  table: string,
  lignes: Record<string, unknown>[],
): Promise<void> {
  await refuserSiVerrouille(versionId);
  const db = pipelineDb();
  const { error: errDel } = await db.from(table).delete().eq('bareme_version_id', versionId);
  if (errDel) throw new Error(`Nettoyage de ${table} : ${errDel.message}`);
  if (lignes.length) {
    const { error } = await db
      .from(table)
      .insert(lignes.map((l) => ({ ...l, bareme_version_id: versionId })));
    if (error) throw new Error(`Enregistrement de ${table} : ${error.message}`);
  }
  await verifierBaremeEnBase(versionId);
}

/** Met à jour une configuration à ligne unique (réécriture, dictée). */
export async function majConfig(
  versionId: string,
  table: 'brevet_reecriture_config' | 'brevet_dictee_config',
  champs: Record<string, unknown>,
): Promise<void> {
  await refuserSiVerrouille(versionId);
  const db = pipelineDb();
  const { error } = await db
    .from(table)
    .upsert(
      { ...champs, bareme_version_id: versionId, maj_le: new Date().toISOString() },
      { onConflict: 'bareme_version_id' },
    );
  if (error) throw new Error(`Enregistrement de ${table} : ${error.message}`);
  await verifierBaremeEnBase(versionId);
}

/* ------------------------------------------------------------------ */
/*  Corrections : lecture du détail                                   */
/* ------------------------------------------------------------------ */

export type DetailCorrectionBrevet = {
  correction: Record<string, unknown>;
  examen: ExamenBrevet | null;
  bareme: BaremeBrevet | null;
  questions: Record<string, unknown>[];
  automatismes: Record<string, unknown>[];
  reecriture: Record<string, unknown>[];
  dictee: Record<string, unknown>[];
  redaction: Record<string, unknown> | null;
  redactionCriteres: Record<string, unknown>[];
  qualiteRedaction: Record<string, unknown>[];
  documentQualite: Record<string, unknown> | null;
  validations: Record<string, unknown>[];
  modifications: Record<string, unknown>[];
};

export async function chargerCorrectionBrevet(
  correctionId: string,
  matiere: MatiereBrevet,
): Promise<DetailCorrectionBrevet | null> {
  const db = pipelineDb();
  const { data: correction } = await db
    .from('corrections')
    .select('*')
    .eq('id', correctionId)
    .maybeSingle();
  if (!correction) return null;
  // Une copie de l'autre matière, ou du bac, n'est pas visible ici.
  if ((correction as { moteur: string }).moteur !== matiere) return null;

  const examen = (correction as { exam_id: string | null }).exam_id
    ? await chargerExamenBrevet((correction as { exam_id: string }).exam_id, matiere)
    : null;
  const versionId = (correction as { bareme_version_id: string | null }).bareme_version_id;
  const bareme = versionId ? await chargerBaremeBrevet(versionId, matiere) : null;

  const [q, auto, reecr, dict, redac, redacC, qualite, docQ, valid, modifs] = await Promise.all([
    db.from('correction_questions').select('*').eq('correction_id', correctionId),
    db.from('correction_automatismes').select('*').eq('correction_id', correctionId),
    db.from('correction_reecriture_formes').select('*').eq('correction_id', correctionId),
    db.from('correction_dictee_erreurs').select('*').eq('correction_id', correctionId).order('rang'),
    db.from('correction_redaction').select('*').eq('correction_id', correctionId).maybeSingle(),
    db.from('correction_redaction_criteres').select('*').eq('correction_id', correctionId),
    db.from('correction_qualite_redaction').select('*').eq('correction_id', correctionId),
    db.from('correction_document_qualite').select('*').eq('correction_id', correctionId).maybeSingle(),
    db.from('relectures_humaines').select('*').eq('correction_id', correctionId).order('cree_le'),
    db
      .from('correction_modifications_humaines')
      .select('*')
      .eq('correction_id', correctionId)
      .order('cree_le', { ascending: false }),
  ]);

  return {
    correction: correction as Record<string, unknown>,
    examen,
    bareme,
    questions: (q.data ?? []) as Record<string, unknown>[],
    automatismes: (auto.data ?? []) as Record<string, unknown>[],
    reecriture: (reecr.data ?? []) as Record<string, unknown>[],
    dictee: (dict.data ?? []) as Record<string, unknown>[],
    redaction: (redac.data as Record<string, unknown>) ?? null,
    redactionCriteres: (redacC.data ?? []) as Record<string, unknown>[],
    qualiteRedaction: (qualite.data ?? []) as Record<string, unknown>[],
    documentQualite: (docQ.data as Record<string, unknown>) ?? null,
    validations: (valid.data ?? []) as Record<string, unknown>[],
    modifications: (modifs.data ?? []) as Record<string, unknown>[],
  };
}

export async function listerCopiesBrevet(
  matiere: MatiereBrevet,
  filtres: { examId?: string; aVerifier?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const db = pipelineDb();
  let req = db
    .from('corrections')
    .select(
      'id, exam_id, status, score_raw, score_validated, max_score, human_review_required, ' +
        'student_email, created_at, updated_at, est_etalon, processing_error',
    )
    .eq('moteur', matiere)
    .order('created_at', { ascending: false })
    .limit(300);
  if (filtres.examId) req = req.eq('exam_id', filtres.examId);
  if (filtres.aVerifier) req = req.eq('human_review_required', true);

  const { data, error } = await req;
  if (error) throw new Error(`Lecture des copies : ${error.message}`);
  return (data ?? []) as unknown as Record<string, unknown>[];
}
