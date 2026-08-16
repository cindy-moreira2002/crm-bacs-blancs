/**
 * PROPOSITION DE BAREME A PARTIR DU SUJET.
 *
 * Ce que cette fonction fait : elle lit le sujet (PDF ou texte) et rend un
 * bareme question par question, pret a etre relu dans /admin/bareme.
 *
 * Ce qu'elle ne fait PAS, et c'est volontaire :
 *   - elle n'ecrit rien en base. Aucune table n'est touchee. La proposition
 *     remonte a l'ecran, l'administratrice la relit, la modifie, et c'est SON
 *     clic sur « Enregistrer » qui l'inscrit ;
 *   - elle ne verrouille rien. Le verrouillage reste une decision humaine,
 *     apres les controles de `bareme_verifier()`.
 *
 * Autrement dit : un brouillon de correcteur, pas une autorite. Un bareme
 * decide de la note officielle d'un eleve ; il ne peut pas etre pose par une
 * machine sans relecture.
 *
 * Deploiement (pas de CI, c'est manuel) :
 *   npx --yes supabase@latest functions deploy propose-bareme \
 *     --project-ref xgdaibekjmtffvkwvcge --no-verify-jwt
 * Ne JAMAIS coller ce code dans l'editeur du dashboard : il abime les accents.
 */
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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
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
    return jsonResponse({ error: "PIPELINE_INTERNAL_SECRET n’est pas configuré." }, 500);
  }
  if (req.headers.get("x-pipeline-secret") !== expected) {
    return jsonResponse({ error: "Accès refusé." }, 401);
  }
  return null;
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
    throw new Error(`Erreur Claude ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload as Record<string, unknown>;
}

function extractStructuredText(payload: Record<string, unknown>): string {
  const content = payload.content;
  if (!Array.isArray(content)) throw new Error("Réponse Claude sans bloc content.");
  const block = content.find(
    (item) =>
      typeof item === "object" && item !== null &&
      (item as Record<string, unknown>).type === "text",
  ) as Record<string, unknown> | undefined;
  if (!block || typeof block.text !== "string") {
    throw new Error("Réponse Claude sans bloc texte exploitable.");
  }
  return block.text;
}

/**
 * Le schema de sortie.
 *
 * Les codes de competences ne sont PAS un enum : une grammaire trop grosse
 * fait echouer l'appel (« compiled grammar is too large », deja rencontre sur
 * le brevet de francais). Les codes autorises sont donnes dans la consigne, et
 * ceux que le modele inventerait quand meme sont retires plus bas.
 */
const schemaProposition = {
  type: "object",
  properties: {
    exercices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          titre: { type: "string" },
        },
        required: ["code", "titre"],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_key: { type: "string" },
          numero: { type: "string" },
          libelle: { type: "string" },
          exercice_code: { type: "string" },
          max_points: { type: "number" },
          reponse_attendue: { type: "string" },
          raisonnement_attendu: { type: "string" },
          etapes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                libelle: { type: "string" },
                points: { type: "number" },
              },
              required: ["libelle", "points"],
              additionalProperties: false,
            },
          },
          paliers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                libelle: { type: "string" },
                points: { type: "number" },
                nature: {
                  type: "string",
                  enum: ["resultat", "methode", "etape", "alternative", "bonus"],
                },
                cumulable: { type: "boolean" },
              },
              required: ["libelle", "points", "nature", "cumulable"],
              additionalProperties: false,
            },
          },
          reponses_equivalentes: { type: "array", items: { type: "string" } },
          unites_attendues: { type: "string" },
          precision_attendue: { type: "string" },
          tolerances: { type: "string" },
          calculatrice: {
            type: "string",
            enum: ["autorisee", "interdite", "indifferent"],
          },
          competences: { type: "array", items: { type: "string" } },
          depend_de: { type: "array", items: { type: "string" } },
          criteres_relecture_humaine: { type: "string" },
        },
        required: [
          "question_key",
          "numero",
          "libelle",
          "exercice_code",
          "max_points",
          "reponse_attendue",
          "raisonnement_attendu",
          "etapes",
          "paliers",
          "reponses_equivalentes",
          "unites_attendues",
          "precision_attendue",
          "tolerances",
          "calculatrice",
          "competences",
          "depend_de",
          "criteres_relecture_humaine",
        ],
        additionalProperties: false,
      },
    },
    remarques: { type: "array", items: { type: "string" } },
  },
  required: ["exercices", "questions", "remarques"],
  additionalProperties: false,
};

const CONSIGNE = `Tu es un professeur qui écrit le barème d'un sujet d'examen, question par question.

Le barème que tu produis sera relu par une professeure avant d'être utilisé. Écris-le comme un
brouillon sérieux : complet, chiffré, et honnête sur ce dont tu n'es pas sûr.

RÈGLES ABSOLUES
1. Tu ne notes aucune copie. Tu décris ce qu'on attend et ce que ça vaut.
2. Tu reprends EXACTEMENT la numérotation du sujet ("Exercice 2, question 3.b" → numero "3.b",
   exercice_code "ex2"). Tu n'inventes aucune question qui n'est pas dans le sujet, et tu n'en
   oublies aucune, y compris les questions de type QCM, "justifier", "démontrer".
3. La somme des max_points de TOUTES les questions doit valoir exactement le total demandé.
   Si le sujet indique déjà des points par exercice, tu les respectes et tu répartis à l'intérieur.
   Sinon, tu répartis selon la difficulté et la longueur attendue.
4. Chaque point est un multiple de 0,25.
5. Chaque question a une reponse_attendue non vide. Si le sujet ne permet pas de la déterminer avec
   certitude (donnée manquante, figure illisible, énoncé ambigu), écris quand même l'attendu le
   plus probable ET signale-le dans "remarques" : la professeure tranchera.
6. Chaque question a au moins un palier de points. Les paliers cumulables doivent totaliser au plus
   le max_points de la question — vise exactement ce max quand les étapes couvrent toute la
   question. Un palier décrit ce qui fait gagner les points ("pose correctement la dérivée : 0,5"),
   jamais une appréciation ("bonne copie").
7. competences : uniquement des codes de la liste fournie. Aucun code inventé.
8. depend_de : la clé d'une question dont celle-ci réutilise le résultat (question_key, pas numéro).
   Sert à ne pas sanctionner deux fois la même erreur.
9. criteres_relecture_humaine : ce qui doit envoyer la copie chez un humain (méthode inhabituelle
   mais correcte, raisonnement juste avec erreur de calcul en cascade, réponse hors format attendu).

Écris en français. N'utilise le champ "remarques" que pour ce qui demande une décision humaine.`;

type Palier = { libelle: string; points: number; nature: string; cumulable: boolean };
type QuestionProposee = {
  question_key: string;
  numero: string;
  libelle: string;
  exercice_code: string;
  max_points: number;
  paliers: Palier[];
  competences: string[];
  depend_de: string[];
  [k: string]: unknown;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const refus = assertInternalSecret(req);
  if (refus) return refus;

  try {
    const body = await req.json() as {
      version_id?: string;
      sujet_pdf_base64?: string;
      sujet_texte?: string;
      consignes?: string;
    };
    if (!body.version_id) {
      return jsonResponse({ error: "version_id est obligatoire." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      getSupabaseSecretKey(),
      { auth: { persistSession: false } },
    );

    const { data: version, error: errV } = await supabase
      .from("bareme_versions")
      .select("id, exam_id, matiere, statut, max_score")
      .eq("id", body.version_id)
      .maybeSingle();
    if (errV) throw new Error(`Lecture de la version : ${errV.message}`);
    if (!version) return jsonResponse({ error: "Version de barème introuvable." }, 404);
    if (version.statut === "locked") {
      return jsonResponse(
        { error: "Cette version est verrouillée : crée une nouvelle version avant de proposer un barème." },
        409,
      );
    }

    const [examRes, refRes] = await Promise.all([
      supabase
        .from("exams")
        .select("id, code, titre, matiere, session, sujet_texte, sujet_url, consignes_correcteur")
        .eq("id", version.exam_id)
        .single(),
      supabase
        .from("competence_referentiels")
        .select("code, libelle, description")
        .eq("matiere", version.matiere)
        .order("ordre"),
    ]);
    if (examRes.error) throw new Error(`Lecture de l'examen : ${examRes.error.message}`);
    const examen = examRes.data as {
      titre: string; matiere: string; session: string | null;
      sujet_texte: string | null; sujet_url: string | null; consignes_correcteur: string | null;
    };
    const referentiel = (refRes.data ?? []) as { code: string; libelle: string; description: string | null }[];
    if (!referentiel.length) {
      return jsonResponse(
        {
          error:
            `Aucun référentiel de compétences pour ${version.matiere} : le barème ne pourrait pas être ` +
            `verrouillé. Installe le référentiel de la matière avant de proposer un barème.`,
        },
        409,
      );
    }

    // Le sujet, dans l'ordre de ce qui est le plus fidèle : le PDF fourni,
    // puis le PDF déjà rattaché à l'examen, puis le texte collé dans la fiche.
    let pdfBase64: string | null = body.sujet_pdf_base64?.trim() || null;
    const texteSujet = (body.sujet_texte ?? examen.sujet_texte ?? "").trim();

    if (!pdfBase64 && !texteSujet && examen.sujet_url) {
      const r = await fetch(examen.sujet_url);
      if (!r.ok) {
        return jsonResponse(
          { error: `Le sujet enregistré (${examen.sujet_url}) n'a pas pu être téléchargé : HTTP ${r.status}.` },
          400,
        );
      }
      const blob = await r.blob();
      if (blob.size > 15 * 1024 * 1024) {
        return jsonResponse({ error: "Le PDF du sujet dépasse 15 Mo." }, 400);
      }
      pdfBase64 = await blobToBase64(blob);
    }

    if (!pdfBase64 && !texteSujet) {
      return jsonResponse(
        {
          error:
            "Aucun sujet à lire : dépose le PDF du sujet, ou colle son texte dans l'onglet Examen.",
        },
        400,
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY n’est pas configuré.");
    const model = Deno.env.get("ANTHROPIC_MODEL_BAREME") ??
      Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";

    const contexte =
      `ÉPREUVE : ${examen.titre} — ${examen.matiere}` +
      (examen.session ? ` — session ${examen.session}` : "") +
      `\nTOTAL DU BARÈME : ${version.max_score} points, à répartir exactement.` +
      `\n\nCOMPÉTENCES AUTORISÉES (aucun autre code n'est accepté) :\n` +
      referentiel.map((c) => `- ${c.code} : ${c.libelle}${c.description ? ` — ${c.description}` : ""}`).join("\n") +
      (examen.consignes_correcteur ? `\n\nCONSIGNES DE L'ÉTABLISSEMENT :\n${examen.consignes_correcteur}` : "") +
      (body.consignes?.trim() ? `\n\nCONSIGNES POUR CE BARÈME :\n${body.consignes.trim()}` : "");

    const contenu: Record<string, unknown>[] = [{ type: "text", text: contexte }];
    if (pdfBase64) {
      contenu.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
      });
      contenu.push({
        type: "text",
        text: "Écris le barème de CE sujet, question par question, en suivant sa numérotation.",
      });
    } else {
      contenu.push({
        type: "text",
        text: `SUJET (texte)\n${texteSujet}\n\nÉcris le barème de ce sujet, question par question.`,
      });
    }

    const payload = await callAnthropic(apiKey, {
      model,
      max_tokens: 32000,
      system: CONSIGNE,
      messages: [{ role: "user", content: contenu }],
      output_config: { format: { type: "json_schema", schema: schemaProposition } },
    });

    const brut = JSON.parse(extractStructuredText(payload)) as {
      exercices: { code: string; titre: string }[];
      questions: QuestionProposee[];
      remarques: string[];
    };

    // ------------------------------------------------------------------
    // Nettoyage. Le modèle propose ; ce qui sort d'ici doit être saisissable
    // dans l'éditeur sans le casser. On ne corrige PAS les points : un total
    // faux doit rester visible à l'écran, c'est le contrôle qui compte.
    // ------------------------------------------------------------------
    const codesConnus = new Set(referentiel.map((c) => c.code));
    const remarques = [...(brut.remarques ?? [])];
    const cles = new Set<string>();

    const questions = (brut.questions ?? []).map((q, i) => {
      let cle = String(q.question_key ?? "").trim() || `q${i + 1}`;
      if (cles.has(cle)) cle = `${cle}_${i + 1}`;
      cles.add(cle);

      const inconnues = (q.competences ?? []).filter((c) => !codesConnus.has(c));
      if (inconnues.length) {
        remarques.push(
          `Question ${q.numero} : compétence(s) ${inconnues.join(", ")} hors référentiel, retirée(s). ` +
            `Choisis-en une dans la liste.`,
        );
      }
      const competences = (q.competences ?? []).filter((c) => codesConnus.has(c));

      const paliers = (q.paliers ?? [])
        .filter((p) => Number(p.points) > 0)
        .map((p) => ({
          libelle: String(p.libelle ?? "").trim(),
          points: arrondi(Number(p.points)),
          nature: ["resultat", "methode", "etape", "alternative", "bonus"].includes(p.nature)
            ? p.nature
            : "etape",
          cumulable: p.cumulable !== false,
          description: null,
        }))
        .filter((p) => p.libelle);

      const sommeCumulables = arrondi(
        paliers.filter((p) => p.cumulable).reduce((s, p) => s + p.points, 0),
      );
      const max = arrondi(Number(q.max_points ?? 0));
      if (sommeCumulables > max + 0.001) {
        remarques.push(
          `Question ${q.numero} : les paliers font ${sommeCumulables} points pour un maximum de ${max}. ` +
            `À rééquilibrer avant d'enregistrer.`,
        );
      }

      return {
        question_key: cle,
        numero: String(q.numero ?? i + 1),
        libelle: String(q.libelle ?? "").trim(),
        partie: null,
        exercice_code: String(q.exercice_code ?? "").trim() || null,
        ordre: i,
        max_points: max,
        reponse_attendue: String(q.reponse_attendue ?? "").trim() || null,
        raisonnement_attendu: String(q.raisonnement_attendu ?? "").trim() || null,
        etapes: (q.etapes as { libelle: string; points: number }[] ?? [])
          .filter((e) => e && String(e.libelle ?? "").trim())
          .map((e) => ({ libelle: String(e.libelle).trim(), points: arrondi(Number(e.points ?? 0)) })),
        reponses_equivalentes: ((q.reponses_equivalentes as string[]) ?? []).filter(Boolean),
        methodes_alternatives: [],
        erreurs_frequentes: [],
        unites_attendues: String(q.unites_attendues ?? "").trim() || null,
        precision_attendue: String(q.precision_attendue ?? "").trim() || null,
        conditions_hypotheses: null,
        calculatrice: ["autorisee", "interdite", "indifferent"].includes(String(q.calculatrice))
          ? String(q.calculatrice)
          : "indifferent",
        tolerances: String(q.tolerances ?? "").trim() || null,
        competences,
        codes_erreurs: [],
        depend_de: (q.depend_de ?? []).map(String),
        regle_non_double_sanction: null,
        regle_poursuite: null,
        regle_resultat_sans_justification: null,
        regle_raisonnement_juste_calcul_faux: null,
        criteres_relecture_humaine: String(q.criteres_relecture_humaine ?? "").trim() || null,
        paliers,
      };
    });

    // Une dépendance vers une question absente bloquerait le verrouillage.
    for (const q of questions) {
      const absentes = q.depend_de.filter((d) => !cles.has(d));
      if (absentes.length) {
        remarques.push(
          `Question ${q.numero} : dépendance vers ${absentes.join(", ")}, qui n'existe pas — retirée.`,
        );
      }
      q.depend_de = q.depend_de.filter((d) => cles.has(d));
    }

    const total = arrondi(questions.reduce((s, q) => s + q.max_points, 0));
    if (Math.abs(total - Number(version.max_score)) > 0.001) {
      remarques.push(
        `Le barème proposé totalise ${total} points au lieu de ${version.max_score} : ` +
          `ajuste les points avant d'enregistrer.`,
      );
    }

    const exercices = (brut.exercices ?? [])
      .filter((e) => String(e.code ?? "").trim())
      .map((e, i) => ({ code: String(e.code).trim(), titre: String(e.titre ?? "").trim() || null, ordre: i }));

    return jsonResponse({
      proposition: { exercices, questions },
      total,
      max_score: Number(version.max_score),
      remarques,
      source: pdfBase64 ? "pdf" : "texte",
      model_name: model,
    });
  } catch (err) {
    console.error("propose-bareme:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
