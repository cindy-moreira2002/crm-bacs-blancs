/**
 * CORRECTION DES EPREUVES REDIGEES (HGGSP session 2026).
 *
 * Troisieme moteur du pipeline, a cote de :
 *   - correct-french-copy  : grille generique de competences ;
 *   - correct-copy-bareme  : bareme propre au sujet, question par question.
 *
 * Celui-ci corrige une matiere REDIGEE avec une grille analytique par
 * criteres : la note est la somme des reussites observees, plafonnee au
 * besoin par des regles d'impact explicites, jamais obtenue en retranchant
 * des erreurs a partir de 20.
 *
 * Il ne decide rien lui-meme : toutes les regles vivent dans
 * ../_shared/hggsp-noyau.ts, teste hors ligne (npm run test:hggsp).
 * Ici, on ne fait que lire la base, appeler le modele, passer sa reponse au
 * noyau, et ecrire le resultat.
 *
 * Deploiement :
 *   npx --yes supabase@latest functions deploy correct-copy-redigee \
 *     --project-ref xgdaibekjmtffvkwvcge --no-verify-jwt
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  GRILLES,
  TAXONOMIE,
  construireResultatExercice,
  consigneSysteme,
  schemaSortie,
  type EntreeTaxonomie,
  type FormatExamen,
  type Grille,
  type ReponseIA,
  type TypeExercice,
} from '../_shared/hggsp-noyau.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-pipeline-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function getSupabaseSecretKey(): string {
  const direct =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (direct) return direct;

  const rawMap = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (rawMap) {
    const keys = JSON.parse(rawMap) as Record<string, string>;
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (first) return first;
  }
  throw new Error('Aucune clé secrète Supabase disponible dans la fonction.');
}

function assertInternalSecret(req: Request): Response | null {
  const expected = Deno.env.get('PIPELINE_INTERNAL_SECRET');
  if (!expected) {
    return jsonResponse({ error: 'PIPELINE_INTERNAL_SECRET n’est pas configuré.' }, 500);
  }
  if (req.headers.get('x-pipeline-secret') !== expected) {
    return jsonResponse({ error: 'Accès refusé.' }, 401);
  }
  return null;
}

async function callAnthropic(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Erreur Claude ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload as Record<string, unknown>;
}

function extractStructuredText(payload: Record<string, unknown>): string {
  const content = payload.content;
  if (!Array.isArray(content)) throw new Error('Réponse Claude sans bloc content.');
  const block = content.find(
    (item) =>
      typeof item === 'object' && item !== null && (item as Record<string, unknown>).type === 'text',
  ) as Record<string, unknown> | undefined;
  if (!block || typeof block.text !== 'string') {
    throw new Error('Réponse Claude sans bloc texte exploitable.');
  }
  return block.text;
}

/* ------------------------------------------------------------------ */
/*  Lecture de la grille en base                                      */
/*                                                                    */
/*  La base fait foi : un professeur peut avoir corrige un descripteur */
/*  ou une regle d'impact. Le noyau ne sert de secours que si la       */
/*  grille n'a pas encore ete installee.                              */
/* ------------------------------------------------------------------ */

type LigneGrille = {
  id: string;
  matiere: string;
  exercise_type: string;
  version: string;
  libelle: string;
  principe: string;
  system_prompt: string;
  max_analytique: number;
  max_officiel: number;
  statut: string;
  garde_fous: string[];
};

async function chargerGrille(
  supabase: ReturnType<typeof createClient>,
  grilleId: string | null,
  exerciceType: TypeExercice,
): Promise<{ grille: Grille; statut: string; verrouillee: boolean; consigne: string }> {
  const secours = GRILLES[exerciceType];

  const requete = supabase.from('grilles_redigees').select('*');
  const { data } = grilleId
    ? await requete.eq('id', grilleId).limit(1)
    : await requete
        .eq('exercise_type', exerciceType)
        .in('statut', ['in_use', 'locked', 'validated', 'calibrating'])
        .order('version', { ascending: false })
        .limit(1);

  const ligne = (data ?? [])[0] as LigneGrille | undefined;
  if (!ligne) {
    return {
      grille: secours,
      statut: 'absente_en_base',
      verrouillee: false,
      consigne: consigneSysteme(secours),
    };
  }

  const { data: criteres } = await supabase
    .from('grille_criteres')
    .select('id, code, libelle, evaluer, max_points, ordre')
    .eq('grille_id', ligne.id)
    .order('ordre');

  const idsCriteres = (criteres ?? []).map((c) => c.id as string);
  const { data: descripteurs } = idsCriteres.length
    ? await supabase
        .from('grille_descripteurs')
        .select('critere_id, points, niveau, description')
        .in('critere_id', idsCriteres)
        .order('points')
    : { data: [] };

  const grille: Grille = {
    id: ligne.id,
    matiere: 'hggsp',
    exercise_type: exerciceType,
    version: ligne.version,
    libelle: ligne.libelle,
    principe: ligne.principe,
    max_analytique: Number(ligne.max_analytique),
    max_officiel: Number(ligne.max_officiel),
    garde_fous: Array.isArray(ligne.garde_fous) ? ligne.garde_fous : secours.garde_fous,
    criteres: (criteres ?? []).map((c) => ({
      code: c.code as string,
      libelle: c.libelle as string,
      evaluer: Array.isArray(c.evaluer) ? (c.evaluer as string[]) : [],
      max_points: Number(c.max_points),
      ordre: Number(c.ordre),
      paliers: (descripteurs ?? [])
        .filter((d) => d.critere_id === c.id)
        .map((d) => ({
          points: Number(d.points),
          niveau: d.niveau as Grille['criteres'][number]['paliers'][number]['niveau'],
          description: d.description as string,
        })),
    })),
  };

  // Une grille sans critere en base serait un demi-chargement : on refuse
  // plutot que de corriger avec un bareme vide.
  if (!grille.criteres.length) {
    throw new Error(`La grille ${ligne.id} n'a aucun critère en base.`);
  }

  return {
    grille,
    statut: ligne.statut,
    verrouillee: ['locked', 'in_use', 'archived'].includes(ligne.statut),
    consigne: ligne.system_prompt?.trim().length > 50 ? ligne.system_prompt : consigneSysteme(grille),
  };
}

async function chargerTaxonomie(
  supabase: ReturnType<typeof createClient>,
): Promise<EntreeTaxonomie[]> {
  const { data } = await supabase
    .from('taxonomie_redigee')
    .select('*')
    .eq('matiere', 'hggsp')
    .eq('version', '2.0');

  if (!data?.length) return TAXONOMIE;

  return data.map((e) => ({
    code: e.code as string,
    libelle: e.libelle as string,
    portee: e.portee as EntreeTaxonomie['portee'],
    description: e.description as string,
    critere_principal: (e.critere_principal ?? {}) as EntreeTaxonomie['critere_principal'],
    criteres_secondaires: (e.criteres_secondaires ?? {}) as EntreeTaxonomie['criteres_secondaires'],
    gravite: e.gravite as EntreeTaxonomie['gravite'],
    type_impact: e.type_impact as EntreeTaxonomie['type_impact'],
    impact_min: e.impact_min === null ? null : Number(e.impact_min),
    impact_max: e.impact_max === null ? null : Number(e.impact_max),
    plafond_score: e.plafond_score === null ? null : Number(e.plafond_score),
    plafond_niveau: (e.plafond_niveau ?? null) as EntreeTaxonomie['plafond_niveau'],
    conditions: (e.conditions ?? '') as string,
    regle_non_double_sanction: (e.regle_non_double_sanction ?? '') as string,
    message_pedagogique: (e.message_pedagogique ?? '') as string,
    relecture_humaine: e.relecture_humaine === true,
  }));
}

/** Texte brut de la copie : c'est lui qui sert à vérifier chaque citation. */
function texteDeLaTranscription(transcription: Record<string, unknown>): string {
  const pages = (transcription.pages ?? []) as { text?: string }[];
  const morceaux = Array.isArray(pages) ? pages.map((p) => p?.text ?? '') : [];
  if (typeof transcription.full_text === 'string') morceaux.push(transcription.full_text);
  return morceaux.filter(Boolean).join('\n');
}

/** Nombre de documents du sujet : c'est ce qui déclenche les règles du §7. */
function nombreDocuments(card: Record<string, unknown>): number {
  if (typeof card.nombre_documents === 'number') return card.nombre_documents;
  if (Array.isArray(card.documents)) return card.documents.length;
  return 1;
}

/**
 * Format de l'épreuve.
 *
 * Un entraînement à un seul exercice n'est pas un bac blanc complet : la note
 * finale ne se calcule pas pareil. On lit, dans l'ordre : la copie, l'examen
 * rattaché, puis on retombe sur l'entraînement correspondant à l'exercice.
 */
function formatExamen(
  correction: Record<string, unknown>,
  exam: Record<string, unknown> | null,
  exercice: TypeExercice,
): FormatExamen {
  const candidats = [correction.exam_format, exam?.exam_format];
  for (const c of candidats) {
    if (c === 'full_exam' || c === 'dissertation_only' || c === 'document_study_only') return c;
  }
  return exercice === 'hggsp_dissertation' ? 'dissertation_only' : 'document_study_only';
}

/* ------------------------------------------------------------------ */
/*  Corps de la fonction                                              */
/* ------------------------------------------------------------------ */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405);

  const denied = assertInternalSecret(req);
  if (denied) return denied;

  let correctionId = '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, getSupabaseSecretKey(), {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();
    correctionId = String(body.correction_id ?? '');
    if (!correctionId) return jsonResponse({ error: 'correction_id est obligatoire.' }, 400);

    const { data: correction, error: errCorrection } = await supabase
      .from('corrections')
      .select('*')
      .eq('id', correctionId)
      .single();
    if (errCorrection || !correction) {
      return jsonResponse({ error: 'Correction introuvable.', details: errCorrection }, 404);
    }

    const exercice = String(correction.exercise_type) as TypeExercice;
    if (!GRILLES[exercice]) {
      return jsonResponse(
        { error: `Le moteur rédigé ne connaît pas l'exercice « ${exercice} ».` },
        400,
      );
    }

    const { data: transcriptionRow, error: errTranscription } = await supabase
      .from('copy_transcriptions')
      .select('*')
      .eq('correction_id', correctionId)
      .single();
    if (errTranscription || !transcriptionRow) {
      return jsonResponse(
        { error: 'Aucune transcription disponible. Lance d’abord transcribe-french-copy.' },
        409,
      );
    }

    const [{ grille, statut, verrouillee, consigne }, taxonomie, sujetResult, etalonsResult] =
      await Promise.all([
        chargerGrille(supabase, (correction.grille_id as string) ?? null, exercice),
        chargerTaxonomie(supabase),
        supabase.from('subject_cards').select('*').eq('id', correction.subject_id).single(),
        supabase
          .from('benchmark_cards')
          .select('id, score, card_json, validation_status')
          .eq('subject_id', correction.subject_id)
          .eq('exercise_type', exercice)
          .in('validation_status', ['validated', 'candidate']),
      ]);

    if (sujetResult.error || !sujetResult.data) {
      throw new Error(`Fiche sujet introuvable: ${sujetResult.error?.message ?? ''}`);
    }

    // Seuls les etalons exprimes dans la grille v2 servent d'ancrage : ceux de
    // l'ancienne grille parlent de criteres qui n'existent plus.
    const etalons = (etalonsResult.data ?? []).filter(
      (e) => (e.card_json as Record<string, unknown>)?.rubric_version === '2.0',
    );
    if (etalons.length < 3) {
      throw new Error(
        `Moins de trois copies étalons v2 sont reliées au sujet ${correction.subject_id} (${etalons.length}). ` +
          'Lance scripts/apply-hggsp.mjs --apply.',
      );
    }

    let exam: Record<string, unknown> | null = null;
    if (correction.exam_id) {
      const { data } = await supabase
        .from('exams')
        .select('id, code, exam_format, statut')
        .eq('id', correction.exam_id)
        .single();
      exam = data ?? null;
    }
    const format = formatExamen(correction, exam, exercice);
    const documents = nombreDocuments(sujetResult.data.card_json ?? {});

    await supabase
      .from('corrections')
      .update({
        status: 'correcting',
        processing_error: null,
        moteur: 'criteres_rediges',
        grille_id: grille.id,
        exam_format: format,
        updated_at: new Date().toISOString(),
      })
      .eq('id', correctionId);

    const transcription = transcriptionRow.transcription_json as Record<string, unknown>;
    const texte = texteDeLaTranscription(transcription);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY n’est pas configuré.');
    const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5';

    // La consigne systeme decrit la grille REELLEMENT appliquee. Les regles a
    // deux documents ne sont ajoutees que si le sujet en comporte deux.
    const consigneFinale =
      documents > 1
        ? consigneSysteme(grille, { deuxDocuments: true, taxonomie })
        : consigne;

    // Le dossier stable ne REPETE pas la grille ni la taxonomie : elles sont
    // deja dans la consigne systeme, mot pour mot. Les envoyer deux fois
    // doublait l'entree et faisait depasser le temps de calcul alloue a la
    // fonction (WORKER_RESOURCE_LIMIT).
    const dossierStable = {
      grille: {
        id: grille.id,
        version: grille.version,
        exercice: grille.exercise_type,
        max_analytique: grille.max_analytique,
        max_officiel: grille.max_officiel,
        criteres: grille.criteres.map((c) => ({ code: c.code, max_points: c.max_points })),
        garde_fous: grille.garde_fous,
      },
      sujet: sujetResult.data.card_json,
      nombre_documents: documents,
      format_examen: format,
      etalons: etalons.map((e) => {
        const carte = (e.card_json ?? {}) as Record<string, unknown>;
        return {
          id: e.id,
          note_analytique: e.score,
          niveau: carte.niveau,
          criterion_scores: carte.criterion_scores,
          description: carte.description,
          avertissement: carte.warning,
        };
      }),
    };

    const anthropicPayload = await callAnthropic(apiKey, {
      model,
      // 8 000 suffisent largement pour 5 ou 6 criteres et leurs preuves. Au-dela,
      // la fonction depasse son temps de calcul avant d'avoir recu la reponse.
      max_tokens: 8000,
      system: consigneFinale,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'DOSSIER STABLE DE CORRECTION\n' + JSON.stringify(dossierStable),
              cache_control: { type: 'ephemeral', ttl: '1h' },
            },
            {
              type: 'text',
              text:
                'TRANSCRIPTION DE LA COPIE À ÉVALUER\n' +
                JSON.stringify(transcription) +
                '\n\nCorrige cette copie critère par critère, en citant la copie mot à mot, ' +
                'et en signalant les erreurs types avec leur code. Indique dans benchmark_comparison ' +
                "l'étalon dont cette copie est la plus proche.\n" +
                'Sois DENSE : chaque justification tient en deux à quatre phrases, chaque citation ' +
                'est courte (une ligne), deux preuves au maximum par critère. Aucune redite.',
            },
          ],
        },
      ],
      // La reflexion adaptative est ACTIVE PAR DEFAUT sur Sonnet 5 : elle
      // consommait les 8 000 jetons de sortie avant d'ecrire la correction
      // (stop_reason=max_tokens, thinking_tokens=4822). La grille est
      // explicite, le correcteur n'a pas a deliberer longuement : on coupe la
      // reflexion et on regle l'effort, ce qui tient dans le temps de calcul
      // alloue a une Edge Function.
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: schemaSortie() },
      },
    });

    // Une reponse coupee doit se voir tout de suite : sans stop_reason, on
    // cherche longtemps pourquoi le JSON est invalide.
    const texteReponse = extractStructuredText(anthropicPayload);
    let reponse: ReponseIA;
    try {
      reponse = JSON.parse(texteReponse) as ReponseIA;
    } catch (err) {
      throw new Error(
        `Réponse du correcteur illisible (${err instanceof Error ? err.message : String(err)}). ` +
          `stop_reason=${String(anthropicPayload.stop_reason)} ` +
          `usage=${JSON.stringify(anthropicPayload.usage)} ` +
          `longueur=${texteReponse.length} ` +
          `fin=«${texteReponse.slice(-200)}»`,
      );
    }

    const etalonDesigne = etalons.find((e) => e.id === reponse.benchmark_comparison?.closest_etalon_id);
    const etalonProche = etalonDesigne
      ? { libelle: String(etalonDesigne.id), note: Number(etalonDesigne.score) }
      : null;

    const resultat = construireResultatExercice({
      examId: (correction.exam_id as string) ?? null,
      examFormat: format,
      grille,
      reponse,
      texteTranscription: texte,
      transcription: transcription as { overall_confidence?: number; requires_human_review?: boolean },
      etalonProche,
      statutGrille: statut,
      grilleVerrouillee: verrouillee,
      etalonsCompares: etalons.length,
      taxonomie,
    });

    /* -------------------------------------------------------------- */
    /*  Ecriture du resultat                                          */
    /* -------------------------------------------------------------- */

    // Le detail part dans ses tables ; le trigger de la base recalcule alors
    // la note de la copie a partir de ces lignes, pas de ce que dit le modele.
    await supabase.from('correction_criteres').delete().eq('correction_id', correctionId);
    const { error: errCriteres } = await supabase.from('correction_criteres').insert(
      resultat.criteria.map((c) => ({
        correction_id: correctionId,
        grille_id: grille.id,
        critere_code: c.criterion_id,
        score: c.score,
        max_points: c.max_score,
        niveau: c.level,
        score_avant_plafond: c.score_avant_plafond ?? null,
        plafonne_par: c.plafonne_par ?? [],
        forces: c.observed_strengths,
        faiblesses: c.observed_weaknesses,
        preuves: c.evidence,
        feedback: c.feedback,
        relecture_humaine: c.human_review_required,
      })),
    );
    if (errCriteres) throw new Error(`Enregistrement des critères : ${errCriteres.message}`);

    await supabase.from('correction_erreurs').delete().eq('correction_id', correctionId);
    if (resultat.error_events.length) {
      const { error } = await supabase.from('correction_erreurs').insert(
        resultat.error_events.map((e) => ({
          correction_id: correctionId,
          taxonomy_code: e.taxonomy_code,
          libelle: e.libelle,
          critere_code: e.criterion_id,
          type_impact: e.impact_type,
          impact_description: e.impact_description,
          score_effect: e.score_effect,
          criterion_cap: e.criterion_cap,
          criterion_level_cap: e.criterion_level_cap,
          fourchette: e.indicative_range,
          preuves: e.evidence,
          certitude: e.confidence,
          source_error_id: e.source_error_id,
          is_consequence: e.is_consequence,
          scored_in_criterion: e.scored_in_criterion,
          already_counted: e.already_counted,
          scoring_effect: e.scoring_effect,
          relecture_humaine: e.human_review_required,
        })),
      );
      if (error) throw new Error(`Enregistrement des erreurs : ${error.message}`);
    }

    await supabase.from('correction_controles').upsert({
      correction_id: correctionId,
      ...resultat.consistency_checks,
      details: resultat.consistency_checks.details,
    });

    // Les demandes de relecture deviennent des lignes ouvrables par un humain.
    await supabase.from('relectures_humaines').delete().eq('correction_id', correctionId);
    if (resultat.human_review_reasons.length) {
      await supabase.from('relectures_humaines').insert(
        resultat.human_review_reasons.map((m) => ({
          correction_id: correctionId,
          question_key: m.criterion_id ?? null,
          code_motif: m.code,
          motif: m.message,
          statut: 'ouverte',
        })),
      );
    }

    // result_json reste lisible par tout l'existant (note_finale, criteria,
    // detected_errors...) ET porte la structure complete du nouveau moteur.
    const resultJson = {
      ...resultat,
      // Compatibilite : la note lue par les ecrans est l'echelle ANALYTIQUE,
      // celle du bareme de la grille (20). La note officielle est a cote.
      note_finale: resultat.analytical_score,
      analytic_sum: resultat.analytical_score,
      note_officielle: resultat.official_score,
      niveau_global: resultat.level_global,
      appreciation_generale: resultat.general_feedback,
      points_forts: resultat.strengths,
      priorites_amelioration: resultat.priorities,
      criteria: resultat.criteria.map((c) => ({
        code: c.criterion_id,
        name: c.libelle,
        score: c.score,
        maximum: c.max_score,
        level: c.level,
        level_label: c.level_label,
        justification: c.feedback,
        improvement: c.observed_weaknesses.join(' '),
        evidence: c.evidence.map((p) => ({
          page: p.page,
          quote: p.citation,
          explanation: p.explication ?? '',
        })),
        observed_strengths: c.observed_strengths,
        observed_weaknesses: c.observed_weaknesses,
        score_avant_plafond: c.score_avant_plafond,
        plafonne_par: c.plafonne_par,
        human_review_required: c.human_review_required,
      })),
      detected_errors: resultat.error_events.map((e) => ({
        code: e.taxonomy_code,
        severity: e.impact_type,
        evidence: e.evidence[0]?.citation ?? '',
        impact: `${e.impact_description} — ${e.scoring_effect}`,
      })),
      human_review_reasons: resultat.human_review_reasons.map((m) => m.message),
      human_review_details: resultat.human_review_reasons,
      benchmark_comparison: reponse.benchmark_comparison ?? null,
      production_graphique: reponse.production_graphique ?? null,
      documents_exploites: reponse.documents_exploites ?? null,
      nombre_documents: documents,
    };

    const { error: errSave } = await supabase
      .from('corrections')
      .update({
        status: resultat.human_review_required ? 'corrected_review' : 'corrected',
        result_json: resultJson,
        model_name: model,
        moteur: 'criteres_rediges',
        grille_id: grille.id,
        exam_format: format,
        human_review_required: resultat.human_review_required,
        max_analytique: resultat.analytical_max,
        max_officiel: resultat.official_max,
        max_score: resultat.analytical_max,
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', correctionId);
    if (errSave) throw new Error(`Enregistrement impossible: ${errSave.message}`);

    return jsonResponse({
      ok: true,
      correction_id: correctionId,
      status: resultat.human_review_required ? 'corrected_review' : 'corrected',
      analytical_score: resultat.analytical_score,
      official_score: resultat.official_score,
      exam_format: format,
      human_review_required: resultat.human_review_required,
      result: resultJson,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (correctionId) {
      try {
        await supabase
          .from('corrections')
          .update({
            status: 'correction_failed',
            processing_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', correctionId);
      } catch (_) {
        // La reponse d'erreur principale reste prioritaire.
      }
    }
    return jsonResponse({ error: message }, 500);
  }
});
