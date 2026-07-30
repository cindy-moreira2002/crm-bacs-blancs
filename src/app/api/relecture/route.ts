import { NextRequest, NextResponse } from 'next/server';
import { pipelineDb, pipelineManquant } from '@/lib/pipeline';
import { jetonRelectureValide } from '@/lib/relecture';

export const dynamic = 'force-dynamic';

/**
 * POST — enregistre les réponses d'un professeur relecteur.
 *
 * Protégé par le même jeton signé que la page /relecture/[matiere] :
 * impossible de poster sans avoir reçu le lien. Les réponses vont dans
 * public.relecture_feedback (voir supabase/sql/15_relecture_prof.sql).
 */
export async function POST(req: NextRequest) {
  const manquants = pipelineManquant();
  if (manquants.length) {
    return NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON attendu.' }, { status: 400 });
  }

  const matiere = String(body.matiere ?? '').toLowerCase().trim();
  const jeton = String(body.jeton ?? '');
  if (!matiere || !jetonRelectureValide(matiere, jeton)) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 401 });
  }

  // Pot de miel : un robot qui remplit tout se signale ici. On répond
  // « merci » sans rien enregistrer.
  if (String(body.site ?? '').trim()) {
    return NextResponse.json({ ok: true });
  }

  const profNom = String(body.prof_nom ?? '').trim();
  const profEmail = String(body.prof_email ?? '').trim();
  if (!profNom || !profEmail) {
    return NextResponse.json({ error: 'Nom et e-mail obligatoires.' }, { status: 400 });
  }

  const reponsesBrutes = (body.reponses ?? {}) as Record<string, unknown>;
  const reponses: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(reponsesBrutes)) {
    if (/^[a-z_]{1,40}$/.test(cle)) reponses[cle] = String(valeur ?? '').slice(0, 8000);
  }
  if (!Object.values(reponses).some((v) => v.trim())) {
    return NextResponse.json({ error: 'Répondez à au moins une question.' }, { status: 400 });
  }

  const { error } = await pipelineDb()
    .from('relecture_feedback')
    .insert({
      matiere,
      prof_nom: profNom.slice(0, 120),
      prof_email: profEmail.slice(0, 200),
      etablissement: String(body.etablissement ?? '').trim().slice(0, 200) || null,
      reponses,
    });

  if (error) {
    // Cas le plus probable : la table n'existe pas encore (SQL 15 non joué).
    console.error('relecture_feedback insert:', error.message);
    return NextResponse.json(
      { error: 'Enregistrement impossible pour le moment. Réessayez, ou répondez par e-mail.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
