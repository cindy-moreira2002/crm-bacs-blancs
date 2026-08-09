/**
 * CORRECTION D'UNE COPIE DE MATHEMATIQUES — BREVET (DNB, serie generale).
 *
 * Moteur `corrections.moteur = 'brevet_mathematiques'`. Il ne corrige RIEN
 * d'autre : ni une copie du baccalaureat, ni une copie de francais du brevet.
 *
 * CE QUE CETTE FONCTION FAIT, DANS L'ORDRE
 *   1. verifie l'appariement examen / matiere / moteur, et refuse tout le reste ;
 *   2. verifie que le bareme est complet et — hors etalon — verrouille ;
 *   3. demande au modele des POINTS item par item et question par question,
 *      avec les etapes validees, les erreurs en cascade declarees et les
 *      methodes alternatives reperees. Jamais une note ;
 *   4. valide la sortie contre le schema, cote serveur, avant tout calcul ;
 *   5. recalcule tout lui-meme : 6 + 14 = 20, les 2 points de redaction
 *      COMPRIS dans les 14, chaque partie bornee a son maximum ;
 *   6. ecrit le detail dans ses tables, et les motifs de validation humaine.
 *
 * Deploiement (pas de CI, c'est manuel) :
 *   npx --yes supabase@latest functions deploy correct-brevet-maths \
 *     --project-ref xgdaibekjmtffvkwvcge --no-verify-jwt
 * Ne JAMAIS coller ce code dans l'editeur du dashboard : il abime les accents.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  construireRapportEleve,
  motif,
  MOTIFS_VALIDATION,
  motifsCommuns,
  synthetiserQualiteDocument,
  synthetiserValidation,
  verifierAppariementMatiere,
  VERSION_CORRECTION_BREVET,
  type AnomalieDocument,
  type CodeMotifValidation,
  type MotifValidation,
} from "../_shared/brevet-noyau.ts";
import {
  assemblerResultatMaths,
  evaluerAutomatismes,
  evaluerQualiteRedaction,
  evaluerRaisonnement,
  profilCompetencesMaths,
  verifierTotauxMaths,
  type CompetenceMaths,
  type DomaineMaths,
  type EtapeGeometrie,
  type ItemAutomatisme,
  type QuestionMaths,
} from "../_shared/brevet-maths-noyau.ts";
import {
  CONSIGNE_MATHS_BREVET,
  schemaCorrectionMaths,
  validerSortieMaths,
  VERSION_PROMPT_MATHS,
} from "../_shared/brevet-maths-prompt.ts";

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

    const { data: exam } = await supabase
      .from("exams").select("*").eq("id", correction.exam_id).maybeSingle();

    const appariement = verifierAppariementMatiere({
      matiereAttendue: "brevet_mathematiques",
      matiereExamen: exam?.matiere ?? null,
      niveauExamen: exam?.examen ?? null,
      moteurCorrection: correction.moteur ?? null,
    });
    if (!appariement.ok) return jsonResponse({ error: appariement.raison }, 409);

    const { data: transcriptionRow, error: errT } = await supabase
      .from("copy_transcriptions").select("*").eq("correction_id", correctionId).single();
    if (errT || !transcriptionRow) {
      return jsonResponse(
        { error: "Aucune transcription disponible. Lance d’abord transcribe-french-copy." },
        409,
      );
    }

    const versionId = correction.bareme_version_id ?? exam.bareme_version_active;
    if (!versionId) throw new Error("Aucune version de barème n’est active sur cet examen.");

    const { data: version, error: errV } = await supabase
      .from("bareme_versions").select("*").eq("id", versionId).single();
    if (errV || !version) throw new Error("Version de barème introuvable.");

    const estEtalon = correction.est_etalon === true;
    if ((version.controles as { ok?: boolean } | null)?.ok !== true) {
      throw new Error(
        "Le barème comporte encore des blocages : correction refusée. " +
        "Lance la vérification depuis /admin/brevet/mathematiques et corrige-les.",
      );
    }
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

    // --- Le barème du sujet -------------------------------------------
    const [autoRes, qRes, qualiteRes, taxoRes, reglesRes, sujetRes] = await Promise.all([
      supabase.from("brevet_automatismes").select("*").eq("bareme_version_id", versionId).order("ordre"),
      supabase.from("bareme_questions").select("*").eq("bareme_version_id", versionId)
        .eq("partie", "raisonnement").order("ordre"),
      supabase.from("brevet_qualite_redaction_criteres").select("*")
        .eq("bareme_version_id", versionId).eq("actif", true).order("ordre"),
      supabase.from("taxonomie_erreurs").select("*").eq("matiere", "brevet_mathematiques").order("code"),
      supabase.from("brevet_regles_officielles").select("*").in("matiere", ["brevet_mathematiques", "commun"]),
      exam.subject_id
        ? supabase.from("subject_cards").select("card_json").eq("id", exam.subject_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (qRes.error) throw new Error(`Lecture du barème : ${qRes.error.message}`);

    const lignesAuto = (autoRes.data ?? []) as Record<string, unknown>[];
    const lignesQuestions = (qRes.data ?? []) as Record<string, unknown>[];
    const lignesQualite = (qualiteRes.data ?? []) as Record<string, unknown>[];

    const itemsAutomatismes: ItemAutomatisme[] = lignesAuto.map((i) => ({
      item_key: String(i.item_key),
      numero: String(i.numero),
      notion: String(i.notion),
      theme: i.theme as ItemAutomatisme["theme"],
      competence: i.competence as CompetenceMaths,
      reponse_attendue: String(i.reponse_attendue),
      variantes_acceptees: (i.variantes_acceptees as string[] | null) ?? [],
      unite_attendue: (i.unite_attendue as string | null) ?? null,
      tolerance: i.tolerance === null || i.tolerance === undefined ? null : Number(i.tolerance),
      forme_exigee: (i.forme_exigee as string | null) ?? null,
      points: Number(i.points),
    }));

    const questionsBareme: QuestionMaths[] = lignesQuestions.map((q) => ({
      question_key: String(q.question_key),
      numero: String(q.numero),
      exercice: String(q.exercice_id ?? ""),
      partie: "raisonnement",
      libelle: String(q.libelle ?? ""),
      domaines: ((q.domaines as string[] | null) ?? []) as DomaineMaths[],
      connaissances: (q.connaissances as string[] | null) ?? [],
      competences: ((q.competences as string[] | null) ?? []) as CompetenceMaths[],
      max_points: Number(q.max_points),
      resultat_attendu: String(q.reponse_attendue ?? ""),
      methode_principale: String(q.raisonnement_attendu ?? ""),
      methodes_alternatives:
        (q.methodes_alternatives as { libelle: string; description: string }[] | null) ?? [],
      etapes_valorisables:
        (q.etapes as { code: string; libelle: string; points: number }[] | null) ?? [],
      unites_attendues: (q.unites_attendues as string | null) ?? null,
      precision_attendue: (q.precision_attendue as string | null) ?? null,
      justification_attendue:
        (String(q.justification_attendue ?? "mention")) as QuestionMaths["justification_attendue"],
      regle_arrondi: (q.precision_attendue as string | null) ?? null,
      depend_de: (q.depend_de as string[] | null) ?? [],
      regle_cascade: (q.regle_cascade as string | null) ?? null,
      regles_points_partiels: (q.regle_resultat_sans_justification as string | null) ?? null,
      etapes_geometrie: ((q.etapes_geometrie as string[] | null) ?? []) as EtapeGeometrie[],
      codes_erreurs: (q.codes_erreurs as string[] | null) ?? [],
      calculatrice: (q.calculatrice === "interdite" ? "interdite" : "autorisee"),
    }));

    const maxQualite = lignesQualite.reduce((s, c) => s + Number(c.max_points), 0);

    // Le controle des totaux est rejoue ICI, avant l'appel a Claude : un
    // bareme faux ne doit pas consommer de credit.
    const totaux = verifierTotauxMaths({
      maxAutomatismes: itemsAutomatismes.reduce((s, i) => s + i.points, 0),
      maxRaisonnementQuestions: questionsBareme.reduce((s, q) => s + q.max_points, 0),
      maxQualiteRedaction: maxQualite,
    });
    if (!totaux.ok) {
      throw new Error(
        `Le barème de ce sujet est incohérent :\n- ${totaux.blocages.map((b) => b.message).join("\n- ")}`,
      );
    }

    await supabase.from("corrections")
      .update({ status: "correcting", processing_error: null, updated_at: new Date().toISOString() })
      .eq("id", correctionId);

    const dossier = {
      identite: {
        exam: "DNB",
        series: exam.serie ?? "generale",
        session: exam.session,
        subject: "brevet_mathematiques",
        niveau: exam.niveau ?? "troisieme",
      },
      examen: { titre: exam.titre, date_epreuve: exam.date_epreuve },
      priorite_1_bareme_du_sujet: {
        version: version.version,
        partie_1_automatismes: {
          max_points: itemsAutomatismes.reduce((s, i) => s + i.points, 0),
          calculatrice: "interdite",
          items: itemsAutomatismes,
        },
        partie_2_raisonnement: {
          max_points: questionsBareme.reduce((s, q) => s + q.max_points, 0),
          calculatrice: "autorisee",
          questions: questionsBareme,
        },
        qualite_redaction: {
          max_points: maxQualite,
          comprise_dans_la_partie_2: true,
          criteres: lignesQualite,
        },
      },
      priorite_2_corrige_officiel: exam.corrige_texte ?? null,
      priorite_3_consignes_administratrice: exam.consignes_correcteur ?? null,
      priorite_4_regles_officielles: reglesRes.data ?? [],
      sujet_texte: exam.sujet_texte,
      fiche_sujet: (sujetRes as { data: { card_json?: unknown } | null }).data?.card_json ?? null,
      taxonomie_erreurs: taxoRes.data ?? [],
    };

    const transcription = transcriptionRow.transcription_json as Record<string, unknown>;
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY n’est pas configuré.");
    const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";

    const schema = schemaCorrectionMaths({
      clesAutomatismes: itemsAutomatismes.map((i) => i.item_key),
      clesQuestions: questionsBareme.map((q) => q.question_key),
      codesErreurs: ((taxoRes.data ?? []) as { code: string }[]).map((t) => t.code),
      criteresQualite: lignesQualite.map((c) => String(c.code)),
    });

    const payload = await callAnthropic(apiKey, {
      model,
      max_tokens: 32000,
      system: CONSIGNE_MATHS_BREVET,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "DOSSIER DE CORRECTION — MATHÉMATIQUES, BREVET\n" + JSON.stringify(dossier),
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
            {
              type: "text",
              text:
                "TRANSCRIPTION DE LA COPIE À ÉVALUER\n" + JSON.stringify(transcription) +
                "\n\nAttribue les points item par item et question par question, en citant la copie. " +
                "Déclare explicitement les erreurs en cascade et les méthodes alternatives. " +
                "N'annonce aucune note.",
            },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema } },
    });

    const brut = JSON.parse(extractStructuredText(payload));
    const validation = validerSortieMaths(brut, {
      clesAutomatismes: itemsAutomatismes.map((i) => i.item_key),
      clesQuestions: questionsBareme.map((q) => q.question_key),
    });
    if (!validation.ok) {
      throw new Error(
        `La réponse du correcteur ne respecte pas le schéma :\n- ${validation.erreurs.join("\n- ")}`,
      );
    }
    const sortie = validation.sortie;

    // --- Recalcul par le serveur ---------------------------------------
    const automatismes = evaluerAutomatismes(
      itemsAutomatismes,
      sortie.automatismes as Parameters<typeof evaluerAutomatismes>[1],
    );
    const raisonnement = evaluerRaisonnement(
      questionsBareme,
      sortie.questions as Parameters<typeof evaluerRaisonnement>[1],
    );

    // Non-double-penalisation entre les questions et les 2 points de
    // redaction : on recense ce qui a DEJA ete retire pour justification
    // absente ou unite manquante, et le noyau neutralise le doublon.
    const justificationDejaPenalisee = raisonnement.questions
      .filter(
        (q) =>
          q.points < q.max_points &&
          (q.statut === "juste_sans_justification" || q.statut === "reponse_non_justifiee"),
      )
      .map((q) => q.numero);
    const unitesDejaPenalisees = raisonnement.questions
      .filter(
        (q) =>
          q.points < q.max_points && (q.statut === "unite_absente" || q.statut === "erreur_unite"),
      )
      .map((q) => q.numero);

    const qualiteRedaction = evaluerQualiteRedaction({
      scores: sortie.qualite_redaction,
      max: maxQualite,
      justificationDejaPenalisee,
      unitesDejaPenalisees,
    });

    const resultat = assemblerResultatMaths({
      automatismes,
      raisonnement,
      qualiteRedaction,
      alertes: [],
    });

    const profil = profilCompetencesMaths(questionsBareme, raisonnement.questions, automatismes);

    // --- Qualite documentaire et validation humaine ---------------------
    const qualiteDoc = synthetiserQualiteDocument({
      anomalies: (sortie.document_quality.anomalies ?? []) as AnomalieDocument[],
      zonesIncertaines: sortie.document_quality.zones_incertaines ?? [],
      statutPropose: sortie.document_quality.statut,
    });

    const { data: parametres } = await supabase
      .from("brevet_parametres").select("*").in("matiere", ["commun", "brevet_mathematiques"]);
    const seuils =
      (((parametres ?? []) as { cle: string; valeur: { seuils?: number[] } }[])
        .find((p) => p.cle === "seuils_relecture")?.valeur.seuils) ?? [10];

    const noteSur20 = resultat.score.score_out_of_20;
    const motifs: MotifValidation[] = [
      ...motifsCommuns({
        confiance: sortie.confidence,
        qualite: qualiteDoc,
        noteSur20,
        seuilsAdmin: seuils,
        transcriptionDemandeRelecture: transcription.requires_human_review === true,
      }),
    ];

    for (const q of raisonnement.questions) {
      if (q.methode_alternative && q.nature_decision === "a_valider") {
        motifs.push(
          motif(
            "methode_inhabituelle_possiblement_valide",
            `Question ${q.numero} : ${q.methode_alternative_description ?? "méthode non prévue au barème"}. Jamais zéro d'office.`,
            q.question_key,
          ),
        );
      }
      if (q.statut === "illisible" || q.transcription_incertaine) {
        motifs.push(
          motif(
            "copie_partiellement_illisible",
            `Question ${q.numero} : écriture ou symbole incertain. Ce n'est pas une erreur de l'élève.`,
            q.question_key,
          ),
        );
      }
      if (q.cascade_penalty_applied) {
        motifs.push(
          motif(
            "confiance_faible",
            `Question ${q.numero} : 0 posé sur une question qui dépend de ${q.depends_on_question ?? q.question_key} — vérifier la non-double-sanction.`,
            q.question_key,
          ),
        );
      }
    }
    for (const i of automatismes.items) {
      if (i.statut === "illisible") {
        motifs.push(
          motif("copie_partiellement_illisible", `Automatisme ${i.numero} illisible.`, i.item_key),
        );
      }
    }
    for (const m of sortie.validation_humaine ?? []) {
      const code = (MOTIFS_VALIDATION as readonly string[]).includes(m.code)
        ? (m.code as CodeMotifValidation)
        : "confiance_faible";
      motifs.push(motif(code, m.message, m.cible));
    }

    const { rapport, motifs: motifsRapport } = construireRapportEleve({
      noteBrute: noteSur20,
      noteMax: 20,
      blocs: resultat.sections.map((s) => ({
        code: s.code,
        libelle: s.libelle,
        score: s.score,
        max: s.max,
      })),
      reussites: sortie.rapport_eleve.reussites,
      priorites: sortie.rapport_eleve.priorites,
      erreurs: sortie.rapport_eleve.erreurs_expliquees,
      aRetravailler: sortie.rapport_eleve.a_retravailler,
      strategie: sortie.rapport_eleve.strategie,
      qualite: qualiteDoc,
    });
    motifs.push(...motifsRapport);

    const synthese = synthetiserValidation(motifs);

    const resultatComplet = {
      metadata: {
        exam: "DNB",
        series: exam.serie ?? "generale",
        session: exam.session,
        subject: "brevet_mathematiques",
        copy_id: correctionId,
        subject_id: exam.subject_id,
        exam_id: exam.id,
        rubric_version: version.version,
        bareme_version: version.version,
        prompt_version: VERSION_PROMPT_MATHS,
        correction_version: VERSION_CORRECTION_BREVET,
        moteur: "brevet_mathematiques",
        amenagements: (correction.amenagements as string[] | null) ?? [],
      },
      document_quality: qualiteDoc,
      sections: resultat.sections,
      score: resultat.score,
      competency_profile: profil,
      cascades: resultat.cascades,
      errors: resultat.erreurs,
      strengths: rapport.reussites,
      priorities: rapport.priorites,
      student_feedback: rapport,
      human_review: {
        required: synthese.required,
        blocking: synthese.blocking,
        degre_maximal: synthese.degre_maximal,
        reasons: synthese.reasons,
      },
      alertes: resultat.alertes,
      confidence: sortie.confidence,
    };

    // --- Ecriture ------------------------------------------------------
    // Trois familles d'unites de notation dans correction_questions :
    // un agregat pour la partie 1, une ligne par question de la partie 2,
    // un agregat pour les 2 points de redaction. Somme = 20, recalculee par
    // le trigger correction_recalcule_note independamment de ce fichier.
    await supabase.from("correction_questions").delete().eq("correction_id", correctionId);
    const lignes: Record<string, unknown>[] = [
      {
        correction_id: correctionId,
        bareme_version_id: versionId,
        question_key: "partie1_automatismes",
        points: resultat.score.automatismes.score,
        max_points: resultat.score.automatismes.max,
        bloc: "automatismes",
        partie: "automatismes",
        source_regle: "subject_bareme",
        nature_decision: "prevue_par_bareme",
        certitude: 1,
        elements_observes: [],
        elements_manquants: [],
        erreurs: [],
        preuves: [],
        transcription_incertaine: automatismes.items.some((i) => i.statut === "illisible"),
        relecture_humaine: automatismes.alertes.length > 0,
        motifs_relecture: automatismes.alertes.map((a) => ({ message: a })),
        competences: [],
      },
      ...raisonnement.questions.map((q) => ({
        correction_id: correctionId,
        bareme_version_id: versionId,
        question_key: q.question_key,
        points: q.points,
        max_points: q.max_points,
        bloc: "raisonnement",
        partie: "raisonnement",
        statut_reponse: q.statut,
        source_regle: q.source_decision,
        nature_decision: q.nature_decision,
        certitude: q.certitude,
        elements_observes: q.etapes_validees,
        elements_manquants: q.etapes_manquantes,
        erreurs: q.erreurs,
        preuves: q.preuves,
        transcription_incertaine: q.transcription_incertaine,
        relecture_humaine: q.alertes.length > 0 || q.nature_decision === "a_valider",
        motifs_relecture: q.alertes.map((a) => ({ message: a })),
        competences: q.competences,
        depends_on_question: q.depends_on_question,
        inherited_value: q.inherited_value,
        cascade_error: q.cascade_error,
        method_valid_from_student_value: q.method_valid_from_student_value,
        cascade_penalty_applied: q.cascade_penalty_applied,
        methode_alternative: q.methode_alternative,
      })),
      {
        correction_id: correctionId,
        bareme_version_id: versionId,
        question_key: "qualite_redaction",
        points: qualiteRedaction.score,
        max_points: qualiteRedaction.max,
        bloc: "raisonnement",
        partie: "qualite_redaction",
        source_regle: "official_exam_rule",
        nature_decision: "prevue_par_bareme",
        certitude: 1,
        elements_observes: qualiteRedaction.doublons_evites,
        elements_manquants: [],
        erreurs: [],
        preuves: [],
        transcription_incertaine: false,
        relecture_humaine: qualiteRedaction.alertes.length > 0,
        motifs_relecture: qualiteRedaction.alertes.map((a) => ({ message: a })),
        competences: ["communiquer"],
      },
    ];

    const { error: errQ } = await supabase.from("correction_questions").insert(lignes);
    if (errQ) throw new Error(`Enregistrement des questions : ${errQ.message}`);

    await supabase.from("correction_automatismes").delete().eq("correction_id", correctionId);
    if (automatismes.items.length) {
      const { error } = await supabase.from("correction_automatismes").insert(
        automatismes.items.map((i) => ({
          correction_id: correctionId,
          item_key: i.item_key,
          numero: i.numero,
          notion: i.notion,
          competence: i.competence,
          reponse_attendue: i.reponse_attendue,
          reponse_eleve: i.reponse_eleve,
          statut: i.statut,
          points: i.points,
          max_points: i.max_points,
          justification: i.justification,
          certitude: i.certitude,
        })),
      );
      if (error) throw new Error(`Enregistrement des automatismes : ${error.message}`);
    }

    await supabase.from("correction_qualite_redaction").delete().eq("correction_id", correctionId);
    if (qualiteRedaction.criteres.length) {
      const { error } = await supabase.from("correction_qualite_redaction").insert(
        qualiteRedaction.criteres.map((c) => ({
          correction_id: correctionId,
          code: c.code,
          libelle: c.libelle,
          score: c.score,
          max_points: c.max,
          observation: c.observation,
          preuves: c.preuves,
          neutralise: c.observation.startsWith("Critère neutralisé"),
        })),
      );
      if (error) throw new Error(`Enregistrement de la qualité rédactionnelle : ${error.message}`);
    }

    await supabase.from("correction_competences").delete().eq("correction_id", correctionId);
    const lignesCompetences = Object.entries(profil).map(([competence, niveau]) => ({
      correction_id: correctionId,
      matiere: "brevet_mathematiques",
      competence,
      // La table du bac utilise l'echelle anglaise : on y projette la notre
      // sans en changer le sens, pour que les ecrans existants sachent la lire.
      niveau:
        niveau === "insuffisant" ? "insufficient"
        : niveau === "satisfaisant" ? "satisfactory"
        : niveau === "tres_satisfaisant" ? "very_satisfactory"
        : niveau,
    }));
    if (lignesCompetences.length) {
      const { error } = await supabase.from("correction_competences").insert(lignesCompetences);
      if (error) throw new Error(`Enregistrement du profil de compétences : ${error.message}`);
    }

    await supabase.from("correction_document_qualite").delete().eq("correction_id", correctionId);
    await supabase.from("correction_document_qualite").insert({
      correction_id: correctionId,
      statut: qualiteDoc.statut,
      missing_pages: qualiteDoc.missing_pages,
      duplicate_pages: qualiteDoc.duplicate_pages,
      uncertain_zones: qualiteDoc.uncertain_zones,
      anomalies: qualiteDoc.anomalies,
      requires_human_review: qualiteDoc.requires_human_review,
    });

    await supabase.from("relectures_humaines").delete().eq("correction_id", correctionId)
      .eq("statut", "ouverte");
    if (synthese.reasons.length) {
      const { error } = await supabase.from("relectures_humaines").insert(
        synthese.reasons.map((m) => ({
          correction_id: correctionId,
          question_key: m.cible ?? null,
          code_motif: m.code,
          motif: m.message,
          degre: m.degre,
        })),
      );
      if (error) throw new Error(`Enregistrement des validations : ${error.message}`);
    }

    const statut = synthese.required ? "corrected_review" : "corrected";
    const { error: errSave } = await supabase.from("corrections").update({
      status: statut,
      result_json: resultatComplet,
      model_name: model,
      bareme_version_id: versionId,
      human_review_required: synthese.required,
      processing_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", correctionId);
    if (errSave) throw new Error(`Enregistrement impossible: ${errSave.message}`);

    if (estEtalon) {
      const { data: etalon } = await supabase
        .from("etalon_copies").select("id").eq("correction_id", correctionId).maybeSingle();
      if (etalon) {
        await supabase.from("etalon_corrections_ia").insert({
          etalon_copie_id: (etalon as { id: string }).id,
          bareme_version_id: versionId,
          correction_id: correctionId,
          note_brute: noteSur20,
          resultat: resultatComplet,
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
      score: resultat.score,
      human_review_required: synthese.required,
      human_review_blocking: synthese.blocking,
      result: resultatComplet,
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
