/**
 * DEUXIÈME LECTURE D'UNE COPIE PAR L'IA — matières sans prof relecteur.
 *
 * SES, HLP, LLCER anglais, SVT, physique-chimie (décision du 2026-09-29).
 * Appelée par le trigger `trg_relecture_ia` (SQL 58) dès qu'une correction
 * de ces matières passe de `correcting` à `corrected(_review)` : la copie est
 * alors mise en `queued_review`, et elle ne sera réputée corrigée — son
 * dossier ne partira — qu'après cette relecture.
 *
 * Ce que fait la fonction, dans l'ordre :
 *   1. relit sujet + transcription + grille (ou barème) + correction proposée ;
 *   2. un appel au MÊME modèle que la correction vérifie chaque critère
 *      (ou question) : preuve dans la copie, sévérité, lecture, cohérence ;
 *   3. applique les ajustements par le code (bornes, somme, contrôles) —
 *      `_shared/relecture-ia-noyau.ts`, testé hors ligne ;
 *   4. journalise dans `relectures_ia` ;
 *   5. règle du drapeau : plus de doute → `corrected` ; doute de correction
 *      → UNE recorrection complète ; sinon → file « à regarder par Cindy ».
 *
 * Limite des 150 s des Edge Functions : un seul appel au modèle, sortie
 * compacte, réflexion désactivée, et un délai de garde à 115 s qui retombe
 * proprement sur la file de Cindy plutôt que de laisser la copie bloquée.
 *
 * Déploiement : node scripts/deployer-edge.mjs review-copy \
 *   supabase/functions/_shared/relecture-ia-noyau.ts supabase/functions/_shared/bareme-noyau.ts
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  appliquerRelectureGrille,
  deciderSuite,
  motifEcart,
  motifsCitationsBareme,
  motifsDuRelecteur,
  motifsPremierPassage,
  motifsTranscription,
  natureMotifBareme,
  sortieDepuisRelecture,
  texteTranscription,
  UNITES_IA,
  type Changement,
  type MotifPersistant,
  type QuestionPremierPassage,
  type RelectureGrilleIA,
  type RelectureQuestion,
  type Suite,
} from "../_shared/relecture-ia-noyau.ts";
import {
  construireResultat,
  REGLES_TRANSVERSALES,
  type CompetenceReferentiel,
  type NiveauCompetence,
  type QuestionBareme,
  type ReponseQuestionIA,
} from "../_shared/bareme-noyau.ts";

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

/** Modèles qui acceptent `thinking: {type: "disabled"}`. */
const REFLEXION_DESACTIVABLE = /^claude-(sonnet-5|opus-5|opus-4-[678]|sonnet-4-6)$/;

/** Délai de garde : sous les 150 s de la plateforme, avec de la marge pour écrire. */
const DELAI_MODELE_MS = 115_000;

async function callAnthropic(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), DELAI_MODELE_MS);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controle.signal,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Erreur Claude ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload as Record<string, unknown>;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`Deuxième lecture trop longue (plus de ${DELAI_MODELE_MS / 1000} s) : abandonnée.`);
    }
    throw e;
  } finally {
    clearTimeout(minuterie);
  }
}

function extractStructuredText(payload: Record<string, unknown>): string {
  if (payload.stop_reason === "refusal") throw new Error("Le modèle a refusé la relecture.");
  if (payload.stop_reason === "max_tokens") throw new Error("Relecture tronquée (max_tokens atteint).");
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

/* ------------------------------------------------------------------ */
/*  Consignes                                                         */
/* ------------------------------------------------------------------ */

const CONSIGNE_COMMUNE = `Tu es le SECOND correcteur d'une copie de bac blanc. Un premier correcteur (une IA) a deja note la copie. AUCUN professeur ne relira apres toi : ta relecture est la derniere verification avant que la correction soit remise a l'eleve.

Ton role n'est pas de recorriger de zero ni d'etre original. Tu VERIFIES, point par point, que chaque point attribue ou retire est justifie par la copie, et tu rectifies ce qui ne l'est pas.

POUR CHAQUE CRITERE (OU QUESTION)
1. PREUVE. Les points gardes doivent s'appuyer sur un passage reel de la copie. Dans "citation", recopie MOT POUR MOT un extrait de la TRANSCRIPTION (5 a 25 mots, "…" pour couper) — jamais une paraphrase. Un point sans passage a l'appui se retire. Si le score est 0, la citation peut etre vide.
2. SEVERITE. Le premier correcteur note souvent trop severement. Identifie le palier de la grille qui decrit le mieux la copie TELLE QU'ELLE EST, en pensant a un eleve de terminale en conditions d'examen, pas a un corrige ideal. Une faiblesse ne se paie qu'une fois. Des points retires sans manque precis et visible dans la copie se rendent.
3. GENEROSITE. A l'inverse, des points donnes pour ce qui n'est pas dans la copie se retirent.
4. LECTURE. Une anomalie qui peut venir de la transcription (mot, chiffre, symbole, exposant mal lu, [illisible], [SCHEMA non transcrit]) n'est pas une faute de l'eleve : retiens la lecture la plus plausible et la plus favorable, et signale-la dans "lecture_douteuse" SEULEMENT si elle change la note.
5. Verdict "confirme" si tu gardes le score, "ajuste" sinon, avec un motif concret (ce qui est dans la copie, ce qui manque). Pas d'ajustement pour une nuance de moins d'un quart de point sur 20 : confirme.

DOUTES
- "motifs_premiere_lecture" : pour CHAQUE motif de relecture du premier correcteur (numerotes a partir de 0), dis s'il est leve par ta verification (resolu = true) et pourquoi. Un doute que tu ne peux pas trancher avec la transcription et le sujet reste non resolu.
- "doutes_persistants" : uniquement ce qu'un humain devrait vraiment trancher (une incertitude reelle sur la note), jamais des remarques pedagogiques. Laisse la liste vide si tu as pu tout verifier.

TU N'INVENTES RIEN : aucune valeur, aucun passage, aucune connaissance que la copie ne contient pas.`;

const CONSIGNE_GRILLE = `${CONSIGNE_COMMUNE}

COHERENCE
Si l'appreciation generale du premier correcteur contredit les scores apres ta relecture, reecris-la dans "appreciation_corrigee" (tutoiement, 3 a 5 phrases, meme ton). Sinon laisse ce champ vide.
"synthese" : 1 a 3 phrases pour l'equipe (pas pour l'eleve) : ce que tu as confirme, ce que tu as change, pourquoi.
Respecte l'ECHELLE de la grille (maximum de chaque critere) : un score ne depasse jamais le maximum du critere.`;

function consigneBareme(): string {
  const regles = REGLES_TRANSVERSALES.map((r) => `- ${r.titre} : ${r.texte}`).join("\n");
  return `${CONSIGNE_COMMUNE}

CETTE EPREUVE SE NOTE AU BAREME DU SUJET, QUESTION PAR QUESTION
Le score d'une question ne depasse jamais son maximum. Regles transversales, a appliquer strictement :
${regles}

POUR CHAQUE QUESTION, en plus du score :
- "relecture_humaine" : true seulement si, APRES ta verification, un humain doit encore trancher cette question ;
- "transcription_incertaine" : true si la lecture de la reponse est douteuse ET que cela change les points ;
- "methode_alternative_validee" : true si le premier correcteur a signale une methode hors bareme et que tu la juges mathematiquement/scientifiquement valide (tu en attribues alors les points). false sinon.
"appreciation_corrigee" et "synthese" : comme pour une grille (vide si l'appreciation reste juste).`;
}

/* ------------------------------------------------------------------ */
/*  Schémas de sortie                                                 */
/* ------------------------------------------------------------------ */

const SCHEMA_MOTIFS = {
  type: "array",
  items: {
    type: "object",
    properties: {
      index: { type: "integer" },
      resolu: { type: "boolean" },
      explication: { type: "string" },
    },
    required: ["index", "resolu", "explication"],
    additionalProperties: false,
  },
};

const CHAMPS_COMMUNS = {
  motifs_premiere_lecture: SCHEMA_MOTIFS,
  doutes_persistants: { type: "array", items: { type: "string" } },
  lecture_douteuse: { type: "array", items: { type: "string" } },
  appreciation_corrigee: { type: "string" },
  synthese: { type: "string" },
  confiance: { type: "number" },
};
const REQUIS_COMMUNS = Object.keys(CHAMPS_COMMUNS);

function schemaGrille(codes: string[]) {
  return {
    type: "object",
    properties: {
      criteres: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string", enum: codes },
            verdict: { type: "string", enum: ["confirme", "ajuste"] },
            score: { type: "number" },
            citation: { type: "string" },
            motif: { type: "string" },
          },
          required: ["code", "verdict", "score", "citation", "motif"],
          additionalProperties: false,
        },
      },
      ...CHAMPS_COMMUNS,
    },
    required: ["criteres", ...REQUIS_COMMUNS],
    additionalProperties: false,
  };
}

function schemaBareme(cles: string[]) {
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_key: { type: "string", enum: cles },
            verdict: { type: "string", enum: ["confirme", "ajuste"] },
            score: { type: "number" },
            citation: { type: "string" },
            motif: { type: "string" },
            relecture_humaine: { type: "boolean" },
            transcription_incertaine: { type: "boolean" },
            methode_alternative_validee: { type: "boolean" },
          },
          required: [
            "question_key", "verdict", "score", "citation", "motif",
            "relecture_humaine", "transcription_incertaine", "methode_alternative_validee",
          ],
          additionalProperties: false,
        },
      },
      ...CHAMPS_COMMUNS,
    },
    required: ["questions", ...REQUIS_COMMUNS],
    additionalProperties: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Fonction                                                          */
/* ------------------------------------------------------------------ */

type Supa = ReturnType<typeof createClient>;

/** Ce que la relecture a produit, quel que soit le moteur. */
type Issue = {
  resultat: Record<string, unknown>;
  changements: Changement[];
  motifs: MotifPersistant[];
  noteAvant: number;
  noteApres: number;
  bareme: number;
  synthese: string;
  /** Écritures propres au barème, faites seulement si la relecture aboutit. */
  ecrireQuestions?: () => Promise<void>;
};

async function relireGrille(
  supabase: Supa,
  correction: Record<string, unknown>,
  transcription: Record<string, unknown>,
  forcee: boolean,
  appel: (system: string, dossier: string, copie: string, schema: unknown) => Promise<Record<string, unknown>>,
): Promise<Issue> {
  const [rubricRes, sujetRes] = await Promise.all([
    supabase.from("rubrics").select("rubric_json, system_prompt").eq("id", correction.rubric_id).single(),
    supabase.from("subject_cards").select("card_json").eq("id", correction.subject_id).maybeSingle(),
  ]);
  if (rubricRes.error || !rubricRes.data) throw new Error("Grille introuvable pour la relecture.");
  const rubricJson = rubricRes.data.rubric_json as Record<string, unknown>;
  const codes = ((rubricJson.criteria ?? []) as { code?: unknown }[]).map((c) => String(c.code ?? ""));
  if (!codes.length) throw new Error("La grille n'a aucun critère.");

  const premier = correction.result_json as Record<string, unknown>;
  const motifsInitiaux = motifsPremierPassage(premier);

  const system = CONSIGNE_GRILLE +
    "\n\nEXPERTISE DE LA MATIERE (consigne du premier correcteur, echelle comprise)\n" +
    String(rubricRes.data.system_prompt ?? "");
  const dossier = "SUJET ET GRILLE\n" + JSON.stringify({
    sujet: (sujetRes.data as { card_json?: unknown } | null)?.card_json ?? null,
    grille: rubricJson,
  });
  const copie =
    "TRANSCRIPTION DE LA COPIE\n" + JSON.stringify(transcription) +
    "\n\nCORRECTION PROPOSEE PAR LE PREMIER CORRECTEUR\n" + JSON.stringify({
      note_finale: premier.note_finale,
      appreciation_generale: premier.appreciation_generale,
      criteria: premier.criteria,
      detected_errors: premier.detected_errors,
    }) +
    "\n\nMOTIFS DE RELECTURE DU PREMIER CORRECTEUR (numerotes)\n" +
    JSON.stringify(motifsInitiaux.map((m, index) => ({ index, motif: m }))) +
    "\n\nVerifie chaque critere et renvoie ta relecture conforme au schema.";

  const relecture = await appel(system, dossier, copie, schemaGrille(codes)) as unknown as RelectureGrilleIA;
  const r = appliquerRelectureGrille({
    resultat: premier,
    rubricJson,
    relecture,
    transcription,
    transcriptionForcee: forcee,
  });
  return { ...r, synthese: String(relecture.synthese ?? "") };
}

async function relireBareme(
  supabase: Supa,
  correction: Record<string, unknown>,
  transcription: Record<string, unknown>,
  forcee: boolean,
  appel: (system: string, dossier: string, copie: string, schema: unknown) => Promise<Record<string, unknown>>,
): Promise<Issue> {
  const premier = correction.result_json as Record<string, unknown>;
  const versionId = String(premier.bareme_version_id ?? correction.bareme_version_id ?? "");
  if (!versionId) throw new Error("Version de barème introuvable pour la relecture.");

  const { data: version } = await supabase.from("bareme_versions").select("*").eq("id", versionId).single();
  if (!version) throw new Error("Version de barème introuvable.");
  const { data: exam } = await supabase.from("exams").select("*").eq("id", version.exam_id).single();

  const [questionsRes, refRes] = await Promise.all([
    supabase.from("bareme_questions").select("*").eq("bareme_version_id", versionId).order("ordre"),
    supabase.from("competence_referentiels").select("code, libelle, toujours_mobilisee")
      .eq("matiere", version.matiere).order("ordre"),
  ]);
  const lignes = (questionsRes.data ?? []) as (QuestionBareme & Record<string, unknown> & { id: string })[];
  if (!lignes.length) throw new Error("Barème sans question.");
  const { data: paliers } = await supabase.from("bareme_awards").select("*")
    .in("question_id", lignes.map((q) => q.id)).order("ordre");

  const premieres = (premier.questions ?? []) as QuestionPremierPassage[];
  const motifsInitiaux = motifsPremierPassage(premier);

  const dossier = "SUJET, CORRIGE ET BAREME\n" + JSON.stringify({
    sujet_texte: exam?.sujet_texte ?? null,
    corrige_texte: exam?.corrige_texte ?? null,
    max_score: Number(version.max_score),
    questions: lignes.map((q) => ({
      question_key: q.question_key,
      numero: q.numero,
      libelle: q.libelle,
      max_points: Number(q.max_points),
      reponse_attendue: q.reponse_attendue,
      raisonnement_attendu: q.raisonnement_attendu,
      etapes_valorisees: q.etapes,
      paliers_de_points: ((paliers ?? []) as { question_id: string }[]).filter((p) => p.question_id === q.id),
      reponses_equivalentes: q.reponses_equivalentes,
      methodes_alternatives: q.methodes_alternatives,
    })),
  });
  const copie =
    "TRANSCRIPTION DE LA COPIE\n" + JSON.stringify(transcription) +
    "\n\nCORRECTION PROPOSEE PAR LE PREMIER CORRECTEUR (question par question)\n" +
    JSON.stringify({
      appreciation_generale: premier.appreciation_generale,
      questions: premieres.map((q) => ({
        question_key: q.question_key,
        points: q.points,
        max_points: q.max_points,
        elements_observes: q.elements_observes,
        elements_manquants: q.elements_manquants,
        erreurs: q.erreurs,
        preuves: q.preuves,
        methode_alternative: q.methode_alternative,
        relecture_humaine: q.relecture_humaine,
      })),
    }) +
    "\n\nMOTIFS DE RELECTURE DU PREMIER CORRECTEUR (numerotes)\n" +
    JSON.stringify(motifsInitiaux.map((m, index) => ({ index, motif: m }))) +
    "\n\nVerifie chaque question et renvoie ta relecture conforme au schema.";

  const relecture = await appel(consigneBareme(), dossier, copie, schemaBareme(lignes.map((q) => q.question_key))) as
    unknown as { questions: RelectureQuestion[] } & RelectureGrilleIA;

  const { sortie, changements, nonRelues } = sortieDepuisRelecture(premieres, relecture.questions ?? []);
  const noteAvant = Math.round(premieres.reduce((s, q) => s + Number(q.points ?? 0), 0) * 100) / 100;
  const bareme = Number(version.max_score);

  const resultat = construireResultat({
    examId: version.exam_id,
    rubricId: (premier.rubric_id as string | null) ?? null,
    baremeVersionId: versionId,
    version: version.version,
    bareme: lignes.map((q) => ({
      question_key: q.question_key,
      numero: q.numero,
      libelle: q.libelle,
      max_points: Number(q.max_points),
      competences: (q.competences ?? []) as string[],
      codes_erreurs: (q.codes_erreurs ?? []) as string[],
      depend_de: (q.depend_de ?? []) as string[],
      methodes_alternatives: (q.methodes_alternatives ?? []) as unknown[],
      reponse_attendue: q.reponse_attendue,
      raisonnement_attendu: q.raisonnement_attendu,
      etapes: (q.etapes ?? []) as unknown[],
      regle_poursuite: q.regle_poursuite,
      regle_non_double_sanction: q.regle_non_double_sanction,
    })),
    sortie: sortie as unknown as ReponseQuestionIA[],
    referentiel: (refRes.data ?? []) as CompetenceReferentiel[],
    maxBareme: bareme,
    confiance: Number(relecture.confiance ?? 1),
    transcription: {
      overall_confidence: forcee ? 1 : Number(transcription.overall_confidence ?? 1),
      requires_human_review: forcee ? false : transcription.requires_human_review === true,
    },
    profilPropose: (premier.competency_profile ?? {}) as Record<string, NiveauCompetence>,
    conseils: (premier.priority_feedback ?? []) as string[],
    appreciation: String(relecture.appreciation_corrigee ?? "").trim() ||
      String(premier.appreciation_generale ?? ""),
    baremeVerrouille: version.statut === "locked",
    baremeCalibre: Boolean((premier.calibration_metadata as { rubric_calibrated?: boolean } | undefined)?.rubric_calibrated),
    etalonsCompares: Number((premier.calibration_metadata as { etalons_compares?: number } | undefined)?.etalons_compares ?? 0),
  });

  // Les motifs du noyau (double sanction, zéro d'office…) ont déjà rejoué
  // les règles du barème ; la transcription est traitée à part pour que
  // « Cindy a forcé la lecture » soit respecté.
  const motifs: MotifPersistant[] = resultat.human_review_reasons
    .filter((m) => !(forcee && m.code === "transcription_incertaine" && !m.question_key))
    .map((m) => ({
      nature: natureMotifBareme(m.code),
      code: m.code,
      cible: m.question_key,
      message: m.message,
    }));
  for (const cle of nonRelues) {
    motifs.push({ nature: "correction", code: "question_non_relue", cible: cle,
      message: `Question ${cle} : la deuxième lecture ne l'a pas vérifiée.` });
  }
  const texte = texteTranscription(transcription);
  motifs.push(...motifsCitationsBareme(resultat.questions, texte, bareme));
  // Doutes du premier passage : le noyau les a déjà rejoués question par
  // question ; seuls les doutes et lectures douteuses du relecteur s'ajoutent.
  motifs.push(...motifsDuRelecteur([], relecture));
  motifs.push(...motifsTranscription(transcription, forcee).filter((m) =>
    !motifs.some((x) => x.nature === "transcription" && !x.cible)
  ));
  motifs.push(...motifEcart(noteAvant, resultat.score_raw, bareme));

  const flag = motifs.length > 0;
  const resultatFinal = {
    ...resultat,
    human_review_required: flag,
    human_review_reasons: motifs.map((m) => ({ code: m.code, question_key: m.cible, message: m.message })),
  };

  return {
    resultat: resultatFinal as unknown as Record<string, unknown>,
    changements,
    motifs,
    noteAvant,
    noteApres: resultat.score_raw,
    bareme,
    synthese: String(relecture.synthese ?? ""),
    ecrireQuestions: async () => {
      await supabase.from("correction_questions").delete().eq("correction_id", correction.id);
      const { error } = await supabase.from("correction_questions").insert(
        resultat.questions.map((q) => ({
          correction_id: correction.id,
          bareme_version_id: versionId,
          question_key: q.question_key,
          points: q.points,
          max_points: q.max_points,
          elements_observes: q.elements_observes,
          elements_manquants: q.elements_manquants,
          erreurs: q.erreurs,
          preuves: q.preuves,
          transcription_incertaine: q.transcription_incertaine,
          relecture_humaine: q.relecture_humaine,
          motifs_relecture: q.motifs_relecture,
          competences: q.competences,
          poursuite_depuis: q.poursuite_depuis,
          methode_alternative: q.methode_alternative,
        })),
      );
      if (error) throw new Error(`Enregistrement des questions relues : ${error.message}`);
      await supabase.from("relectures_humaines").delete().eq("correction_id", correction.id).eq("statut", "ouverte");
      if (motifs.length) {
        await supabase.from("relectures_humaines").insert(motifs.map((m) => ({
          correction_id: correction.id,
          question_key: m.cible ?? null,
          code_motif: m.code,
          motif: m.message,
        })));
      }
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, 405);

  const denied = assertInternalSecret(req);
  if (denied) return denied;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getSupabaseSecretKey(), {
    auth: { persistSession: false },
  });

  let correctionId = "";
  let correction: Record<string, unknown> | null = null;
  let passe = 0;
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";

  try {
    const body = await req.json();
    correctionId = String(body.correction_id ?? "");
    if (!correctionId) return jsonResponse({ error: "correction_id est obligatoire." }, 400);

    const { data, error } = await supabase.from("corrections").select("*").eq("id", correctionId).single();
    if (error || !data) return jsonResponse({ error: "Correction introuvable.", details: error }, 404);
    correction = data as Record<string, unknown>;

    if (!["queued_review", "reviewing"].includes(String(correction.status))) {
      return jsonResponse({ error: `Copie en « ${correction.status} » : pas de deuxième lecture à faire.` }, 409);
    }
    if (!correction.result_json) throw new Error("Aucune correction à relire.");

    const { data: tRow } = await supabase.from("copy_transcriptions")
      .select("transcription_json").eq("correction_id", correctionId).single();
    if (!tRow) throw new Error("Aucune transcription : impossible de vérifier les citations.");
    const transcription = tRow.transcription_json as Record<string, unknown>;
    const forcee = transcription.transcription_forcee === true;

    passe = Number(correction.ia_relectures ?? 0) + 1;
    await supabase.from("corrections").update({
      status: "reviewing",
      ia_relectures: passe,
      updated_at: new Date().toISOString(),
    }).eq("id", correctionId);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY n’est pas configuré.");

    let usage: unknown = null;
    const appel = async (system: string, dossier: string, copie: string, schema: unknown) => {
      const payload = await callAnthropic(apiKey, {
        model, // le MÊME modèle que la correction (secret ANTHROPIC_MODEL)
        max_tokens: 16000,
        // Réflexion coupée + effort moyen : réglage déjà éprouvé dans ce
        // pipeline pour tenir sous les 150 s (correct-copy-redigee, generate-dossier).
        // Les modèles récents refusent `disabled` (400) : on s'en passe alors.
        ...(REFLEXION_DESACTIVABLE.test(model) ? { thinking: { type: "disabled" } } : {}),
        system,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: dossier, cache_control: { type: "ephemeral", ttl: "1h" } },
            { type: "text", text: copie },
          ],
        }],
        output_config: { effort: "medium", format: { type: "json_schema", schema } },
      });
      usage = payload.usage ?? null;
      return JSON.parse(extractStructuredText(payload)) as Record<string, unknown>;
    };

    const issue = correction.moteur === "bareme_sujet"
      ? await relireBareme(supabase, correction, transcription, forcee, appel)
      : await relireGrille(supabase, correction, transcription, forcee, appel);

    // --- Règle du drapeau ---------------------------------------------
    const recorrectionsFaites = Number(correction.ia_recorrections ?? 0);
    let decision = deciderSuite({ motifs: issue.motifs, recorrectionsFaites, budgetDisponible: true });
    if (decision.suite === "recorriger") {
      const { data: b } = await supabase.rpc("ia_budget_consommer", {
        p_nature: "recorrection", p_unites: UNITES_IA.recorrection,
        p_correction_id: correctionId, p_source: "review-copy",
      });
      if (!(b as { ok?: boolean } | null)?.ok) {
        decision = deciderSuite({ motifs: issue.motifs, recorrectionsFaites, budgetDisponible: false });
      }
    }

    if (issue.ecrireQuestions) await issue.ecrireQuestions();

    const resultat = {
      ...issue.resultat,
      relecture_ia: {
        passe,
        verdict: issue.changements.length ? "ajustee" : "confirmee",
        note_premiere_lecture: issue.noteAvant,
        note_apres_relecture: issue.noteApres,
        bareme: issue.bareme,
        changements: issue.changements,
        doutes_restants: issue.motifs,
        suite: decision.suite,
        raison: decision.raison,
        synthese: issue.synthese,
        modele: model,
        le: new Date().toISOString(),
      },
    };

    await supabase.from("relectures_ia").insert({
      correction_id: correctionId,
      passe,
      matiere: correction.matiere ?? null,
      moteur: correction.moteur ?? null,
      verdict: issue.changements.length ? "ajustee" : "confirmee",
      note_avant: issue.noteAvant,
      note_apres: issue.noteApres,
      bareme: issue.bareme,
      changements: issue.changements,
      motifs_persistants: issue.motifs,
      suite: decision.suite,
      raison: decision.raison,
      synthese: issue.synthese,
      modele: model,
      usage,
    });

    const maintenant = new Date().toISOString();
    const commun = { result_json: resultat, processing_error: null, updated_at: maintenant };
    let suite: Suite = decision.suite;

    if (suite === "recorriger") {
      const fonction = correction.moteur === "bareme_sujet" ? "correct-copy-bareme" : "correct-french-copy";
      await supabase.from("corrections").update({
        ...commun,
        status: "queued_correction",
        ia_recorrections: recorrectionsFaites + 1,
        human_review_required: true,
      }).eq("id", correctionId);
      const { error: errInv } = await supabase.rpc("pipeline_invoquer_ia", {
        p_fonction: fonction, p_correction_id: correctionId,
      });
      if (errInv) suite = "file_cindy"; // l'appel n'est pas parti : on ne laisse pas la copie en l'air
    }

    if (suite === "terminer") {
      await supabase.from("corrections").update({
        ...commun,
        status: "corrected",
        human_review_required: false,
        a_regarder_cindy: false,
      }).eq("id", correctionId);
    } else if (suite === "file_cindy") {
      await supabase.from("corrections").update({
        ...commun,
        status: "corrected_review",
        human_review_required: true,
        a_regarder_cindy: true,
        a_regarder_depuis: maintenant,
        a_regarder_vu_le: null,
        a_regarder_vu_par: null,
        a_regarder_motifs: issue.motifs.length
          ? issue.motifs
          : [{ nature: "systeme", code: "relance_impossible", message: decision.raison }],
      }).eq("id", correctionId);
    }

    return jsonResponse({
      ok: true,
      correction_id: correctionId,
      passe,
      suite,
      note_avant: issue.noteAvant,
      note_apres: issue.noteApres,
      changements: issue.changements.length,
      doutes: issue.motifs.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Échec de la relecture : la correction du premier passage reste en
    // place, et la copie part chez Cindy — jamais bloquée en silence.
    if (correctionId && correction) {
      try {
        await supabase.from("relectures_ia").insert({
          correction_id: correctionId,
          passe: passe || Number(correction.ia_relectures ?? 0) + 1,
          matiere: correction.matiere ?? null,
          moteur: correction.moteur ?? null,
          verdict: "echec",
          suite: "file_cindy",
          erreur: message,
          modele: model,
        });
        await supabase.from("corrections").update({
          status: "corrected_review",
          human_review_required: true,
          a_regarder_cindy: true,
          a_regarder_depuis: new Date().toISOString(),
          a_regarder_vu_le: null,
          a_regarder_vu_par: null,
          a_regarder_motifs: [{ nature: "systeme", code: "relecture_en_echec",
            message: `La deuxième lecture a échoué : ${message}` }],
          processing_error: message,
          updated_at: new Date().toISOString(),
        }).eq("id", correctionId);
      } catch (_) {
        // La réponse d'erreur principale reste prioritaire.
      }
    }
    return jsonResponse({ error: message }, 500);
  }
});
