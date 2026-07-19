import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service_role côté serveur : passe outre RLS. Repli sur anon en dev local.
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET /api/copies/fichier?id=... → renvoie le fichier d'origine déposé par le prof
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 });

    const { data, error } = await supabase
      .from('copies')
      .select('fichier_base64, fichier_type, fichier_nom, eleve_nom')
      .eq('id', id)
      .single();
    if (error || !data?.fichier_base64) {
      return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });
    }

    const b64 = data.fichier_base64.includes(',') ? data.fichier_base64.split(',')[1] : data.fichier_base64;
    const buf = Buffer.from(b64, 'base64');
    const type = data.fichier_type || 'application/octet-stream';
    const name = (data.fichier_nom || `Copie_${data.eleve_nom}`).replace(/[^a-zA-Z0-9._-]/g, '_');

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Disposition': `inline; filename="${name}"`,
      },
    });
  } catch (err) {
    console.error('❌ Erreur lecture fichier copie:', err);
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
