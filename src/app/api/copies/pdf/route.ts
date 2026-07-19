import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service_role côté serveur : passe outre RLS. Repli sur anon en dev local.
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET /api/copies/pdf?id=... → renvoie le PDF stocké
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 });

    const { data, error } = await supabase
      .from('copies')
      .select('pdf_base64, eleve_nom, matiere')
      .eq('id', id)
      .single();
    if (error || !data?.pdf_base64) {
      return NextResponse.json({ error: 'PDF introuvable' }, { status: 404 });
    }

    const b64 = data.pdf_base64.includes(',') ? data.pdf_base64.split(',')[1] : data.pdf_base64;
    const buf = Buffer.from(b64, 'base64');
    const name = `Dossier_${data.eleve_nom}_${data.matiere}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}.pdf"`,
      },
    });
  } catch (err) {
    console.error('❌ Erreur téléchargement PDF:', err);
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
