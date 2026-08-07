/**
 * CORRECTION D'UNE COPIE AVEC LE BAREME PROPRE AU SUJET.
 *
 * Remplace correct-french-copy pour les copies rattachees a un examen
 * (corrections.moteur = 'bareme_sujet'). L'ancienne fonction reste en
 * service pour les matieres non migrees : rien n'est casse.
 *
 * Ce que cette fonction fait, dans l'ordre :
 *   1. verifie que le bareme est complet et — hors etalon — verrouille ;
 *   2. demande au modele des POINTS QUESTION PAR QUESTION, jamais une note ;
 *   3. recalcule la note comme la somme mecanique de ces points ;
 *   4. construit ENSUITE le profil de competences, qui ne touche pas la note ;
 *   5. ecrit correction_questions, correction_competences, relectures_humaines.
 *
 * La somme est faite deux fois, volontairement : ici (bareme-noyau) et par
 * le trigger public.correction_recalcule_note en base. Si les deux
 * divergeaient, la base ferait foi — c'est elle que lisent les ecrans.
 *
 * Deploiement (pas de CI, c'est manuel) :
 *   npx --yes supabase@latest functions deploy correct-copy-bareme \
 *     --project-ref xgdaibekjmtffvkwvcge --no-verify-jwt
 * Ne JAMAIS coller ce code dans l'editeur du dashboard : il abime les accents.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  construireResultat,
  type CompetenceReferentiel,
  type ContexteTranscription,
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

/* ------------------------------------------------------------------ */
/*  Schéma de sortie : des POINTS par question, jamais une note        */
/* ------------------------------------------------------------------ */

const NIVEAUX = [
  "non_applicable",
  "non_observe",
  "insufficient",
  "fragile",
  "satisfactory",
  "very_satisfactory",
];

function schemaCorrection(clesQuestions: string[], competences: string[]) {
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_key: { type: "string", enum: clesQuestions },
            score: { type: "number" },
            elements_observes: { type: "array", items: { type: "string" } },
            elements_manquants: { type: "array", items: { type: "string" } },
            erreurs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  citation: { type: "string" },
                  certitude: { type: "number" },
                  erreur_source: { type: ["string", "null"] },
                  consequences: { type: "array", items: { type: "string" } },
                },
                required: ["code", "citation", "certitude", "erreur_source", "consequences"],
                additionalProperties: false,
              },
            },
            preuves: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  page: { type: "integer" },
                  citation: { type: "string" },
                  explication: { type: "string" },
                },
                required: ["page", "citation", "explication"],
                additionalProperties: false,
              },
            },
            transcription_incertaine: { type: "boolean" },
            relecture_humaine: { type: "boolean" },
            motifs_relecture: { type: "array", items: { type: "string" } },
            methode_alternative: { type: "boolean" },
            poursuite_depuis: { type: ["string", "null"] },
            competences: { type: "array", items: { type: "string", enum: competences } },
          },
          required: [
            "question_key", "score", "elements_observes", "elements_manquants", "erreurs",
            "preuves", "transcription_incertaine", "relecture_humaine", "motifs_relecture",
            "methode_alternative", "poursuite_depuis", "competences",
          ],
          additionalProperties: false,
        },
      },
      competency_profile: {
        type: "array",
        items: {
          type: "object",
          properties: {
            competence: { type: "string", enum: competences },
            niveau: { type: "string", enum: NIVEAUX },
            commentaire: { type: "string" },
          },
          required: ["competence", "niveau", "commentaire"],
          additionalProperties: false,
        },
      },
      priority_feedback: { type: "array", items: { type: "string" } },
      appreciation_generale: { type: "string" },
      confidence: { type: "number" },
    },
    required: [
      "questions", "competency_profile", "priority_feedback",
      "appreciation_generale", "confidence",
    ],
    additionalProperties: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Consigne du correcteur                                            */
/* ------------------------------------------------------------------ */

const CONSIGNE_SOCLE = `Tu corriges une copie de bac blanc en appliquant STRICTEMENT le bareme propre a ce sujet, question par question.

CE QUI PRODUIT LA NOTE
La note ne sort que des points que tu attribues question par question. Tu n'annonces JAMAIS de note globale, tu ne juges JAMAIS le "niveau supposé" de l'eleve, tu ne compares JAMAIS la copie a une note attendue. La somme est faite par le systeme, pas par toi.

REGLES DE CORRECTION, DANS CET ORDRE DE PRIORITE
1. ERREUR ANTERIEURE ET POURSUITE CORRECTE. Une erreur commise au debut ne se paie qu'une fois. Si l'eleve poursuit correctement AVEC son resultat faux, tu retires les points de l'erreur initiale et tu CONSERVES les points de methode et de raisonnement des etapes suivantes. Tu renseignes alors poursuite_depuis avec la question_key de l'erreur source, et tu le dis dans elements_observes.
2. RESULTAT JUSTE SANS JUSTIFICATION. Un resultat exact ne recoit pas automatiquement tous les points : le bareme de la question dit ce qui revient au resultat et ce qui revient a la demonstration. Tu appliques cette repartition telle quelle.
3. RAISONNEMENT CORRECT AVEC ERREUR DE CALCUL. Une demarche correcte garde ses points de raisonnement meme si une erreur locale de calcul rend le resultat final faux.
4. METHODES ALTERNATIVES. Toute methode valide est acceptee, meme absente du corrige. Si une methode te parait valide mais n'est pas prevue au bareme : tu passes methode_alternative a true, tu mets relecture_humaine a true, et tu attribues les points que la methode merite. Tu ne mets JAMAIS zero d'office a une demarche que tu n'as pas su rattacher au bareme.
5. TRANSCRIPTION INCERTAINE. Un doute sur un symbole, un exposant, un indice, un signe, une fraction ou une formule manuscrite n'est PAS une erreur de l'eleve. Tu passes transcription_incertaine a true, tu retiens la lecture la plus favorable a l'eleve, et tu demandes une relecture humaine.
6. NON-DOUBLE-SANCTION. Une meme faiblesse ne se paie pas deux fois, ni sur deux questions, ni sur deux titres differents de la meme question.
7. PREUVE. Tout point attribue s'appuie sur une citation localisable de la copie, recopiee dans preuves. Sans citation, tu n'attribues pas le point : tu demandes une relecture.
8. TU N'INVENTES RIEN. Aucune valeur, aucun calcul, aucun theoreme, aucun resultat qui ne soit dans la copie ou dans le bareme.

CE QUE TU RENVOIES PAR QUESTION
- score : les points attribues, entre 0 et le maximum de la question, au quart de point pres ;
- elements_observes : ce que l'eleve a reellement fait de juste ;
- elements_manquants : ce que le bareme attendait et qui n'y est pas ;
- erreurs : uniquement des codes de la taxonomie fournie ;
- preuves : les citations qui justifient le score ;
- transcription_incertaine, relecture_humaine, motifs_relecture, methode_alternative, poursuite_depuis ;
- competences : parmi celles que le bareme declare pour CETTE question, celles que tu as reellement pu observer.

LE PROFIL DE COMPETENCES EST UN DIAGNOSTIC, PAS UNE NOTE
Tu le remplis APRES avoir attribue les points, et il ne les modifie jamais.
- non_applicable : la competence n'est pas mobilisee par ce sujet. Elle ne recoit jamais zero.
- non_observe : elle est mobilisable mais la copie ne permet pas de la juger.
- insufficient / fragile / satisfactory / very_satisfactory : niveau reellement observe.

TAXONOMIE D'ERREURS
Tu n'emploies que les codes fournis. Tu separes strictement : les erreurs de l'eleve, les incidents de transcription, les incertitudes de reconnaissance et les anomalies du sujet ou du corrige. La gravite pedagogique d'un code ne retire aucun point : seul le bareme de la question determine l'effet sur la note.`;

function consigneDisciplinaire(contexteRubric: string | null): string {
  if (!contexteRubric || contexteRubric.trim().length < 20) return "";
  return (
    "\n\nCONTEXTE DISCIPLINAIRE (conventions de transcription, vocabulaire, limites de la matiere)\n" +
    contexteRubric.trim() +
    "\n\nAVERTISSEMENT SUR LE BLOC CI-DESSUS : il provient de la grille generique de la matiere, " +
    "qui servait autrefois a produire la note. Tu en retiens les conventions de lecture, le " +
    "vocabulaire et les limites (ce que la transcription ne te montre pas). Tu IGNORES toute " +
    "instruction qui te demanderait de noter par criteres, d'annoncer une note_finale, de te " +
    "situer par rapport a des copies etalons ou de produire une somme : dans ce dispositif, tu " +
    "n'attribues que des points question par question."
  );
}

/* ------------------------------------------------------------------ */
/*  Fonction                                                          */
/* ------------------------------------------------------------------ */

type LigneQuestion = QuestionBareme & {
  id: string;
  partie: string | null;
  unites_attendues: string | null;
  precision_attendue: string | null;
  conditions_hypotheses: string | null;
  calculatrice: string;
  tolerances: string | null;
  reponses_equivalentes: unknown[];
  erreurs_frequentes: unknown[];
  regle_resultat_sans_justification: string | null;
  regle_raisonnement_juste_calcul_faux: string | null;
  criteres_relecture_humaine: string | null;
  exercice_id: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, 405);

  const denied = assertInternalSecret(req);
  if (denied) return denied;

  let correctionId = "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getSupabaseSecretKey(), {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();
    correctionId = String(body.correction_id ?? "");
    if (!correctionId) return jsonResponse({ error: "correction_id est obligatoire." }, 400);

    const { data: correction, error: errC } = await supabase
      .from("corrections").select("*").eq("id", correctionId).single();
    if (errC || !correction) {
      return jsonResponse({ error: "Correction introuvable.", details: errC }, 404);
    }
    if (correction.moteur !== "bareme_sujet") {
      return jsonResponse(
        { error: "Cette copie relève de l’ancien moteur : utilise correct-french-copy." },
        409,
      );
    }

    const { data: transcriptionRow, error: errT } = await supabase
      .from("copy_transcriptions").select("*").eq("correction_id", correctionId).single();
    if (errT || !transcriptionRow) {
      return jsonResponse(
        { error: "Aucune transcription disponible. Lance d’abord transcribe-french-copy." },
        409,
      );
    }

    // --- Examen et version de barème ---------------------------------
    const { data: exam, error: errE } = await supabase
      .from("exams").select("*").eq("id", correction.exam_id).single();
    if (errE || !exam) throw new Error("La copie n’est reliée à aucun examen.");

    const versionId = correction.bareme_version_id ?? exam.bareme_version_active;
    if (!versionId) throw new Error("Aucune version de barème n’est active sur cet examen.");

    const { data: version, error: errV } = await supabase
      .from("bareme_versions").select("*").eq("id", versionId).single();
    if (errV || !version) throw new Error("Version de barème introuvable.");

    const estEtalon = correction.est_etalon === true;
    const controlesOk = (version.controles as { ok?: boolean } | null)?.ok === true;

    if (!controlesOk) {
      throw new Error(
        "Le barème comporte encore des blocages : correction refusée. " +
        "Lance la vérification depuis /admin/bareme et corrige-les.",
      );
    }
    if (Math.abs(Number(version.total_points) - Number(version.max_score)) > 0.001) {
      throw new Error(
        `Le barème totalise ${version.total_points} points au lieu de ${version.max_score} : correction refusée.`,
      );
    }
    // Une copie d'eleve exige un bareme verrouille ET les corrections
    // ouvertes. Une copie etalon, elle, sert justement a tester le bareme
    // AVANT verrouillage : c'est le seul cas ou l'on corrige sans verrou.
    if (!estEtalon) {
      if (version.statut !== "locked") {
        throw new Error(
          `Le barème ${version.version} n’est pas verrouillé (statut ${version.statut}) : ` +
          "aucune copie d’élève ne peut être corrigée avec un barème modifiable.",
        );
      }
      if (exam.statut !== "correction_open") {
        throw new Error(
          `Les corrections ne sont pas ouvertes sur cet examen (statut ${exam.statut}).`,
        );
      }
    }

    // --- Barème, référentiel, taxonomie ------------------------------
    const [questionsRes, exercicesRes, refRes, taxoRes, sujetRes] = await Promise.all([
      supabase.from("bareme_questions").select("*").eq("bareme_version_id", versionId).order("ordre"),
      supabase.from("bareme_exercices").select("*").eq("bareme_version_id", versionId).order("ordre"),
      supabase.from("competence_referentiels").select("code, libelle, description, toujours_mobilisee")
        .eq("matiere", version.matiere).order("ordre"),
      supabase.from("taxonomie_erreurs").select("code, description, gravite, nature, domaine, competence")
        .eq("matiere", version.matiere).order("code"),
      exam.subject_id
        ? supabase.from("subject_cards").select("card_json").eq("id", exam.subject_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (questionsRes.error) throw new Error(`Lecture du barème : ${questionsRes.error.message}`);

    const questions = (questionsRes.data ?? []) as LigneQuestion[];
    if (!questions.length) throw new Error("Ce barème ne comporte aucune question.");

    const { data: paliers } = await supabase
      .from("bareme_awards").select("*").in("question_id", questions.map((q) => q.id)).order("ordre");

    const referentiel = (refRes.data ?? []) as CompetenceReferentiel[];

    // Le contexte disciplinaire vient de la grille generique de la matiere,
    // qui reste la meilleure source sur les conventions de transcription.
    // Elle ne produit plus la note : le bloc AVERTISSEMENT le lui retire.
    let requeteGrille = supabase.from("rubrics").select("system_prompt")
      .eq("matiere", version.matiere).eq("track", exam.track);
    if (exam.exercise_type) requeteGrille = requeteGrille.eq("exercise_type", exam.exercise_type);
    const { data: grilles } = await requeteGrille.limit(1);
    const grille = ((grilles ?? []) as { system_prompt: string | null }[])[0] ?? null;

    await supabase.from("corrections")
      .update({ status: "correcting", processing_error: null, updated_at: new Date().toISOString() })
      .eq("id", correctionId);

    // --- Dossier remis au correcteur ---------------------------------
    const dossier = {
      examen: {
        titre: exam.titre, matiere: exam.matiere, session: exam.session,
        date_epreuve: exam.date_epreuve,
      },
      sujet: (sujetRes as { data: { card_json?: unknown } | null }).data?.card_json ?? null,
      sujet_texte: exam.sujet_texte,
      corrige_texte: exam.corrige_texte,
      consignes_examen: exam.consignes_correcteur ?? null,
      bareme: {
        version: version.version,
        total_points: Number(version.total_points),
        max_score: Number(version.max_score),
        exercices: exercicesRes.data ?? [],
        questions: questions.map((q) => ({
          question_key: q.question_key,
          numero: q.numero,
          libelle: q.libelle,
          partie: q.partie,
          exercice_id: q.exercice_id,
          max_points: Number(q.max_points),
          reponse_attendue: q.reponse_attendue,
          raisonnement_attendu: q.raisonnement_attendu,
          etapes_valorisees: q.etapes,
          paliers_de_points: ((paliers ?? []) as { question_id: string }[]).filter(
            (p) => p.question_id === q.id,
          ),
          reponses_equivalentes: q.reponses_equivalentes,
          methodes_alternatives: q.methodes_alternatives,
          erreurs_frequentes: q.erreurs_frequentes,
          unites_attendues: q.unites_attendues,
          precision_attendue: q.precision_attendue,
          conditions_hypotheses: q.conditions_hypotheses,
          calculatrice: q.calculatrice,
          tolerances: q.tolerances,
          competences_mobilisees: q.competences,
          codes_erreurs_possibles: q.codes_erreurs,
          depend_de: q.depend_de,
          regle_non_double_sanction: q.regle_non_double_sanction,
          regle_poursuite: q.regle_poursuite,
          regle_resultat_sans_justification: q.regle_resultat_sans_justification,
          regle_raisonnement_juste_calcul_faux: q.regle_raisonnement_juste_calcul_faux,
          criteres_relecture_humaine: q.criteres_relecture_humaine,
        })),
      },
      referentiel_competences: referentiel,
      taxonomie_erreurs: taxoRes.data ?? [],
    };

    const transcription = transcriptionRow.transcription_json as Record<string, unknown>;
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY n’est pas configuré.");
    const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";

    const payload = await callAnthropic(apiKey, {
      model,
      max_tokens: 32000,
      system: CONSIGNE_SOCLE + consigneDisciplinaire(grille?.system_prompt ?? null),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "DOSSIER DE CORRECTION (sujet, barème, référentiel, taxonomie)\n" +
                JSON.stringify(dossier),
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
            {
              type: "text",
              text: "TRANSCRIPTION DE LA COPIE À ÉVALUER\n" + JSON.stringify(transcription) +
                "\n\nAttribue les points question par question, en citant la copie. " +
                "N'annonce aucune note globale.",
            },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: schemaCorrection(
        questions.map((q) => q.question_key),
        referentiel.map((c) => c.code),
      ) } },
    });

    const brut = JSON.parse(extractStructuredText(payload)) as {
      questions: ReponseQuestionIA[];
      competency_profile: { competence: string; niveau: NiveauCompetence; commentaire: string }[];
      priority_feedback: string[];
      appreciation_generale: string;
      confidence: number;
    };

    const profilPropose: Record<string, NiveauCompetence> = {};
    const commentaires: Record<string, string> = {};
    for (const c of brut.competency_profile ?? []) {
      profilPropose[c.competence] = c.niveau;
      commentaires[c.competence] = c.commentaire;
    }

    const contexteTranscription: ContexteTranscription = {
      overall_confidence: Number(transcription.overall_confidence ?? 1),
      requires_human_review: transcription.requires_human_review === true,
    };

    const nbEtalons = estEtalon
      ? 0
      : (await supabase.from("etalon_corrections_ia").select("id", { count: "exact", head: true })
          .eq("bareme_version_id", versionId)).count ?? 0;

    const resultat = construireResultat({
      examId: exam.id,
      rubricId: correction.rubric_id ?? null,
      baremeVersionId: versionId,
      version: version.version,
      bareme: questions.map((q) => ({
        question_key: q.question_key,
        numero: q.numero,
        libelle: q.libelle,
        max_points: Number(q.max_points),
        competences: q.competences ?? [],
        codes_erreurs: q.codes_erreurs ?? [],
        depend_de: q.depend_de ?? [],
        methodes_alternatives: (q.methodes_alternatives ?? []) as unknown[],
        reponse_attendue: q.reponse_attendue,
        raisonnement_attendu: q.raisonnement_attendu,
        etapes: (q.etapes ?? []) as unknown[],
        regle_poursuite: q.regle_poursuite,
        regle_non_double_sanction: q.regle_non_double_sanction,
      })),
      sortie: brut.questions ?? [],
      referentiel,
      maxBareme: Number(version.max_score),
      confiance: brut.confidence,
      transcription: contexteTranscription,
      profilPropose,
      conseils: brut.priority_feedback ?? [],
      appreciation: brut.appreciation_generale ?? "",
      baremeVerrouille: version.statut === "locked",
      baremeCalibre: controlesOk && nbEtalons > 0,
      etalonsCompares: nbEtalons,
    });

    // --- Écriture ----------------------------------------------------
    // Les questions d'abord : le trigger correction_recalcule_note pose
    // score_raw, score_validated, max_score et human_review_required.
    await supabase.from("correction_questions").delete().eq("correction_id", correctionId);
    const { error: errQ } = await supabase.from("correction_questions").insert(
      resultat.questions.map((q) => ({
        correction_id: correctionId,
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
    if (errQ) throw new Error(`Enregistrement des questions : ${errQ.message}`);

    await supabase.from("correction_competences").delete().eq("correction_id", correctionId);
    const lignesCompetences = Object.entries(resultat.competency_profile).map(([competence, niveau]) => ({
      correction_id: correctionId,
      matiere: version.matiere,
      competence,
      niveau,
      commentaire: commentaires[competence] ?? null,
    }));
    if (lignesCompetences.length) {
      const { error } = await supabase.from("correction_competences").insert(lignesCompetences);
      if (error) throw new Error(`Enregistrement du profil de compétences : ${error.message}`);
    }

    await supabase.from("relectures_humaines").delete().eq("correction_id", correctionId)
      .eq("statut", "ouverte");
    if (resultat.human_review_reasons.length) {
      const { error } = await supabase.from("relectures_humaines").insert(
        resultat.human_review_reasons.map((m) => ({
          correction_id: correctionId,
          question_key: m.question_key ?? null,
          code_motif: m.code,
          motif: m.message,
        })),
      );
      if (error) throw new Error(`Enregistrement des relectures : ${error.message}`);
    }

    const statut = resultat.human_review_required ? "corrected_review" : "corrected";
    const { error: errSave } = await supabase.from("corrections").update({
      status: statut,
      result_json: resultat,
      model_name: model,
      bareme_version_id: versionId,
      processing_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", correctionId);
    if (errSave) throw new Error(`Enregistrement impossible: ${errSave.message}`);

    // Copie étalon : on garde la trace IA rattachée à CETTE version, pour
    // que le tableau de calibration ne mélange jamais deux versions.
    if (estEtalon) {
      const { data: etalon } = await supabase
        .from("etalon_copies").select("id").eq("correction_id", correctionId).maybeSingle();
      if (etalon) {
        await supabase.from("etalon_corrections_ia").insert({
          etalon_copie_id: (etalon as { id: string }).id,
          bareme_version_id: versionId,
          correction_id: correctionId,
          note_brute: resultat.score_raw,
          resultat,
        });
        await supabase.from("etalon_copies")
          .update({ statut: "corrigee_ia", maj_le: new Date().toISOString() })
          .eq("id", (etalon as { id: string }).id);
      }
    }

    return jsonResponse({
      ok: true,
      correction_id: correctionId,
      status: statut,
      score_raw: resultat.score_raw,
      max_score: resultat.max_score,
      human_review_required: resultat.human_review_required,
      result: resultat,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (correctionId) {
      try {
        await supabase.from("corrections").update({
          status: "correction_failed",
          processing_error: message,
          updated_at: new Date().toISOString(),
        }).eq("id", correctionId);
      } catch (_) {
        // La réponse d’erreur principale reste prioritaire.
      }
    }
    return jsonResponse({ error: message }, 500);
  }
});
