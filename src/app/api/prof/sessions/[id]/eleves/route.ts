/**
 * Le document de la copie d'un élève, collé par le prof depuis sa console.
 *
 * PATCH { inscription_id, copie_doc_url } — une adresse vide efface le lien.
 *
 * Pourquoi le prof et pas seulement l'administration : c'est lui qui reçoit
 * l'adresse du document au moment où l'élève commence à rédiger. Lui demander
 * de la faire poser par quelqu'un d'autre revenait à ne jamais l'avoir.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin, profCourant } from '@/lib/authProf';
import { chargerSessionAutorisee } from '@/lib/espaceProf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Next 16 : params est une promesse.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  const { id: sessionId } = await params;
  const session = await chargerSessionAutorisee(prof, sessionId);
  if (!session) return NextResponse.json({ error: 'Bac blanc introuvable.' }, { status: 404 });

  try {
    const body = await req.json();
    const inscriptionId = String(body.inscription_id ?? '');
    const url = String(body.copie_doc_url ?? '').trim();

    if (!inscriptionId) {
      return NextResponse.json({ error: 'Élève manquant.' }, { status: 400 });
    }
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'L’adresse doit commencer par https://' }, { status: 400 });
    }

    const db = crmAdmin();

    // L'élève doit appartenir à CETTE session : sans ce contrôle, un prof
    // pourrait écrire sur l'inscription d'un bac blanc qui n'est pas le sien.
    const { data: inscription } = await db
      .from('inscriptions')
      .select('id, session_id')
      .eq('id', inscriptionId)
      .maybeSingle();

    if (!inscription || (inscription as { session_id: string | null }).session_id !== sessionId) {
      return NextResponse.json({ error: 'Élève introuvable sur ce bac blanc.' }, { status: 404 });
    }

    const { error } = await db
      .from('inscriptions')
      .update({ copie_doc_url: url || null })
      .eq('id', inscriptionId);

    if (error) {
      const manque = /copie_doc_url/.test(error.message ?? '');
      return NextResponse.json(
        {
          error: manque
            ? 'La colonne n’existe pas encore : le script SQL 51 n’a pas été passé.'
            : error.message,
        },
        { status: manque ? 409 : 500 },
      );
    }

    return NextResponse.json({ success: true, copie_doc_url: url || null });
  } catch (err) {
    console.error('❌ /api/prof/sessions/[id]/eleves PATCH', err);
    return NextResponse.json({ error: 'Erreur.' }, { status: 500 });
  }
}
