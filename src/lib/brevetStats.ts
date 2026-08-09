/**
 * Statistiques et calibration du BREVET, par matière.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Deux matières, deux jeux de statistiques : rien n'est agrégé entre le
 * français et les mathématiques, et rien n'est agrégé avec le baccalauréat.
 * Les échelles ne sont pas les mêmes (100 points ramenés sur 20 d'un côté,
 * 20 points de l'autre) : les mélanger produirait des moyennes fausses.
 */
import { pipelineDb } from '@/lib/pipeline';
import {
  arrondi2,
  couvertureCorpus,
  indicateursCalibration,
  pretPourLaProduction,
  type IndicateursCalibration,
  type MatiereBrevet,
} from '@/lib/brevetNoyau';

export type StatistiquesBrevet = {
  matiere: MatiereBrevet;
  copies: {
    total: number;
    corrigees: number;
    en_validation: number;
    en_echec: number;
    etalons: number;
  };
  notes: {
    moyenne_sur_20: number | null;
    mediane_sur_20: number | null;
    minimum: number | null;
    maximum: number | null;
    /** Répartition par tranche de 2 points, pour l'histogramme. */
    distribution: { tranche: string; copies: number }[];
    sous_le_seuil: number;
  };
  parties: { code: string; libelle: string; moyenne: number | null; max: number; taux: number | null }[];
  erreurs_frequentes: { code: string; libelle: string | null; occurrences: number; effet_moyen: number }[];
  validations: { code_motif: string; degre: string; ouvertes: number; traitees: number }[];
  retouches: {
    total: number;
    impact_moyen: number | null;
    par_cible: { cible_type: string; nombre: number; impact_moyen: number }[];
  };
  examens: { id: string; titre: string; statut: string; copies: number }[];
};

function mediane(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return arrondi2(t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2);
}

function moyenne(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  return arrondi2(valeurs.reduce((a, b) => a + b, 0) / valeurs.length);
}

const TRANCHES = [
  [0, 2], [2, 4], [4, 6], [6, 8], [8, 10],
  [10, 12], [12, 14], [14, 16], [16, 18], [18, 20.01],
];

/** Convertit une note brute à l'échelle de son barème vers /20. */
function sur20(score: number | null, max: number | null): number | null {
  if (score === null || !max) return null;
  return arrondi2(Math.max(0, Math.min(20, (score / max) * 20)));
}

export async function statistiquesBrevet(matiere: MatiereBrevet): Promise<StatistiquesBrevet> {
  const db = pipelineDb();

  const [corrRes, examsRes, qRes, validRes, modifsRes, taxoRes] = await Promise.all([
    db
      .from('corrections')
      .select('id, exam_id, status, score_validated, score_raw, max_score, human_review_required, est_etalon')
      .eq('moteur', matiere),
    db.from('exams').select('id, titre, statut').eq('examen', 'DNB').eq('matiere', matiere),
    db.from('correction_questions').select('correction_id, bloc, partie, points, points_humain, max_points, erreurs'),
    db.from('relectures_humaines').select('correction_id, code_motif, degre, statut'),
    db.from('correction_modifications_humaines').select('correction_id, cible_type, impact_note'),
    db.from('taxonomie_erreurs').select('code, libelle_eleve, description').eq('matiere', matiere),
  ]);
  if (corrRes.error) throw new Error(`Lecture des corrections : ${corrRes.error.message}`);

  const corrections = (corrRes.data ?? []) as {
    id: string;
    exam_id: string | null;
    status: string;
    score_validated: number | null;
    max_score: number | null;
    human_review_required: boolean | null;
    est_etalon: boolean | null;
  }[];
  const ids = new Set(corrections.map((c) => c.id));

  const notes = corrections
    .filter((c) => c.status === 'corrected' || c.status === 'corrected_review')
    .map((c) => sur20(c.score_validated, c.max_score))
    .filter((n): n is number => n !== null);

  const distribution = TRANCHES.map(([a, b]) => ({
    tranche: `${a}–${b === 20.01 ? 20 : b}`,
    copies: notes.filter((n) => n >= a && n < b).length,
  }));

  // --- Moyennes par partie ------------------------------------------
  const questions = ((qRes.data ?? []) as {
    correction_id: string;
    bloc: string | null;
    partie: string | null;
    points: number;
    points_humain: number | null;
    max_points: number;
    erreurs: { code: string }[] | null;
  }[]).filter((q) => ids.has(q.correction_id));

  const parBloc = new Map<string, { obtenus: number[]; max: number }>();
  for (const q of questions) {
    const cle = q.bloc ?? q.partie ?? 'autre';
    const entree = parBloc.get(cle) ?? { obtenus: [], max: 0 };
    entree.obtenus.push(q.points_humain ?? q.points);
    entree.max += q.max_points;
    parBloc.set(cle, entree);
  }

  const LIBELLES: Record<string, string> = {
    texte: 'Travail sur le texte',
    dictee: 'Dictée',
    redaction: 'Rédaction',
    automatismes: 'Automatismes',
    raisonnement: 'Raisonnement et résolution de problèmes',
    qualite_redaction: 'Qualité de la rédaction',
  };

  const nbCopies = new Set(questions.map((q) => q.correction_id)).size || 1;
  const parties = [...parBloc.entries()].map(([code, v]) => {
    const total = v.obtenus.reduce((a, b) => a + b, 0);
    const maxParCopie = arrondi2(v.max / nbCopies);
    return {
      code,
      libelle: LIBELLES[code] ?? code,
      moyenne: arrondi2(total / nbCopies),
      max: maxParCopie,
      taux: maxParCopie > 0 ? arrondi2(total / v.max) : null,
    };
  });

  // --- Erreurs les plus fréquentes ----------------------------------
  const libelles = new Map(
    ((taxoRes.data ?? []) as { code: string; libelle_eleve: string | null }[]).map((t) => [
      t.code,
      t.libelle_eleve,
    ]),
  );
  const compte = new Map<string, { n: number; effet: number }>();
  for (const q of questions) {
    const perte = arrondi2(q.max_points - (q.points_humain ?? q.points));
    for (const e of q.erreurs ?? []) {
      const c = compte.get(e.code) ?? { n: 0, effet: 0 };
      c.n += 1;
      c.effet += perte;
      compte.set(e.code, c);
    }
  }
  const erreurs = [...compte.entries()]
    .map(([code, v]) => ({
      code,
      libelle: libelles.get(code) ?? null,
      occurrences: v.n,
      effet_moyen: arrondi2(v.effet / v.n),
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 15);

  // --- Validations ---------------------------------------------------
  const validations = ((validRes.data ?? []) as {
    correction_id: string;
    code_motif: string;
    degre: string;
    statut: string;
  }[]).filter((v) => ids.has(v.correction_id));

  const parMotif = new Map<string, { degre: string; ouvertes: number; traitees: number }>();
  for (const v of validations) {
    const e = parMotif.get(v.code_motif) ?? { degre: v.degre, ouvertes: 0, traitees: 0 };
    if (v.statut === 'ouverte') e.ouvertes += 1;
    else e.traitees += 1;
    parMotif.set(v.code_motif, e);
  }

  // --- Retouches humaines --------------------------------------------
  const modifs = ((modifsRes.data ?? []) as {
    correction_id: string;
    cible_type: string;
    impact_note: number;
  }[]).filter((m) => ids.has(m.correction_id));

  const parCible = new Map<string, number[]>();
  for (const m of modifs) {
    const liste = parCible.get(m.cible_type) ?? [];
    liste.push(m.impact_note);
    parCible.set(m.cible_type, liste);
  }

  const examens = ((examsRes.data ?? []) as { id: string; titre: string; statut: string }[]).map((e) => ({
    ...e,
    copies: corrections.filter((c) => c.exam_id === e.id).length,
  }));

  return {
    matiere,
    copies: {
      total: corrections.length,
      corrigees: corrections.filter((c) => c.status === 'corrected' || c.status === 'corrected_review').length,
      en_validation: corrections.filter((c) => c.human_review_required).length,
      en_echec: corrections.filter((c) => c.status?.endsWith('_failed')).length,
      etalons: corrections.filter((c) => c.est_etalon).length,
    },
    notes: {
      moyenne_sur_20: moyenne(notes),
      mediane_sur_20: mediane(notes),
      minimum: notes.length ? arrondi2(Math.min(...notes)) : null,
      maximum: notes.length ? arrondi2(Math.max(...notes)) : null,
      distribution,
      sous_le_seuil: notes.filter((n) => n < 10).length,
    },
    parties: parties.sort((a, b) => a.code.localeCompare(b.code)),
    erreurs_frequentes: erreurs,
    validations: [...parMotif.entries()].map(([code_motif, v]) => ({ code_motif, ...v })),
    retouches: {
      total: modifs.length,
      impact_moyen: moyenne(modifs.map((m) => Math.abs(m.impact_note))),
      par_cible: [...parCible.entries()].map(([cible_type, v]) => ({
        cible_type,
        nombre: v.length,
        impact_moyen: moyenne(v.map(Math.abs)) ?? 0,
      })),
    },
    examens,
  };
}

/* ------------------------------------------------------------------ */
/*  Calibration                                                        */
/* ------------------------------------------------------------------ */

export type CalibrationBrevet = {
  matiere: MatiereBrevet;
  copies: {
    id: string;
    libelle: string;
    niveau_cible: string | null;
    statut: string;
    note_ia: number | null;
    note_humaine: number | null;
    ecart: number | null;
    correcteurs: number;
  }[];
  couverture: ReturnType<typeof couvertureCorpus>;
  indicateurs: IndicateursCalibration;
  pret: ReturnType<typeof pretPourLaProduction>;
};

/**
 * Corpus de calibration d'un examen : ce que l'IA a mis, ce que les
 * professeurs ont mis, et les écarts.
 *
 * Le tableau ne dit jamais que le système est prêt : `pretPourLaProduction()`
 * ne renvoie `true` que lorsque le corpus existe vraiment et que l'écart moyen
 * est tenu. Sans calibration humaine, la réponse est non.
 */
export async function calibrationBrevet(
  examId: string,
  matiere: MatiereBrevet,
): Promise<CalibrationBrevet> {
  const db = pipelineDb();

  const { data: etalons } = await db
    .from('etalon_copies')
    .select('*')
    .eq('exam_id', examId)
    .order('cree_le');
  const lignes = (etalons ?? []) as {
    id: string;
    libelle: string;
    niveau_cible: string | null;
    statut: string;
  }[];
  const ids = lignes.map((e) => e.id);

  const [humainesRes, iaRes, detailRes] = ids.length
    ? await Promise.all([
        db.from('etalon_corrections_humaines').select('*').in('etalon_copie_id', ids),
        db.from('etalon_corrections_ia').select('*').in('etalon_copie_id', ids),
        db.from('etalon_correction_humaine_questions').select('*'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const humaines = (humainesRes.data ?? []) as {
    id: string;
    etalon_copie_id: string;
    note_totale: number;
  }[];
  const ia = (iaRes.data ?? []) as {
    etalon_copie_id: string;
    note_brute: number | null;
    correction_id: string | null;
  }[];
  const detailHumain = (detailRes.data ?? []) as {
    correction_humaine_id: string;
    question_key: string;
    points: number;
  }[];

  const correctionIds = ia.map((x) => x.correction_id).filter((x): x is string => Boolean(x));
  const [questionsRes, validRes, modifsRes] = correctionIds.length
    ? await Promise.all([
        db.from('correction_questions').select('*').in('correction_id', correctionIds),
        db.from('relectures_humaines').select('*').in('correction_id', correctionIds),
        db.from('correction_modifications_humaines').select('*').in('correction_id', correctionIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const questionsIa = (questionsRes.data ?? []) as {
    correction_id: string;
    question_key: string;
    bloc: string | null;
    points: number;
    points_humain: number | null;
    max_points: number;
    erreurs: { code: string }[] | null;
  }[];

  const copies = lignes.map((e) => {
    const h = humaines.filter((x) => x.etalon_copie_id === e.id);
    const noteHumaine = h.length ? moyenne(h.map((x) => x.note_totale)) : null;
    const noteIa = ia.find((x) => x.etalon_copie_id === e.id)?.note_brute ?? null;
    return {
      id: e.id,
      libelle: e.libelle,
      niveau_cible: e.niveau_cible,
      statut: e.statut,
      note_ia: noteIa,
      note_humaine: noteHumaine,
      ecart: noteIa !== null && noteHumaine !== null ? arrondi2(noteIa - noteHumaine) : null,
      correcteurs: h.length,
    };
  });

  // Écarts question par question, faux positifs et faux négatifs.
  const parCopie = lignes.map((e) => {
    const correctionId = ia.find((x) => x.etalon_copie_id === e.id)?.correction_id ?? null;
    const mesQuestions = questionsIa.filter((q) => q.correction_id === correctionId);
    const mesHumaines = humaines.filter((x) => x.etalon_copie_id === e.id);
    const detail = detailHumain.filter((d) => mesHumaines.some((x) => x.id === d.correction_humaine_id));

    const ecarts = mesQuestions.map((q) => {
      const valeurs = detail.filter((d) => d.question_key === q.question_key).map((d) => d.points);
      const humain = valeurs.length ? (moyenne(valeurs) as number) : null;
      const scoreIa = q.points_humain ?? q.points;
      const aDesErreursIa = (q.erreurs ?? []).length > 0;
      return {
        cible: q.question_key,
        ia: scoreIa,
        humain,
        ecart: humain !== null ? arrondi2(scoreIa - humain) : null,
        // L'IA a retiré des points là où l'humain n'en a pas retiré.
        faux_positif: humain !== null && scoreIa < humain - 0.001 && aDesErreursIa,
        // L'humain a retiré des points que l'IA n'avait pas vus.
        faux_negatif: humain !== null && scoreIa > humain + 0.001,
      };
    });

    return {
      ecarts,
      ecartsParPartie: mesQuestions
        .map((q) => {
          const valeurs = detail.filter((d) => d.question_key === q.question_key).map((d) => d.points);
          const humain = valeurs.length ? (moyenne(valeurs) as number) : null;
          return humain === null
            ? null
            : { partie: q.bloc ?? 'autre', ecart: (q.points_humain ?? q.points) - humain };
        })
        .filter((x): x is { partie: string; ecart: number } => x !== null),
      ecartsParCategorie: mesQuestions.flatMap((q) => {
        const valeurs = detail.filter((d) => d.question_key === q.question_key).map((d) => d.points);
        const humain = valeurs.length ? (moyenne(valeurs) as number) : null;
        if (humain === null) return [];
        return (q.erreurs ?? []).map((err) => ({
          categorie: err.code,
          ecart: (q.points_humain ?? q.points) - humain,
        }));
      }),
      alertes: ((validRes.data ?? []) as { correction_id: string; statut: string }[])
        .filter((v) => v.correction_id === correctionId)
        .map((v) => ({ pertinente: v.statut === 'traitee' })),
      doublesPenalisations: 0,
      questions: mesQuestions.length,
      modificationsHumaines: ((modifsRes.data ?? []) as { correction_id: string }[]).filter(
        (m) => m.correction_id === correctionId,
      ).length,
    };
  });

  const indicateurs = indicateursCalibration({ copies: parCopie });
  const couverture = couvertureCorpus(lignes.map((e) => e.niveau_cible));

  return {
    matiere,
    copies,
    couverture,
    indicateurs,
    pret: pretPourLaProduction({
      copiesCalibrees: copies.filter((c) => c.note_humaine !== null && c.note_ia !== null).length,
      niveauxCouverts: couverture.couverts,
      ecartAbsoluMoyen: indicateurs.ecart_absolu_moyen,
    }),
  };
}
