
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pipeline-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function getSupabaseSecretKey(): string {
  const direct =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");
  if (direct) return direct;

  const rawMap = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (rawMap) {
    const keys = JSON.parse(rawMap) as Record<string, string>;
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (first) return first;
  }
  throw new Error("Aucune clé secrète Supabase disponible dans la fonction.");
}

function assertInternalSecret(req: Request): Response | null {
  const expected = Deno.env.get("PIPELINE_INTERNAL_SECRET");
  if (!expected) {
    return jsonResponse(
      { error: "PIPELINE_INTERNAL_SECRET n’est pas configuré." },
      500,
    );
  }
  const provided = req.headers.get("x-pipeline-secret");
  if (provided !== expected) {
    return jsonResponse({ error: "Accès refusé." }, 401);
  }
  return null;
}

function getAnthropicConfig() {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY n’est pas configuré.");
  return {
    apiKey,
    model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5",
  };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function callAnthropic(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Erreur Claude ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload as Record<string, unknown>;
}

function extractStructuredText(payload: Record<string, unknown>): string {
  const content = payload.content;
  if (!Array.isArray(content)) {
    throw new Error("Réponse Claude sans bloc content.");
  }
  const block = content.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as Record<string, unknown>).type === "text",
  ) as Record<string, unknown> | undefined;

  if (!block || typeof block.text !== "string") {
    throw new Error("Réponse Claude sans bloc texte exploitable.");
  }
  return block.text;
}

const correctionSchema = {
  "type": "object",
  "properties": {
    "note_finale": {
      "type": "number"
    },
    "analytic_sum": {
      "type": "number"
    },
    "niveau_global": {
      "type": "string"
    },
    "appreciation_generale": {
      "type": "string"
    },
    "criteria": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "score": {
            "type": "number"
          },
          "maximum": {
            "type": "number"
          },
          "justification": {
            "type": "string"
          },
          "evidence": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "page": {
                  "type": "integer"
                },
                "quote": {
                  "type": "string"
                },
                "explanation": {
                  "type": "string"
                }
              },
              "required": [
                "page",
                "quote",
                "explanation"
              ],
              "additionalProperties": false
            }
          },
          "improvement": {
            "type": "string"
          }
        },
        "required": [
          "code",
          "name",
          "score",
          "maximum",
          "justification",
          "evidence",
          "improvement"
        ],
        "additionalProperties": false
      }
    },
    "detected_errors": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string"
          },
          "severity": {
            "type": "string",
            "enum": [
              "minor",
              "moderate",
              "major"
            ]
          },
          "evidence": {
            "type": "string"
          },
          "impact": {
            "type": "string"
          }
        },
        "required": [
          "code",
          "severity",
          "evidence",
          "impact"
        ],
        "additionalProperties": false
      }
    },
    "points_forts": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "priorites_amelioration": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "erreurs_factuelles": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "benchmark_comparison": {
      "type": "object",
      "properties": {
        "lower_or_equal_id": {
          "type": "string"
        },
        "upper_or_equal_id": {
          "type": "string"
        },
        "explanation": {
          "type": "string"
        }
      },
      "required": [
        "lower_or_equal_id",
        "upper_or_equal_id",
        "explanation"
      ],
      "additionalProperties": false
    },
    "confidence": {
      "type": "number"
    },
    "human_review_required": {
      "type": "boolean"
    },
    "human_review_reasons": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "note_finale",
    "analytic_sum",
    "niveau_global",
    "appreciation_generale",
    "criteria",
    "detected_errors",
    "points_forts",
    "priorites_amelioration",
    "erreurs_factuelles",
    "benchmark_comparison",
    "confidence",
    "human_review_required",
    "human_review_reasons"
  ],
  "additionalProperties": false
};

type BenchmarkRow = {
  id: string;
  score: number | null;
  error_codes: string[] | null;
  card_json: Record<string, unknown>;
  validation_status: string;
  subject_id?: string | null;
  /** Renseigne par la fonction : l'etalon porte-t-il sur le sujet corrige ? */
  meme_sujet?: boolean;
};

function selectBenchmarks(rows: BenchmarkRow[]): BenchmarkRow[] {
  const sorted = [...rows].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const selected: BenchmarkRow[] = [];

  const add = (row: BenchmarkRow | undefined) => {
    if (row && !selected.some((item) => item.id === row.id)) selected.push(row);
  };

  add(sorted[0]);
  add(sorted.find((row) => (row.score ?? 0) >= 18));
  add(sorted[sorted.length - 1]);

  for (const row of sorted) {
    add(row);
    if (selected.length >= 4) break;
  }
  return selected.slice(0, 4);
}

function normalizeAndCheckResult(
  result: Record<string, unknown>,
  rubricJson: Record<string, unknown>,
  transcription: Record<string, unknown>,
): Record<string, unknown> {
  const rubricCriteria = Array.isArray(rubricJson.criteria)
    ? rubricJson.criteria as Record<string, unknown>[]
    : [];
  const returnedCriteria = Array.isArray(result.criteria)
    ? result.criteria as Record<string, unknown>[]
    : [];
  const issues: string[] = [];

  const normalized = rubricCriteria.map((rubricCriterion) => {
    const code = String(rubricCriterion.code ?? "");
    const maximum = Number(rubricCriterion.maximum_score ?? 0);
    const found = returnedCriteria.find((criterion) => String(criterion.code ?? "") === code);

    if (!found) {
      issues.push(`Critère manquant: ${code}`);
      return {
        code,
        name: String(rubricCriterion.name ?? code),
        score: 0,
        maximum,
        justification: "Critère absent de la réponse du modèle.",
        evidence: [],
        improvement: "Vérification humaine obligatoire.",
      };
    }

    const rawScore = Number(found.score ?? 0);
    const clampedScore = Math.max(0, Math.min(maximum, rawScore));
    if (clampedScore !== rawScore) {
      issues.push(`Score hors limites corrigé pour ${code}: ${rawScore} -> ${clampedScore}`);
    }
    return {
      ...found,
      code,
      name: String(rubricCriterion.name ?? found.name ?? code),
      score: clampedScore,
      maximum,
    };
  });

  const sum = Number(
    normalized.reduce((total, criterion) => total + Number(criterion.score ?? 0), 0).toFixed(2),
  );
  const modelNote = Number(result.note_finale ?? 0);
  if (Math.abs(modelNote - sum) > 0.01) {
    issues.push(`Note du modèle (${modelNote}) remplacée par la somme analytique (${sum}).`);
  }

  const transcriptionConfidence = Number(transcription.overall_confidence ?? 0);
  if (transcriptionConfidence < 0.85) {
    issues.push(`Confiance de transcription faible: ${transcriptionConfidence}.`);
  }
  if (transcription.requires_human_review === true) {
    issues.push("La transcription a déjà demandé une vérification humaine.");
  }

  const previousReasons = Array.isArray(result.human_review_reasons)
    ? result.human_review_reasons.map(String)
    : [];
  const reviewReasons = [...new Set([...previousReasons, ...issues])];

  return {
    ...result,
    criteria: normalized,
    analytic_sum: sum,
    note_finale: sum,
    human_review_required:
      result.human_review_required === true || reviewReasons.length > 0,
    human_review_reasons: reviewReasons,
    quality_checks: {
      model_note_before_normalization: modelNote,
      normalized_sum: sum,
      transcription_confidence: transcriptionConfidence,
      automatic_issues: issues,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, 405);

  const denied = assertInternalSecret(req);
  if (denied) return denied;

  let correctionId = "";
  try {
    const body = await req.json();
    correctionId = String(body.correction_id ?? "");
    if (!correctionId) return jsonResponse({ error: "correction_id est obligatoire." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getSupabaseSecretKey(),
      { auth: { persistSession: false } },
    );

    const { data: correction, error: correctionError } = await supabase
      .from("corrections")
      .select("*")
      .eq("id", correctionId)
      .single();

    if (correctionError || !correction) {
      return jsonResponse({ error: "Correction introuvable.", details: correctionError }, 404);
    }

    const { data: transcriptionRow, error: transcriptionError } = await supabase
      .from("copy_transcriptions")
      .select("*")
      .eq("correction_id", correctionId)
      .single();

    if (transcriptionError || !transcriptionRow) {
      return jsonResponse(
        { error: "Aucune transcription disponible. Lance d’abord transcribe-french-copy." },
        409,
      );
    }

    const [rubricResult, subjectResult, benchmarkResult, errorsResult] = await Promise.all([
      supabase.from("rubrics").select("*").eq("id", correction.rubric_id).single(),
      supabase.from("subject_cards").select("*").eq("id", correction.subject_id).single(),
      supabase
        .from("benchmark_cards")
        .select("id, score, error_codes, card_json, validation_status, subject_id")
        .eq("track", correction.track)
        .eq("exercise_type", correction.exercise_type)
        .eq("subject_id", correction.subject_id)
        .in("validation_status", ["validated", "candidate"]),
      supabase
        .from("error_taxonomy")
        .select("*")
        .in("exercise_type", [correction.exercise_type, "tous"]),
    ]);

    if (rubricResult.error || !rubricResult.data) {
      throw new Error(`Grille introuvable: ${rubricResult.error?.message ?? ""}`);
    }
    const correctionSystemPrompt = rubricResult.data.system_prompt as string | null;
    if (!correctionSystemPrompt || correctionSystemPrompt.trim().length < 20) {
      throw new Error(
        `La grille "${rubricResult.data.id}" n'a pas de system_prompt (expertise de correction). ` +
        `Renseigne rubrics.system_prompt pour cette grille avant de corriger.`,
      );
    }
    if (subjectResult.error || !subjectResult.data) {
      throw new Error(`Fiche sujet introuvable: ${subjectResult.error?.message ?? ""}`);
    }
    if (benchmarkResult.error) {
      throw new Error(`Étalons introuvables: ${benchmarkResult.error.message}`);
    }
    // Quelle taxonomie d'erreurs remettre au correcteur ?
    //
    // La table error_taxonomy n'a pas de colonne matiere et ne contient que le
    // francais. Depuis SES, chaque matiere porte SA taxonomie dans
    // rubric_json.common_error_taxonomy. Or SES partage le nom d'epreuve
    // "dissertation" avec le francais : interroger la table par exercise_type
    // seul remettait au correcteur de SES les codes d'erreur du francais,
    // presentes comme les siens. La grille prime donc toujours, et on ne
    // retombe sur la table que pour les matieres qui n'ont pas de taxonomie
    // dans leur grille (le francais).
    const taxonomieDeLaGrille =
      (rubricResult.data.rubric_json?.common_error_taxonomy ?? []) as unknown[];
    if (!taxonomieDeLaGrille.length && errorsResult.error) {
      throw new Error(`Taxonomie introuvable: ${errorsResult.error.message}`);
    }
    const errorTaxonomy = taxonomieDeLaGrille.length
      ? taxonomieDeLaGrille
      : (errorsResult.data ?? []);

    // --- Étalons -------------------------------------------------------
    //
    // Un étalon sert à situer un NIVEAU, pas à comparer deux copies sur le
    // même texte : le sujet d'un bac blanc est presque toujours inédit,
    // alors que les copies de référence, elles, ne changent pas. Exiger
    // trois étalons portant exactement le même subject_id revenait donc à
    // rendre incorrigible tout sujet nouveau — c'est-à-dire tous.
    //
    // On garde la priorité au même sujet quand il en a (comparaison la plus
    // juste), puis on complète avec les étalons de la MÊME épreuve, dans la
    // MÊME matière et la MÊME filière. Chaque étalon dit ensuite au
    // correcteur, par meme_sujet, s'il porte ou non sur le sujet corrigé.
    const etalonsMemeSujet = ((benchmarkResult.data ?? []) as BenchmarkRow[]).map((b) => ({
      ...b,
      meme_sujet: true,
    }));

    const matiereCorrigee = (correction.matiere as string | null) ??
      (subjectResult.data.matiere as string | null);

    let etalonsAutresSujets: BenchmarkRow[] = [];
    if (etalonsMemeSujet.length < 4 && matiereCorrigee) {
      const { data: sujetsFreres } = await supabase
        .from("subject_cards")
        .select("id")
        .eq("matiere", matiereCorrigee)
        .eq("track", correction.track)
        .eq("exercise_type", correction.exercise_type);

      const idsFreres = (sujetsFreres ?? [])
        .map((s: { id: string }) => s.id)
        .filter((id: string) => id !== correction.subject_id);

      if (idsFreres.length) {
        const { data: autres } = await supabase
          .from("benchmark_cards")
          .select("id, score, error_codes, card_json, validation_status, subject_id")
          .in("subject_id", idsFreres)
          .eq("track", correction.track)
          .eq("exercise_type", correction.exercise_type)
          .in("validation_status", ["validated", "candidate"]);
        etalonsAutresSujets = ((autres ?? []) as BenchmarkRow[])
          .filter((b) => b.score !== null)
          .map((b) => ({ ...b, meme_sujet: false }));
      }
    }

    const benchmarks = selectBenchmarks(etalonsMemeSujet);
    if (benchmarks.length < 4 && etalonsAutresSujets.length) {
      for (const complement of selectBenchmarks(etalonsAutresSujets)) {
        if (benchmarks.length >= 4) break;
        if (!benchmarks.some((b) => b.id === complement.id)) benchmarks.push(complement);
      }
    }
    if (benchmarks.length < 3) {
      throw new Error(
        "Moins de trois copies étalons disponibles : ni pour ce sujet, ni pour cette épreuve dans cette matière et cette filière.",
      );
    }

    await supabase
      .from("corrections")
      .update({ status: "correcting", processing_error: null, updated_at: new Date().toISOString() })
      .eq("id", correctionId);

    const stableContext = {
      rubric: rubricResult.data.rubric_json,
      subject: subjectResult.data.card_json,
      benchmarks,
      benchmarks_mode: benchmarks.every((b) => b.meme_sujet)
        ? "Tous les etalons portent sur le sujet corrige."
        : "Certains etalons portent sur un AUTRE sujet de la meme epreuve (meme_sujet vaut false, et card_json.support dit lequel). Ils servent a situer un NIVEAU, jamais a comparer les contenus : ne reproche jamais a l'eleve de ne pas avoir traite ce que traite un etalon d'un autre sujet.",
      error_taxonomy: errorTaxonomy,
    };

    const transcription = transcriptionRow.transcription_json as Record<string, unknown>;
    const { apiKey, model } = getAnthropicConfig();

    const anthropicPayload = await callAnthropic(apiKey, {
      model,
      max_tokens: 20000,
      system: correctionSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "DOSSIER STABLE DE CORRECTION\n" +
                JSON.stringify(stableContext),
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
            {
              type: "text",
              text:
                "TRANSCRIPTION DE LA COPIE À ÉVALUER\n" +
                JSON.stringify(transcription) +
                "\n\nProcède à une correction argumentée, complète et strictement conforme au schéma demandé.",
            },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: correctionSchema,
        },
      },
    });

    const resultText = extractStructuredText(anthropicPayload);
    const modelResult = JSON.parse(resultText) as Record<string, unknown>;
    const checkedResult = normalizeAndCheckResult(
      modelResult,
      rubricResult.data.rubric_json as Record<string, unknown>,
      transcription,
    );

    const { error: saveError } = await supabase
      .from("corrections")
      .update({
        status: checkedResult.human_review_required === true ? "corrected_review" : "corrected",
        result_json: checkedResult,
        model_name: model,
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", correctionId);

    if (saveError) throw new Error(`Enregistrement impossible: ${saveError.message}`);

    return jsonResponse({
      ok: true,
      correction_id: correctionId,
      status: checkedResult.human_review_required === true ? "corrected_review" : "corrected",
      result: checkedResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (correctionId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          getSupabaseSecretKey(),
          { auth: { persistSession: false } },
        );
        await supabase
          .from("corrections")
          .update({ status: "correction_failed", processing_error: message, updated_at: new Date().toISOString() })
          .eq("id", correctionId);
      } catch (_) {
        // La réponse d’erreur principale reste prioritaire.
      }
    }
    return jsonResponse({ error: message }, 500);
  }
});
