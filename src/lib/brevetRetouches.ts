/**
 * Retouches humaines d'une correction de brevet.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Le principe : une décision humaine gagne toujours sur l'IA, mais elle ne
 * remplace jamais silencieusement ce que l'IA avait proposé. Chaque retouche
 * conserve la valeur initiale, la nouvelle valeur, le correcteur, la date, le
 * motif, le commentaire et l'impact sur la note — et la table qui les porte
 * refuse toute modification ou suppression a posteriori (trigger append-only).
 *
 * La note, elle, reste calculée par la base : `points_humain` est écrit dans
 * la ligne de détail, et le trigger `correction_recalcule_note` recalcule
 * `score_validated` comme la somme de `coalesce(points_humain, points)`. Ce
 * module ne pose jamais un total à la main.
 */
import { pipelineDb } from '@/lib/pipeline';
import { arrondi2, retoucheAcceptable, type MatiereBrevet } from '@/lib/brevetNoyau';

export type CibleRetouche =
  | 'question'
  | 'automatisme'
  | 'reecriture'
  | 'dictee'
  | 'redaction_critere'
  | 'qualite_redaction'
  | 'note_globale';

/** Table et colonnes de détail visées par chaque type de cible. */
const TABLES: Record<
  Exclude<CibleRetouche, 'note_globale' | 'dictee'>,
  { table: string; cle: string; colonneScore: string; colonneMax: string; colonneHumaine: string }
> = {
  question: {
    table: 'correction_questions',
    cle: 'question_key',
    colonneScore: 'points',
    colonneMax: 'max_points',
    colonneHumaine: 'points_humain',
  },
  automatisme: {
    table: 'correction_automatismes',
    cle: 'item_key',
    colonneScore: 'points',
    colonneMax: 'max_points',
    colonneHumaine: 'points_humain',
  },
  reecriture: {
    table: 'correction_reecriture_formes',
    cle: 'cle',
    colonneScore: 'points',
    colonneMax: 'max_points',
    colonneHumaine: 'points_humain',
  },
  redaction_critere: {
    table: 'correction_redaction_criteres',
    cle: 'code',
    colonneScore: 'score',
    colonneMax: 'max_points',
    colonneHumaine: 'points_humain',
  },
  qualite_redaction: {
    table: 'correction_qualite_redaction',
    cle: 'code',
    colonneScore: 'score',
    colonneMax: 'max_points',
    colonneHumaine: 'score',
  },
};

export type ResultatRetouche = {
  ok: boolean;
  raison?: string;
  valeur_ia: number | null;
  valeur_humaine: number;
  note_avant: number | null;
  note_apres: number | null;
  impact: number;
};

/**
 * Applique une retouche humaine sur une unité de notation.
 *
 * Refus explicites, avant toute écriture :
 *   • une valeur hors des bornes [0 ; maximum] ;
 *   • un écart d'au moins un point sans justification écrite (§13).
 */
export async function retoucherScore(entree: {
  correctionId: string;
  matiere: MatiereBrevet;
  cibleType: CibleRetouche;
  cibleCle: string;
  valeurHumaine: number;
  correcteur: string;
  motif: string;
  commentaire?: string | null;
}): Promise<ResultatRetouche> {
  const db = pipelineDb();

  const { data: correction } = await db
    .from('corrections')
    .select('id, moteur, score_validated')
    .eq('id', entree.correctionId)
    .maybeSingle();
  if (!correction) throw new Error('Correction introuvable.');
  if ((correction as { moteur: string }).moteur !== entree.matiere) {
    throw new Error(
      `Cette copie relève du moteur « ${(correction as { moteur: string }).moteur } » : ` +
        `elle ne se retouche pas depuis l'écran de ${entree.matiere}.`,
    );
  }
  const noteAvant = (correction as { score_validated: number | null }).score_validated;

  if (entree.cibleType === 'note_globale' || entree.cibleType === 'dictee') {
    // La dictée et la note globale n'ont pas de ligne de détail retouchable :
    // la première se corrige erreur par erreur, la seconde ne se pose jamais à
    // la main. On refuse plutôt que d'écrire un total arbitraire.
    return {
      ok: false,
      raison:
        entree.cibleType === 'dictee'
          ? 'La dictée se retouche erreur par erreur (retenir ou écarter une faute), pas par un score global.'
          : 'La note globale ne se saisit pas : elle est la somme des unités de notation.',
      valeur_ia: null,
      valeur_humaine: entree.valeurHumaine,
      note_avant: noteAvant,
      note_apres: noteAvant,
      impact: 0,
    };
  }

  const cfg = TABLES[entree.cibleType];
  const { data: ligne } = await db
    .from(cfg.table)
    .select('*')
    .eq('correction_id', entree.correctionId)
    .eq(cfg.cle, entree.cibleCle)
    .maybeSingle();
  if (!ligne) throw new Error(`Aucune ligne « ${entree.cibleCle} » dans ${cfg.table}.`);

  const l = ligne as Record<string, number>;
  const valeurIa = Number(l[cfg.colonneScore]);
  const max = Number(l[cfg.colonneMax]);

  const controle = retoucheAcceptable({
    valeurIa,
    valeurHumaine: entree.valeurHumaine,
    max,
    motif: entree.motif,
  });
  if (!controle.ok) {
    return {
      ok: false,
      raison: controle.raison,
      valeur_ia: valeurIa,
      valeur_humaine: entree.valeurHumaine,
      note_avant: noteAvant,
      note_apres: noteAvant,
      impact: 0,
    };
  }

  const { error } = await db
    .from(cfg.table)
    .update({ [cfg.colonneHumaine]: entree.valeurHumaine, source_regle: 'human_override' })
    .eq('correction_id', entree.correctionId)
    .eq(cfg.cle, entree.cibleCle);
  if (error) {
    // `source_regle` n'existe que sur correction_questions : on retente sans.
    const { error: err2 } = await db
      .from(cfg.table)
      .update({ [cfg.colonneHumaine]: entree.valeurHumaine })
      .eq('correction_id', entree.correctionId)
      .eq(cfg.cle, entree.cibleCle);
    if (err2) throw new Error(`Retouche impossible : ${err2.message}`);
  }

  const { data: apres } = await db
    .from('corrections')
    .select('score_validated')
    .eq('id', entree.correctionId)
    .maybeSingle();
  const noteApres = (apres as { score_validated: number | null } | null)?.score_validated ?? noteAvant;
  const impact = arrondi2((noteApres ?? 0) - (noteAvant ?? 0));

  const { error: errHist } = await db.from('correction_modifications_humaines').insert({
    correction_id: entree.correctionId,
    cible_type: entree.cibleType,
    cible_cle: entree.cibleCle,
    valeur_ia: valeurIa,
    valeur_humaine: entree.valeurHumaine,
    max_points: max,
    correcteur: entree.correcteur,
    motif: entree.motif,
    commentaire: entree.commentaire ?? null,
    impact_note: impact,
    note_avant: noteAvant,
    note_apres: noteApres,
  });
  if (errHist) throw new Error(`Historique de la retouche : ${errHist.message}`);

  return {
    ok: true,
    valeur_ia: valeurIa,
    valeur_humaine: entree.valeurHumaine,
    note_avant: noteAvant,
    note_apres: noteApres,
    impact,
  };
}

/**
 * Retenir ou écarter une erreur de dictée.
 *
 * On ne modifie pas la pénalité : on note la décision humaine, et la note est
 * recalculée à partir des erreurs réellement retenues.
 */
export async function trancherErreurDictee(entree: {
  correctionId: string;
  rang: number;
  retenue: boolean;
  correcteur: string;
  motif: string;
}): Promise<{ ok: boolean; penalite_annulee: number }> {
  const db = pipelineDb();
  const { data: ligne } = await db
    .from('correction_dictee_erreurs')
    .select('*')
    .eq('correction_id', entree.correctionId)
    .eq('rang', entree.rang)
    .maybeSingle();
  if (!ligne) throw new Error('Erreur de dictée introuvable.');

  const e = ligne as { penalite_appliquee: number; penalite_prevue: number };
  const nouvelle = entree.retenue ? e.penalite_prevue : 0;
  const delta = arrondi2(e.penalite_appliquee - nouvelle);

  await db
    .from('correction_dictee_erreurs')
    .update({ retenue_par_humain: entree.retenue, penalite_appliquee: nouvelle })
    .eq('correction_id', entree.correctionId)
    .eq('rang', entree.rang);

  // La ligne agrégée `bloc_dictee` porte les points du bloc : on la met à jour
  // via `points_humain`, ce qui laisse la trace de ce que l'IA avait proposé.
  const { data: bloc } = await db
    .from('correction_questions')
    .select('points, points_humain, max_points')
    .eq('correction_id', entree.correctionId)
    .eq('question_key', 'bloc_dictee')
    .maybeSingle();
  if (bloc) {
    const b = bloc as { points: number; points_humain: number | null; max_points: number };
    const base = b.points_humain ?? b.points;
    const nouveau = Math.max(0, Math.min(b.max_points, arrondi2(base + delta)));
    await db
      .from('correction_questions')
      .update({ points_humain: nouveau, source_regle: 'human_override' })
      .eq('correction_id', entree.correctionId)
      .eq('question_key', 'bloc_dictee');

    await db.from('correction_modifications_humaines').insert({
      correction_id: entree.correctionId,
      cible_type: 'dictee',
      cible_cle: `erreur_${entree.rang}`,
      valeur_ia: base,
      valeur_humaine: nouveau,
      max_points: b.max_points,
      correcteur: entree.correcteur,
      motif: entree.motif,
      commentaire: entree.retenue ? 'Erreur retenue.' : 'Erreur écartée.',
      impact_note: delta,
    });
  }

  return { ok: true, penalite_annulee: delta };
}

/** Clôt un motif de validation humaine, avec sa décision. */
export async function traiterValidation(entree: {
  correctionId: string;
  validationId: string;
  decision: 'traitee' | 'rejetee';
  correcteur: string;
  commentaire: string;
}): Promise<void> {
  const db = pipelineDb();
  const { error } = await db
    .from('relectures_humaines')
    .update({
      statut: entree.decision,
      traite_par: entree.correcteur,
      traite_le: new Date().toISOString(),
      decision: { commentaire: entree.commentaire },
    })
    .eq('id', entree.validationId)
    .eq('correction_id', entree.correctionId);
  if (error) throw new Error(`Traitement de la validation : ${error.message}`);
}

/**
 * Valide définitivement une correction.
 *
 * Refusée tant qu'un motif BLOQUANT reste ouvert : c'est la différence entre
 * une alerte informative, une validation recommandée et une validation
 * obligatoire.
 */
export async function validerCorrectionBrevet(entree: {
  correctionId: string;
  matiere: MatiereBrevet;
  correcteur: string;
}): Promise<{ ok: boolean; raison?: string; bloquants: number }> {
  const db = pipelineDb();
  const { data: ouvertes } = await db
    .from('relectures_humaines')
    .select('id, degre')
    .eq('correction_id', entree.correctionId)
    .eq('statut', 'ouverte');

  const bloquants = ((ouvertes ?? []) as { degre: string }[]).filter(
    (r) => r.degre === 'bloquante',
  ).length;
  if (bloquants > 0) {
    return {
      ok: false,
      raison: `${bloquants} validation(s) bloquante(s) restent ouvertes : traite-les avant de valider la note.`,
      bloquants,
    };
  }

  const { error } = await db
    .from('corrections')
    .update({
      validee_par: entree.correcteur,
      validee_le: new Date().toISOString(),
      human_review_required: false,
      status: 'corrected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', entree.correctionId)
    .eq('moteur', entree.matiere);
  if (error) throw new Error(`Validation : ${error.message}`);
  return { ok: true, bloquants: 0 };
}
