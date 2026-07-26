
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
    return jsonResponse({ error: "PIPELINE_INTERNAL_SECRET n’est pas configuré." }, 500);
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
  return { apiKey, model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5" };
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

function extractText(payload: Record<string, unknown>): string {
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

// Retire d'éventuelles clôtures markdown ```html … ``` autour du corps HTML.
function cleanBody(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "");
  // Si le modèle a renvoyé un document complet, on n'extrait que le <body>.
  const m = t.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (m) t = m[1];
  return t.trim();
}

/* ==========================================================================
   CHARTE DE MARQUE — LES MATINÉES DU BAC
   CSS identique pour toutes les matières. Le modèle ne produit QUE le corps.
   ========================================================================== */
const PAGE_CSS = `
  :root{
    --ink:#2b2b2b; --muted:#8a8a90;
    --bordeaux:#7c1f2c; --bordeaux-dark:#5a1622; --bordeaux-r:#9c3446;
    --num:#33283f; --orange:#df8a1f;
    --said-bg:#eeeef1; --reform-bg:#f7e7ec; --cream-bg:#f5eed7; --cream-border:#b89434;
    --gain:#8f7a2c; --gold-head:#c1852f; --line:#e4e4ea;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{font-family:-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif;color:var(--ink);background:#f2f2f4;line-height:1.5;font-size:14px;-webkit-font-smoothing:antialiased;}
  .page{max-width:820px;margin:22px auto;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.10);border-top:9px solid var(--bordeaux);padding:0 0 40px;}
  .wrap{padding:0 54px;}
  .cover-band{background:var(--bordeaux-dark);color:#fff;text-align:center;padding:34px 20px 26px;border-bottom:5px solid var(--bordeaux-r);}
  .cover-band h1{margin:0;font-size:27px;letter-spacing:3px;font-weight:700;}
  .cover-band .sub{margin-top:7px;font-size:13px;letter-spacing:2px;opacity:.9;}
  .cover-id{text-align:center;padding:40px 20px 6px;}
  .cover-id .name{font-size:30px;color:var(--bordeaux);font-weight:600;}
  .cover-id .work{font-size:17px;margin-top:12px;font-weight:600;}
  .cover-id .work-meta{font-size:13px;color:var(--muted);margin-top:3px;}
  .badge{display:flex;justify-content:center;align-items:stretch;margin:30px auto 8px;width:230px;}
  .badge .n{background:var(--orange);color:#fff;font-size:52px;font-weight:700;padding:12px 26px;display:flex;align-items:center;}
  .badge .d{background:var(--orange);color:#fff;opacity:.92;font-size:20px;display:flex;align-items:center;padding:0 22px;border-left:2px solid rgba(255,255,255,.35);}
  .cover-note{text-align:center;color:var(--bordeaux);font-size:13px;margin-top:6px;letter-spacing:.5px;}
  table{border-collapse:collapse;width:100%;margin:18px 0;font-size:13px;}
  th{background:var(--bordeaux-dark);color:#fff;text-align:left;padding:9px 12px;font-weight:600;}
  td{padding:9px 12px;border-bottom:1px solid var(--line);}
  tr:nth-child(even) td{background:#f7f7fa;}
  .bareme td.n,.bareme th.n{text-align:center;width:70px;}
  .bareme tr.total td{background:#f6e7ea;color:var(--bordeaux);font-weight:700;}
  .cap{font-size:11.5px;color:var(--muted);text-align:center;margin:6px 40px 0;line-height:1.45;}
  .sec{margin-top:40px;}
  .sec-h{display:flex;align-items:stretch;margin-bottom:20px;}
  .sec-h .num{background:var(--num);color:#fff;font-weight:700;font-size:17px;display:flex;align-items:center;justify-content:center;width:48px;}
  .sec-h .ttl{background:linear-gradient(90deg,var(--bordeaux),var(--bordeaux-r));color:#fff;flex:1;display:flex;align-items:center;padding:0 18px;font-size:14.5px;letter-spacing:1.5px;font-weight:600;}
  h3.sub{color:var(--bordeaux);font-size:15px;margin:26px 0 10px;font-weight:600;}
  h4.subq{color:var(--bordeaux);font-size:13.5px;margin:22px 0 8px;font-weight:600;}
  p{margin:10px 0;} .just{text-align:justify;}
  .box{padding:12px 16px;margin:12px 0;border-left:4px solid #ccc;font-size:13px;}
  .box .lab{font-size:10.5px;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:5px;}
  .box.said{background:var(--said-bg);border-left-color:#b9b9c2;}
  .box.reform{background:var(--reform-bg);border-left-color:var(--bordeaux);}
  .box.reform .lab{color:var(--bordeaux);}
  .box.cream{background:var(--cream-bg);border-left-color:var(--cream-border);}
  .box.cream .lab{color:#9a7a1e;}
  .analysis{font-size:13px;margin:10px 0;text-align:justify;} .analysis b.tag{color:var(--bordeaux);}
  .gain{font-size:12px;color:var(--gain);margin:6px 0 2px;} .add{color:var(--bordeaux);font-weight:600;}
  .radar td.sc{font-weight:700;font-size:15px;text-align:center;width:52px;color:var(--num);}
  .bar{background:#e6e6ec;border-radius:7px;height:12px;width:150px;overflow:hidden;}
  .bar>i{display:block;height:100%;background:var(--bordeaux);border-radius:7px;}
  .radar td.bcell{width:170px;}
  .err{border-left:4px solid var(--bordeaux);background:#faf3f4;padding:12px 16px;margin:12px 0;}
  .err .t{color:var(--bordeaux);font-weight:600;margin-bottom:5px;font-size:13.5px;}
  .good{border-left:4px solid var(--cream-border);background:var(--cream-bg);padding:12px 16px;margin:12px 0;}
  .good .t{color:#9a7a1e;font-weight:600;margin-bottom:5px;font-size:13.5px;}
  .prio{margin:14px 0;}
  .prio .ph{background:var(--gold-head);color:#fff;padding:7px 14px;font-weight:600;font-size:13px;display:flex;gap:12px;}
  .prio .ph .k{font-weight:700;}
  .prio .pb{background:#faf6ec;padding:9px 14px;font-size:12.5px;} .prio .pb .s{color:var(--muted);}
  .memo .mh{background:var(--bordeaux);color:#fff;padding:7px 14px;font-size:12px;letter-spacing:.6px;margin-top:14px;}
  .memo .mb{background:var(--reform-bg);padding:6px 14px;}
  .memo ul{margin:0;padding:10px 14px 12px 30px;} .memo li{margin:6px 0;font-size:13px;}
  .kicker{text-align:center;color:var(--bordeaux);font-size:14px;margin:26px 40px 4px;font-weight:600;line-height:1.5;}
  .foot{margin-top:46px;border-top:1px solid var(--line);padding-top:10px;display:flex;justify-content:space-between;font-size:11px;color:var(--muted);}
  @media print{body{background:#fff;} .page{box-shadow:none;margin:0;}}
`;

// Guide des composants (marque, partagé). Dit au modèle QUELLES classes utiliser.
const COMPONENT_GUIDE = `
Tu produis un DOSSIER DE CORRECTION au format HTML pour Les Matinées du Bac.
RÈGLES DE SORTIE ABSOLUES :
- Tu renvoies UNIQUEMENT le contenu HTML intérieur (ce qui va dans <body>). AUCUNE balise <html>, <head>, <style>, <!doctype>. AUCUNE clôture markdown (pas de triple backticks).
- Tu utilises EXCLUSIVEMENT les classes CSS listées ci-dessous (elles sont déjà stylées). N'invente aucune classe, n'ajoute aucun style inline sauf la largeur des barres du radar (style="width:NN%").
- Tout le contenu est enveloppé dans : <div class="page"> … la couverture … <div class="wrap"> … les sections … </div></div>.

CHARTE DES DONNÉES (à respecter, ne jamais réinventer) :
- La NOTE et le BARÈME viennent EXACTEMENT de la correction fournie (result_json). Tu ne recorriges pas, tu ne changes aucun score.
- Les CITATIONS de la copie viennent EXCLUSIVEMENT de la transcription fournie. N'invente jamais une phrase d'élève.
- Les reformulations, versions améliorées et exercices sont des ajouts pédagogiques : ils s'appuient sur les "improvement"/"priorites_amelioration" de la correction et sur le texte réel.

COMPOSANTS DISPONIBLES (copie la structure exacte) :

Couverture (bandeau + identité + badge note + barème) :
<div class="cover-band"><h1>DOSSIER DE CORRECTION</h1><div class="sub">MATIÈRE · EXERCICE</div></div>
<div class="cover-id"><div class="name">Prénom</div><div class="work">Titre du sujet</div><div class="work-meta">Auteur · type · contexte</div><div class="badge"><div class="n">NOTE</div><div class="d">/ 20</div></div><div class="cover-note">soit une fourchette de X à Y / 20</div></div>

Ouvre ensuite <div class="wrap"> puis mets le barème :
<table class="bareme"><tr><th>Critère</th><th class="n">Note</th><th class="n">Barème</th></tr> … <tr class="total"><td>TOTAL</td><td class="n">…</td><td class="n">/20</td></tr></table>
<div class="cap">phrase de contexte</div>

En-tête de section (numéro + titre) :
<div class="sec"><div class="sec-h"><div class="num">1</div><div class="ttl">TITRE DE SECTION</div></div> … </div>

Sous-titres : <h3 class="sub">…</h3> et <h4 class="subq">…</h4>. Paragraphes : <p class="just">…</p>.

Encadré "ce que l'élève a écrit" (gris) :
<div class="box said"><div class="lab">Ce que tu as écrit</div>« citation exacte de la transcription »</div>
Analyse : <p class="analysis"><b class="tag">Analyse —</b> …</p>
Encadré reformulation (rose) :
<div class="box reform"><div class="lab">Reformulation conseillée</div>…</div>
Gain (olive) : <div class="gain">Ce que tu gagnes · …</div>
Encadré conseil/chantier (crème) : <div class="box cream"><div class="lab">Conseil</div>…</div>

Radar de compétences (barre = score/10 en %) :
<table class="radar"><tr><th>Compétence</th><th class="n">/10</th><th class="bcell">Niveau</th><th>Observation</th></tr>
<tr><td>Nom</td><td class="sc">7,5</td><td class="bcell"><div class="bar"><i style="width:75%"></i></div></td><td>observation courte</td></tr></table>

Freins / réussites :
<div class="err"><div class="t">Frein 1 — titre</div>problème · pourquoi ça coûte · comment corriger</div>
<div class="good"><div class="t">✓ réussite</div>pourquoi c'est bien</div>

Chantiers numérotés (plan de progression) :
<div class="prio"><div class="ph"><span class="k">1</span><span>titre</span></div><div class="pb"><span class="s">Problème :</span> … <span class="s">Action :</span> …</div></div>

Tables exercices / projection : <table><tr><th colspan="2">Exercice 1 · titre</th></tr><tr><td style="width:130px;color:var(--muted)">Objectif</td><td>…</td></tr>…</table>

Fiche mémo : <div class="sec memo"> … <div class="mh">TITRE</div><div class="mb"><ul><li>…</li></ul></div> … <div class="kicker">phrase de fin motivante</div></div>

Pied de page (dernière ligne, dans .wrap) :
<div class="foot"><span>Dossier de correction — Prénom · Titre</span><span>Les Matinées du Bac</span></div>
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, 405);

  const denied = assertInternalSecret(req);
  if (denied) return denied;

  let correctionId = "";
  try {
    const body = await req.json();
    correctionId = String(body.correction_id ?? "");
    const audience = String(body.audience ?? "eleve");
    if (!correctionId) return jsonResponse({ error: "correction_id est obligatoire." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getSupabaseSecretKey(),
      { auth: { persistSession: false } },
    );

    // 1. Correction (doit être corrigée)
    const { data: correction, error: cErr } = await supabase
      .from("corrections").select("*").eq("id", correctionId).single();
    if (cErr || !correction) {
      return jsonResponse({ error: "Correction introuvable.", details: cErr }, 404);
    }
    if (!correction.result_json) {
      return jsonResponse({ error: "Aucune correction disponible (result_json vide). Lance d’abord correct-*." }, 409);
    }

    // 2. Transcription
    const { data: transcriptionRow } = await supabase
      .from("copy_transcriptions").select("*").eq("correction_id", correctionId).single();

    // 3. Fiche sujet
    const { data: subject } = await supabase
      .from("subject_cards").select("*").eq("id", correction.subject_id).single();

    // 4. Matière (tolérant : correction, sinon fiche sujet)
    const matiere =
      correction.matiere ?? subject?.matiere ?? (subject?.card_json?.matiere) ?? null;

    // 5. Choix du template : track + exercice + destinataire + actif (+ matière si connue)
    let q = supabase
      .from("dossier_templates").select("*")
      .eq("track", correction.track)
      .eq("exercise_type", correction.exercise_type)
      .eq("audience", audience)
      .eq("status", "active");
    if (matiere) q = q.eq("matiere", matiere);
    const { data: templates, error: tErr } = await q.order("version", { ascending: false });
    if (tErr) throw new Error(`Recherche de template impossible: ${tErr.message}`);
    const template = templates && templates[0];
    if (!template) {
      return jsonResponse({
        error: "Aucun template de dossier actif ne correspond.",
        recherche: { track: correction.track, matiere, exercise_type: correction.exercise_type, audience, status: "active" },
      }, 404);
    }

    // 6. Appel Claude : system = guide marque + sections de la matière
    const { apiKey, model } = getAnthropicConfig();
    const dataPayload = {
      identite: {
        eleve: correction.student_name ?? correction.eleve ?? "Élève",
      },
      sujet: subject?.card_json ?? subject ?? null,
      correction: correction.result_json,
      transcription: transcriptionRow?.transcription_json ?? null,
    };

    const anthropicPayload = await callAnthropic(apiKey, {
      model,
      max_tokens: 22000,
      system: COMPONENT_GUIDE + "\n\n=== STRUCTURE DE CE DOSSIER (spécifique à la matière) ===\n" + template.system_prompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "DONNÉES DE LA COPIE (à mettre en page selon la structure ci-dessus, sans rien réinventer) :\n" +
                JSON.stringify(dataPayload) +
                "\n\nProduis maintenant le corps HTML complet du dossier (uniquement le contenu de <body>).",
            },
          ],
        },
      ],
    });

    const inner = cleanBody(extractText(anthropicPayload));
    const html =
      `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>Dossier de correction</title><style>${PAGE_CSS}</style></head><body>` +
      inner + `</body></html>`;

    // 7. Enregistrement
    const { data: saved, error: sErr } = await supabase
      .from("dossiers")
      .insert({
        correction_id: correctionId,
        template_id: template.id,
        audience,
        content: html,
        format: "html",
        model_name: model,
      })
      .select("id")
      .single();
    if (sErr) throw new Error(`Enregistrement du dossier impossible: ${sErr.message}`);

    return jsonResponse({
      ok: true,
      correction_id: correctionId,
      dossier_id: saved?.id,
      template_id: template.id,
      bytes: html.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
