
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

/**
 * Modèle utilisé pour la transcription.
 *
 * Recopier une copie manuscrite n'est pas la tâche la plus « intelligente » de
 * la chaîne — c'est la correction qui l'est. On utilise donc par défaut un
 * modèle moins cher ici (1 $/5 $ par million de tokens au lieu de 3 $/15 $),
 * ce qui divise par trois le coût de l'étape qui avale le PDF entier.
 *
 * ANTHROPIC_MODEL_TRANSCRIPTION permet de revenir en arrière sans redéployer
 * la fonction : si la lecture des copies manuscrites se dégrade, il suffit de
 * mettre claude-sonnet-5 dans ce secret. Toute la chaîne en dépend — une
 * transcription approximative fausse la note ET le dossier.
 *
 * On ne retombe volontairement PAS sur ANTHROPIC_MODEL : ce secret vaut déjà
 * claude-sonnet-5 pour les deux autres fonctions, et l'utiliser ici en repli
 * annulerait silencieusement l'économie.
 */
function getAnthropicConfig() {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY n’est pas configuré.");
  return {
    apiKey,
    model: Deno.env.get("ANTHROPIC_MODEL_TRANSCRIPTION") ?? "claude-haiku-4-5",
  };
}

/**
 * Profil de transcription d'une matière — une LIGNE dans transcription_profiles,
 * pas du code. Il porte deux choses :
 *   - le modèle à employer (les matières scientifiques valent un modèle plus
 *     capable : une puissance de dix mal lue fausse la note ET le dossier) ;
 *   - des consignes de lecture propres à la matière (notation scientifique,
 *     équations chimiques, vecteurs, unités…).
 *
 * Absence de profil, de table ou d'erreur = comportement d'avant, à
 * l'identique. Une matière sans profil n'est jamais bloquée.
 */
type ProfilTranscription = {
  matiere: string;
  model: string | null;
  system_prompt: string | null;
  user_prompt: string | null;
};

async function chargerProfil(
  supabase: ReturnType<typeof createClient>,
  matiere: unknown,
): Promise<ProfilTranscription | null> {
  if (typeof matiere !== "string" || !matiere.trim()) return null;
  try {
    const { data, error } = await supabase
      .from("transcription_profiles")
      .select("matiere, model, system_prompt, user_prompt")
      .eq("matiere", matiere.trim())
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1);
    if (error) {
      console.warn(`Profil de transcription illisible (${matiere}): ${error.message}`);
      return null;
    }
    return (data?.[0] as ProfilTranscription | undefined) ?? null;
  } catch (err) {
    console.warn(`Profil de transcription ignoré (${matiere}): ${String(err)}`);
    return null;
  }
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

const transcriptionSchema = {
  "type": "object",
  "properties": {
    "document_type": {
      "type": "string"
    },
    "pages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "page_number": {
            "type": "integer"
          },
          "text": {
            "type": "string"
          },
          "confidence": {
            "type": "number"
          },
          "uncertain_passages": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "raw": {
                  "type": "string"
                },
                "suggestion": {
                  "type": "string"
                },
                "reason": {
                  "type": "string"
                }
              },
              "required": [
                "raw",
                "suggestion",
                "reason"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "page_number",
          "text",
          "confidence",
          "uncertain_passages"
        ],
        "additionalProperties": false
      }
    },
    "overall_confidence": {
      "type": "number"
    },
    "legibility_status": {
      "type": "string",
      "enum": [
        "good",
        "mixed",
        "poor"
      ]
    },
    "requires_human_review": {
      "type": "boolean"
    },
    "review_reasons": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "document_type",
    "pages",
    "overall_confidence",
    "legibility_status",
    "requires_human_review",
    "review_reasons"
  ],
  "additionalProperties": false
};

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
    if (!correction.original_storage_path) {
      return jsonResponse({ error: "Aucun chemin de copie n’est enregistré." }, 400);
    }

    await supabase
      .from("corrections")
      .update({ status: "transcribing", processing_error: null, updated_at: new Date().toISOString() })
      .eq("id", correctionId);

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("student-copies")
      .download(correction.original_storage_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Téléchargement impossible: ${downloadError?.message ?? "fichier absent"}`);
    }

    if (fileBlob.size > 15 * 1024 * 1024) {
      throw new Error("La copie dépasse la limite pilote de 15 Mo.");
    }

    const mediaType = fileBlob.type || "application/pdf";
    if (mediaType !== "application/pdf") {
      throw new Error("Le pilote attend actuellement une copie au format PDF.");
    }

    const pdfBase64 = await blobToBase64(fileBlob);
    const { apiKey, model: modeleParDefaut } = getAnthropicConfig();

    // Le profil de la matière peut imposer un modèle plus capable et des
    // consignes de lecture spécifiques (notation scientifique, chimie…).
    const profil = await chargerProfil(supabase, correction.matiere);
    const model = profil?.model?.trim() || modeleParDefaut;

    const anthropicPayload = await callAnthropic(apiKey, {
      model,
      max_tokens: 16000,
      system:
        "Tu es un transcripteur de copies manuscrites du baccalauréat. " +
        "Transcris strictement sans corriger l’orthographe, la syntaxe, les répétitions ni les erreurs de l’élève. " +
        "Respecte l’ordre des pages et des paragraphes. N’invente jamais un mot illisible. " +
        "Indique chaque incertitude dans uncertain_passages et emploie [illisible] dans le texte si aucune lecture fiable n’est possible." +
        (profil?.system_prompt?.trim() ? `\n\n${profil.system_prompt.trim()}` : ""),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text:
                "Transcris cette copie page par page. Le numéro de page correspond à l’ordre du PDF. " +
                "Évalue honnêtement la lisibilité et impose une vérification humaine dès qu’un passage important est incertain." +
                (profil?.user_prompt?.trim() ? `\n\n${profil.user_prompt.trim()}` : ""),
            },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: transcriptionSchema,
        },
      },
    });

    const transcriptionText = extractStructuredText(anthropicPayload);
    const transcription = JSON.parse(transcriptionText);

    const { error: upsertError } = await supabase
      .from("copy_transcriptions")
      .upsert(
        {
          correction_id: correctionId,
          transcription_json: transcription,
          mean_confidence: transcription.overall_confidence,
          model_name: model,
          raw_response_json: anthropicPayload,
        },
        { onConflict: "correction_id" },
      );

    if (upsertError) throw new Error(`Enregistrement impossible: ${upsertError.message}`);

    await supabase
      .from("corrections")
      .update({
        status: transcription.requires_human_review ? "transcription_review" : "transcribed",
        model_name: model,
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", correctionId);

    return jsonResponse({
      ok: true,
      correction_id: correctionId,
      status: transcription.requires_human_review ? "transcription_review" : "transcribed",
      transcription,
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
          .update({ status: "transcription_failed", processing_error: message, updated_at: new Date().toISOString() })
          .eq("id", correctionId);
      } catch (_) {
        // La réponse d’erreur principale reste prioritaire.
      }
    }
    return jsonResponse({ error: message }, 500);
  }
});
