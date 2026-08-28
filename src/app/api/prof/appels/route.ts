/**
 * Les mains levées, côté prof.
 *
 * GET  ?session=<id> : les élèves qui attendent, du plus ancien au plus récent.
 *                      La console la rappelle toutes les dix secondes.
 * POST { appel_id }  : « c'est réglé » — l'appel est clos.
 *
 * Un prof ne lit que les appels d'une session à laquelle il a accès : la
 * vérification passe par `chargerSessionAutorisee`, la même règle que le reste
 * de l'espace prof, plutôt qu'une deuxième écrite ici.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin, profCourant } from '@/lib/authProf';
import { appelsOuvertsSession, traiterAppel } from '@/lib/appels';
import { chargerSessionAutorisee } from '@/lib/espaceProf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('session') ?? '';
  if (!sessionId) return NextResponse.json({ error: 'Session manquante.' }, { status: 400 });

  const session = await chargerSessionAutorisee(prof, sessionId);
  if (!session) return NextResponse.json({ error: 'Bac blanc introuvable.' }, { status: 404 });

  return NextResponse.json({ appels: await appelsOuvertsSession(sessionId) });
}

export async function POST(req: NextRequest) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  try {
    const { appel_id } = await req.json();
    const appelId = String(appel_id ?? '');
    if (!appelId) return NextResponse.json({ error: 'Appel manquant.' }, { status: 400 });

    // De quelle session vient cet appel ? Un prof ne clôt pas l'appel d'un
    // bac blanc qui n'est pas le sien.
    const { data } = await crmAdmin()
      .from('appels_aide')
      .select('session_id')
      .eq('id', appelId)
      .maybeSingle();

    const sessionId = (data as { session_id: string | null } | null)?.session_id ?? '';
    if (!sessionId || !(await chargerSessionAutorisee(prof, sessionId))) {
      return NextResponse.json({ error: 'Appel introuvable.' }, { status: 404 });
    }

    const resultat = await traiterAppel(appelId, prof.id);
    if (!resultat.ok) return NextResponse.json({ error: resultat.erreur }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ /api/prof/appels POST', err);
    return NextResponse.json({ error: 'Erreur.' }, { status: 500 });
  }
}
