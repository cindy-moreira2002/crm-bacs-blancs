/**
 * CORRECTION D'UNE COPIE DE FRANCAIS — BREVET (DNB, serie generale).
 *
 * Moteur `corrections.moteur = 'brevet_francais'`. Il ne corrige RIEN
 * d'autre : ni une copie du baccalaureat, ni une copie de mathematiques du
 * brevet. Les trois autres moteurs (correct-french-copy, correct-copy-bareme,
 * correct-copy-redigee) restent en service, inchanges.
 *
 * CE QUE CETTE FONCTION FAIT, DANS L'ORDRE
 *   1. verifie l'appariement examen / matiere / moteur, et refuse tout le reste ;
 *   2. verifie que le bareme est complet et — hors etalon — verrouille ;
 *   3. demande au modele des POINTS par question, la TRANSCRIPTION de la
 *      dictee, les FORMES de la reecriture et des SCORES par critere de
 *      redaction. Jamais une note ;
 *   4. valide la sortie contre le schema, cote serveur, avant tout calcul ;
 *   5. recalcule tout lui-meme : la dictee est comparee mot a mot au texte
 *      attendu, la reecriture forme par forme, et les sommes sont faites par
 *      le noyau puis re-verifiees par le trigger correction_recalcule_note ;
 *   6. ecrit le detail dans ses tables, et les motifs de validation humaine.
 *
 * Deploiement (pas de CI, c'est manuel) :
 *   npx --yes supabase@latest functions deploy correct-brevet-francais \
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
  assemblerResultatFrancais,
  evaluerDictee,
  evaluerReecriture,
  evaluerRedaction,
  normaliserQuestionsFrancais,
  verifierJustification,
  type ConfigDictee,
  type GrilleRedaction,
  type ItemReecriture,
  type PartieFrancais,
  type QuestionFrancais,
  type RegleDictee,
  type SujetRedaction,
} from "../_shared/brevet-francais-noyau.ts";
import {
  CONSIGNE_FRANCAIS_BREVET,
  schemaCorrectionFrancais,
  validerSortieFrancais,
  VERSION_PROMPT_FRANCAIS,
} from "../_shared/brevet-francais-prompt.ts";

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

/** Texte brut de la copie, pour la comparaison de la dictée si le modèle n'a rien transcrit. */
function texteTranscription(transcription: Record<string, unknown>): string {
  const direct = transcription.text ?? transcription.texte ?? transcription.full_text;
  if (typeof direct === "string") return direct;
  const pages = transcription.pages;
  if (Array.isArray(pages)) {
    return pages
      .map((p) => (typeof p === "object" && p !== null ? String((p as Record<string, unknown>).text ?? "") : ""))
      .join("\n");
  }
  return "";
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

    // Le garde-fou du cahier des charges, avant tout appel a Claude : une
    // copie de brevet ne peut pas etre corrigee avec une grille de bac, et
    // le francais ne corrige pas une copie de mathematiques.
    const appariement = verifierAppariementMatiere({
      matiereAttendue: "brevet_francais",
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
    const controlesOk = (version.controles as { ok?: boolean } | null)?.ok === true;
    if (!controlesOk) {
      throw new Error(
        "Le barème comporte encore des blocages : correction refusée. " +
        "Lance la vérification depuis /admin/brevet/francais et corrige-les.",
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

    // --- Le barème du sujet, dans ses quatre morceaux ------------------
    const [qRes, reecrCfgRes, reecrItemsRes, dicteeCfgRes, dicteeReglesRes, grillesRes, taxoRes, reglesRes, sujetRes] =
      await Promise.all([
        supabase.from("bareme_questions").select("*").eq("bareme_version_id", versionId).order("ordre"),
        supabase.from("brevet_reecriture_config").select("*").eq("bareme_version_id", versionId).maybeSingle(),
        supabase.from("brevet_reecriture_items").select("*").eq("bareme_version_id", versionId).order("ordre"),
        supabase.from("brevet_dictee_config").select("*").eq("bareme_version_id", versionId).maybeSingle(),
        supabase.from("brevet_dictee_regles").select("*").eq("bareme_version_id", versionId).order("ordre"),
        supabase.from("brevet_redaction_grilles").select("*").eq("bareme_version_id", versionId),
        supabase.from("taxonomie_erreurs").select("*").eq("matiere", "brevet_francais").order("code"),
        supabase.from("brevet_regles_officielles").select("*").in("matiere", ["brevet_francais", "commun"]),
        exam.subject_id
          ? supabase.from("subject_cards").select("card_json").eq("id", exam.subject_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
    if (qRes.error) throw new Error(`Lecture du barème : ${qRes.error.message}`);

    const lignesQuestions = (qRes.data ?? []) as Record<string, unknown>[];
    const grilles = (grillesRes.data ?? []) as Record<string, unknown>[];
    const criteresRes = grilles.length
      ? await supabase
          .from("brevet_redaction_criteres")
          .select("*")
          .in("grille_id", grilles.map((g) => g.id as string))
          .eq("actif", true)
          .order("ordre")
      : { data: [] as Record<string, unknown>[] };

    const questionsBareme: QuestionFrancais[] = lignesQuestions.map((q) => ({
      question_key: String(q.question_key),
      numero: String(q.numero),
      sous_numero: (q.sous_numero as string | null) ?? null,
      partie: (String(q.partie ?? "texte") as PartieFrancais),
      formulation: String(q.libelle ?? ""),
      competence_evaluee: ((q.competences as string[] | null) ?? [])[0] ?? null,
      type_reponse: (String(q.type_reponse ?? "reponse_courte")) as QuestionFrancais["type_reponse"],
      elements_attendus: (q.elements_attendus as string[] | null) ?? [],
      max_points: Number(q.max_points),
      reponses_alternatives: (q.reponses_equivalentes as string[] | null) ?? [],
      citations_attendues: (q.citations_attendues as string[] | null) ?? [],
      degre_justification: (String(q.degre_justification ?? "aucun")) as QuestionFrancais["degre_justification"],
      regles_points_partiels: (q.regles_points_partiels as QuestionFrancais["regles_points_partiels"]) ?? [],
      erreurs_caracteristiques: (q.erreurs_frequentes as string[] | null) ?? [],
      depend_de: (q.depend_de as string[] | null) ?? [],
      codes_erreurs: (q.codes_erreurs as string[] | null) ?? [],
    }));

    const itemsReecriture: ItemReecriture[] = ((reecrItemsRes.data ?? []) as Record<string, unknown>[]).map(
      (i) => ({
        cle: String(i.cle),
        forme_originale: String(i.forme_originale),
        forme_attendue: String(i.forme_attendue),
        transformation: String(i.transformation),
        points: Number(i.points),
        variantes_admises: (i.variantes_admises as string[] | null) ?? [],
      }),
    );

    const cfgReecr = reecrCfgRes.data as Record<string, unknown> | null;
    const cfgDictee = dicteeCfgRes.data as Record<string, unknown> | null;
    const reglesDictee: RegleDictee[] = ((dicteeReglesRes.data ?? []) as Record<string, unknown>[]).map(
      (r) => ({
        categorie: r.categorie as RegleDictee["categorie"],
        sous_categorie: (r.sous_categorie as string | null) ?? null,
        penalite: Number(r.penalite),
        plafond: r.plafond === null || r.plafond === undefined ? null : Number(r.plafond),
        cumul_repetitions: r.cumul_repetitions === true,
        regle: String(r.regle),
      }),
    );

    const grillesRedaction: GrilleRedaction[] = grilles.map((g) => ({
      type_sujet: g.type_sujet as "imagination" | "reflexion",
      intitule: String(g.intitule ?? ""),
      max_points: Number(g.max_points),
      longueur_minimale:
        g.longueur_minimale === null || g.longueur_minimale === undefined
          ? null
          : Number(g.longueur_minimale),
      issue_du_sujet: g.issue_du_sujet === true,
      criteres: ((criteresRes.data ?? []) as Record<string, unknown>[])
        .filter((c) => c.grille_id === g.id)
        .map((c) => ({
          code: String(c.code),
          libelle: String(c.libelle),
          max_points: Number(c.max_points),
          descripteurs: (c.descripteurs as { niveau: string; description: string; points: number }[]) ?? [],
          cumul_famille_autorise: c.cumul_famille_autorise === true,
        })),
    }));

    await supabase.from("corrections")
      .update({ status: "correcting", processing_error: null, updated_at: new Date().toISOString() })
      .eq("id", correctionId);

    // --- Dossier remis au correcteur ---------------------------------
    // Le sujet, son corrige, son bareme et les consignes de l'administratrice
    // arrivent AVANT les regles generales : c'est l'ordre de priorite du §4.
    const dossier = {
      identite: {
        exam: "DNB",
        series: exam.serie ?? "generale",
        session: exam.session,
        subject: "brevet_francais",
        niveau: exam.niveau ?? "troisieme",
      },
      examen: { titre: exam.titre, date_epreuve: exam.date_epreuve },
      priorite_1_bareme_du_sujet: {
        version: version.version,
        questions: lignesQuestions.map((q) => ({
          question_key: q.question_key,
          numero: q.numero,
          sous_numero: q.sous_numero,
          partie: q.partie,
          formulation: q.libelle,
          type_reponse: q.type_reponse,
          max_points: Number(q.max_points),
          elements_attendus: q.elements_attendus,
          reponses_alternatives: q.reponses_equivalentes,
          citations_attendues: q.citations_attendues,
          degre_justification: q.degre_justification,
          regles_points_partiels: q.regles_points_partiels,
          erreurs_caracteristiques: q.erreurs_frequentes,
          depend_de: q.depend_de,
          codes_erreurs_possibles: q.codes_erreurs,
          competences_mobilisees: q.competences,
        })),
        reecriture: {
          consigne: cfgReecr?.consigne ?? null,
          max_points: cfgReecr ? Number(cfgReecr.max_points) : null,
          formes: itemsReecriture,
        },
        dictee: {
          consigne: cfgDictee?.consigne ?? null,
          max_points: cfgDictee ? Number(cfgDictee.max_points) : 10,
          // Le texte attendu N'EST PAS transmis au modele : il transcrirait
          // le texte attendu au lieu de lire la copie. La comparaison est
          // faite par le serveur.
          texte_attendu_transmis: false,
        },
        redaction: grillesRedaction,
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

    const codesErreurs = ((taxoRes.data ?? []) as { code: string }[]).map((t) => t.code);
    const schema = schemaCorrectionFrancais({
      clesQuestions: questionsBareme.map((q) => q.question_key),
      clesReecriture: itemsReecriture.map((i) => i.cle),
      criteresImagination:
        grillesRedaction.find((g) => g.type_sujet === "imagination")?.criteres.map((c) => c.code) ?? [],
      criteresReflexion:
        grillesRedaction.find((g) => g.type_sujet === "reflexion")?.criteres.map((c) => c.code) ?? [],
      codesErreurs,
    });

    const payload = await callAnthropic(apiKey, {
      model,
      max_tokens: 32000,
      system: CONSIGNE_FRANCAIS_BREVET,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "DOSSIER DE CORRECTION — FRANÇAIS, BREVET\n" + JSON.stringify(dossier),
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
            {
              type: "text",
              text:
                "TRANSCRIPTION DE LA COPIE À ÉVALUER\n" + JSON.stringify(transcription) +
                "\n\nAttribue les points question par question, transcris fidèlement la dictée " +
                "et les formes de la réécriture, et note la rédaction avec la seule grille du " +
                "sujet que l'élève a traité. N'annonce aucune note.",
            },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema } },
    });

    // --- Validation cote serveur AVANT tout calcul --------------------
    const brut = JSON.parse(extractStructuredText(payload));
    const validation = validerSortieFrancais(brut, {
      clesQuestions: questionsBareme.map((q) => q.question_key),
      clesReecriture: itemsReecriture.map((i) => i.cle),
    });
    if (!validation.ok) {
      throw new Error(
        `La réponse du correcteur ne respecte pas le schéma :\n- ${validation.erreurs.join("\n- ")}`,
      );
    }
    const sortie = validation.sortie;

    // --- Les trois blocs, recalcules par le serveur -------------------
    const { questions, alertes: alertesQuestions } = normaliserQuestionsFrancais(
      questionsBareme,
      sortie.questions as Parameters<typeof normaliserQuestionsFrancais>[1],
    );
    const alertesJustification = verifierJustification(questionsBareme, questions);

    const reecriture = itemsReecriture.length
      ? evaluerReecriture(itemsReecriture, sortie.reecriture, {
          max_points: cfgReecr ? Number(cfgReecr.max_points) : 0,
          penalite_erreur_copie:
            cfgReecr && cfgReecr.penalite_erreur_copie !== null
              ? Number(cfgReecr.penalite_erreur_copie)
              : null,
          plafond_erreurs_copie:
            cfgReecr && cfgReecr.plafond_erreurs_copie !== null
              ? Number(cfgReecr.plafond_erreurs_copie)
              : null,
          bareme_du_sujet_fourni: cfgReecr?.bareme_du_sujet_fourni === true,
        })
      : null;

    const configDictee: ConfigDictee = {
      max_points: cfgDictee ? Number(cfgDictee.max_points) : 10,
      texte_attendu: String(cfgDictee?.texte_attendu ?? ""),
      regles: reglesDictee,
      graphies_admises: (cfgDictee?.graphies_admises as string[] | null) ?? [],
      plancher: cfgDictee ? Number(cfgDictee.plancher) : 0,
      source_bareme: (cfgDictee?.source_bareme as ConfigDictee["source_bareme"]) ?? null,
    };
    const texteDictee = sortie.dictee?.texte_transcrit?.trim()
      ? sortie.dictee.texte_transcrit
      : texteTranscription(transcription);
    const dictee = evaluerDictee(configDictee, texteDictee);

    const redaction = evaluerRedaction({
      sujetChoisi: sortie.redaction.sujet_choisi as SujetRedaction,
      grilles: grillesRedaction,
      scores: sortie.redaction.criteres as Parameters<typeof evaluerRedaction>[0]["scores"],
      longueurEstimee: sortie.redaction.longueur_estimee_lignes,
    });

    const resultat = assemblerResultatFrancais({
      questions,
      reecriture,
      dictee,
      redaction,
      alertes: [...alertesQuestions, ...alertesJustification],
    });

    // --- Qualite documentaire et validation humaine --------------------
    const qualite = synthetiserQualiteDocument({
      anomalies: (sortie.document_quality.anomalies ?? []) as AnomalieDocument[],
      zonesIncertaines: sortie.document_quality.zones_incertaines ?? [],
      statutPropose: sortie.document_quality.statut,
    });

    const { data: parametres } = await supabase
      .from("brevet_parametres").select("*").in("matiere", ["commun", "brevet_francais"]);
    const seuils =
      (((parametres ?? []) as { cle: string; valeur: { seuils?: number[] } }[])
        .find((p) => p.cle === "seuils_relecture")?.valeur.seuils) ?? [10];

    const noteSur20 = resultat.score_sur_20;
    const motifs: MotifValidation[] = [
      ...motifsCommuns({
        confiance: sortie.confidence,
        qualite,
        noteSur20,
        seuilsAdmin: seuils,
        transcriptionDemandeRelecture: transcription.requires_human_review === true,
      }),
    ];

    if (resultat.note_partielle) {
      motifs.push(
        motif(
          "bareme_incomplet",
          `Bloc(s) non noté(s) : ${resultat.blocs_non_notes.join(", ")}. La note affichée ne porte que sur ${resultat.score_max} points.`,
        ),
      );
    }
    if (dictee.bareme_manquant) {
      motifs.push(
        motif("bareme_incomplet", "La dictée n’a pas de règles de retrait : elle n’est pas notée."),
      );
    }
    if (dictee.decalage_ocr_suspecte) {
      motifs.push(
        motif(
          "erreur_ocr_impactant_les_points",
          "Décalage de transcription suspecté sur la dictée : les erreurs de la zone ne sont pas comptées.",
        ),
      );
    }
    if (
      redaction.sujet_choisi === "incertain" ||
      redaction.sujet_choisi === "les_deux" ||
      redaction.sujet_choisi === "non_identifiable"
    ) {
      motifs.push(
        motif(
          "sujet_redaction_ambigu",
          `Sujet de rédaction « ${redaction.sujet_choisi} » : aucune note n’est posée sur les 40 points.`,
        ),
      );
    }
    for (const q of questions) {
      if (q.statut === "illisible") {
        motifs.push(
          motif("copie_partiellement_illisible", `Question ${q.numero} illisible.`, q.question_key),
        );
      }
      if (q.nature_decision === "a_valider") {
        motifs.push(
          motif(
            "interpretation_litteraire_defendable",
            `Question ${q.numero} : décision non prévue au barème, à trancher.`,
            q.question_key,
          ),
        );
      }
    }
    // Les motifs proposés par le modèle ne sont retenus que si leur code
    // existe : un code inventé deviendrait un motif sans degré défini.
    for (const m of sortie.validation_humaine ?? []) {
      const code = (MOTIFS_VALIDATION as readonly string[]).includes(m.code)
        ? (m.code as CodeMotifValidation)
        : "confiance_faible";
      motifs.push(motif(code, m.message, m.cible));
    }

    const { rapport, motifs: motifsRapport } = construireRapportEleve({
      noteBrute: resultat.score_brut,
      noteMax: resultat.score_max,
      blocs: resultat.sections.map((s) => ({
        code: s.code,
        libelle: s.libelle,
        score: s.score ?? 0,
        max: s.max,
      })),
      reussites: sortie.rapport_eleve.reussites,
      priorites: sortie.rapport_eleve.priorites,
      erreurs: sortie.rapport_eleve.erreurs_expliquees,
      aRetravailler: sortie.rapport_eleve.a_retravailler,
      strategie: sortie.rapport_eleve.strategie,
      qualite,
    });
    motifs.push(...motifsRapport);

    const synthese = synthetiserValidation(motifs);

    const resultatComplet = {
      metadata: {
        exam: "DNB",
        series: exam.serie ?? "generale",
        session: exam.session,
        subject: "brevet_francais",
        copy_id: correctionId,
        subject_id: exam.subject_id,
        exam_id: exam.id,
        rubric_version: version.version,
        bareme_version: version.version,
        prompt_version: VERSION_PROMPT_FRANCAIS,
        correction_version: VERSION_CORRECTION_BREVET,
        moteur: "brevet_francais",
        amenagements: (correction.amenagements as string[] | null) ?? [],
      },
      document_quality: qualite,
      sections: resultat.sections,
      score: {
        raw_score: resultat.score_brut,
        raw_max: resultat.score_max,
        raw_max_theorique: 100,
        score_out_of_20: noteSur20,
        note_partielle: resultat.note_partielle,
        blocs_non_notes: resultat.blocs_non_notes,
      },
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

    // --- Ecriture -----------------------------------------------------
    // Une ligne de correction_questions par UNITE DE NOTATION : les
    // questions du texte, puis un agregat par bloc. C'est ce que le trigger
    // correction_recalcule_note additionne, et c'est ainsi que la base
    // recalcule la note independamment de ce fichier.
    await supabase.from("correction_questions").delete().eq("correction_id", correctionId);
    const lignes = questions
      .filter((q) => q.partie !== "reecriture")
      .map((q) => ({
        correction_id: correctionId,
        bareme_version_id: versionId,
        question_key: q.question_key,
        points: q.points,
        max_points: q.max_points,
        bloc: "texte",
        partie: q.partie,
        statut_reponse: q.statut,
        source_regle: q.source_decision,
        nature_decision: q.nature_decision,
        certitude: q.certitude,
        elements_observes: q.elements_trouves,
        elements_manquants: q.elements_manquants,
        erreurs: q.erreurs,
        preuves: q.preuves,
        transcription_incertaine: q.transcription_incertaine,
        relecture_humaine: q.alertes.length > 0 || q.nature_decision === "a_valider",
        motifs_relecture: q.alertes.map((a) => ({ message: a })),
        competences: [],
      }));

    if (reecriture && reecriture.score !== null) {
      lignes.push({
        correction_id: correctionId,
        bareme_version_id: versionId,
        question_key: "bloc_reecriture",
        points: reecriture.score,
        max_points: reecriture.max,
        bloc: "texte",
        partie: "reecriture",
        statut_reponse: null as unknown as string,
        source_regle: "subject_bareme",
        nature_decision: "prevue_par_bareme",
        certitude: 1,
        elements_observes: [],
        elements_manquants: [],
        erreurs: [],
        preuves: [],
        transcription_incertaine: false,
        relecture_humaine: reecriture.bareme_manquant,
        motifs_relecture: reecriture.alertes.map((a) => ({ message: a })),
        competences: [],
      });
    }
    if (dictee.score !== null) {
      lignes.push({
        correction_id: correctionId,
        bareme_version_id: versionId,
        question_key: "bloc_dictee",
        points: dictee.score,
        max_points: dictee.max,
        bloc: "dictee",
        partie: "dictee",
        statut_reponse: null as unknown as string,
        source_regle: configDictee.source_bareme ?? "official_exam_rule",
        nature_decision: "prevue_par_bareme",
        certitude: dictee.decalage_ocr_suspecte ? 0.3 : 1,
        elements_observes: [],
        elements_manquants: [],
        erreurs: [],
        preuves: [],
        transcription_incertaine: dictee.decalage_ocr_suspecte,
        relecture_humaine: dictee.decalage_ocr_suspecte || dictee.zones_illisibles > 0,
        motifs_relecture: dictee.alertes.map((a) => ({ message: a })),
        competences: [],
      });
    }
    if (redaction.score !== null) {
      lignes.push({
        correction_id: correctionId,
        bareme_version_id: versionId,
        question_key: "bloc_redaction",
        points: redaction.score,
        max_points: redaction.max,
        bloc: "redaction",
        partie: "redaction",
        statut_reponse: null as unknown as string,
        source_regle: redaction.grille_issue_du_sujet ? "subject_bareme" : "default_rubric",
        nature_decision: redaction.grille_issue_du_sujet ? "prevue_par_bareme" : "a_valider",
        certitude: 1,
        elements_observes: [],
        elements_manquants: [],
        erreurs: [],
        preuves: [],
        transcription_incertaine: false,
        relecture_humaine: !redaction.grille_issue_du_sujet,
        motifs_relecture: redaction.alertes.map((a) => ({ message: a })),
        competences: [],
      });
    }

    const { error: errQ } = await supabase.from("correction_questions").insert(lignes);
    if (errQ) throw new Error(`Enregistrement des questions : ${errQ.message}`);

    // Detail de la reecriture, forme par forme.
    await supabase.from("correction_reecriture_formes").delete().eq("correction_id", correctionId);
    if (reecriture?.formes.length) {
      const { error } = await supabase.from("correction_reecriture_formes").insert(
        reecriture.formes.map((f) => ({
          correction_id: correctionId,
          cle: f.cle,
          forme_originale: f.forme_originale,
          forme_attendue: f.forme_attendue,
          forme_produite: f.forme_produite,
          transformation: f.transformation,
          statut: f.statut,
          points: f.points,
          max_points: f.max_points,
          type_erreur: f.type_erreur,
          justification: f.justification,
          ambigu: f.ambigu,
        })),
      );
      if (error) throw new Error(`Enregistrement de la réécriture : ${error.message}`);
    }

    // Detail de la dictee, erreur par erreur.
    await supabase.from("correction_dictee_erreurs").delete().eq("correction_id", correctionId);
    if (dictee.erreurs.length) {
      const { error } = await supabase.from("correction_dictee_erreurs").insert(
        dictee.erreurs.map((e) => ({
          correction_id: correctionId,
          rang: e.index,
          segment_attendu: e.segment_attendu,
          segment_produit: e.segment_produit,
          categorie: e.categorie,
          sous_categorie: e.sous_categorie,
          regle: e.regle,
          penalite_prevue: e.penalite_prevue,
          penalite_appliquee: e.penalite_appliquee,
          explication: e.explication,
          certitude: e.certitude,
          repetition_de: e.repetition_de,
        })),
      );
      if (error) throw new Error(`Enregistrement de la dictée : ${error.message}`);
    }

    // Redaction : l'entete puis les criteres.
    await supabase.from("correction_redaction").delete().eq("correction_id", correctionId);
    await supabase.from("correction_redaction_criteres").delete().eq("correction_id", correctionId);
    const { error: errR } = await supabase.from("correction_redaction").insert({
      correction_id: correctionId,
      sujet_choisi: redaction.sujet_choisi,
      grille_appliquee: redaction.grille_appliquee,
      grille_issue_du_sujet: redaction.grille_issue_du_sujet,
      indices_du_choix: sortie.redaction.indices_du_choix ?? [],
      longueur_estimee: redaction.longueur_estimee,
      longueur_minimale: redaction.longueur_minimale,
      score: redaction.score,
      max_points: redaction.max,
    });
    if (errR) throw new Error(`Enregistrement de la rédaction : ${errR.message}`);

    if (redaction.criteres.length) {
      const { error } = await supabase.from("correction_redaction_criteres").insert(
        redaction.criteres.map((c) => ({
          correction_id: correctionId,
          code: c.code,
          libelle: c.libelle,
          score: c.score,
          max_points: c.max,
          niveau: c.niveau,
          preuves: c.preuves,
          points_forts: c.points_forts,
          insuffisances: c.insuffisances,
          erreurs: c.erreurs_representatives,
          conseil: c.conseil,
          certitude: c.certitude,
        })),
      );
      if (error) throw new Error(`Enregistrement des critères de rédaction : ${error.message}`);
    }

    await supabase.from("correction_document_qualite").delete().eq("correction_id", correctionId);
    await supabase.from("correction_document_qualite").insert({
      correction_id: correctionId,
      statut: qualite.statut,
      missing_pages: qualite.missing_pages,
      duplicate_pages: qualite.duplicate_pages,
      uncertain_zones: qualite.uncertain_zones,
      anomalies: qualite.anomalies,
      requires_human_review: qualite.requires_human_review,
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
          degre: m.degre === "recommandee" ? "recommandee" : m.degre,
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
          note_brute: resultat.score_brut,
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
      score_raw: resultat.score_brut,
      max_score: resultat.score_max,
      score_out_of_20: noteSur20,
      note_partielle: resultat.note_partielle,
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
