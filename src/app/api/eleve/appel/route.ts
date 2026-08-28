/**
 * La main levée, côté élève.
 *
 * GET  : « ai-je la main levée ? », pour mes inscriptions du jour.
 * POST : { inscription_id, action: 'lever' | 'baisser', motif? }.
 *
 * L'identité vient UNIQUEMENT du cookie signé (`lib/authEleve`) : l'inscription
 * passée en paramètre est vérifiée comme appartenant bien à l'élève connecté.
 * Sans cette vérification, connaître l'identifiant d'un camarade suffirait à
 * faire sonner le prof à sa place pendant son épreuve.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin } from '@/lib/authProf';
import { eleveConnecte, normaliserEmail } from '@/lib/authEleve';
import { appelOuvertDeLEleve, baisserLaMain, leverLaMain } from '@/lib/appels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const refus = () =>
  NextResponse.json({ error: 'Connecte-toi à ton espace élève.' }, { status: 401 });

/** Les inscriptions de cet élève — la seule liste sur laquelle il peut agir. */
async function mesInscriptions(email: string): Promise<{ id: string; session_id: string | null }[]> {
  const { data } = await crmAdmin()
    .from('inscriptions')
    .select('id, session_id, email')
    .ilike('email', normaliserEmail(email));
  return (data ?? []) as { id: string; session_id: string | null }[];
}

export async function GET() {
  const email = await eleveConnecte();
  if (!email) return refus();

  const inscriptions = await mesInscriptions(email);
  const appels = await Promise.all(
    inscriptions.map(async (i) => ({ inscription_id: i.id, appel: await appelOuvertDeLEleve(i.id) })),
  );

  return NextResponse.json({
    appels: appels.filter((a) => a.appel).map((a) => ({ inscription_id: a.inscription_id, ...a.appel })),
  });
}

export async function POST(req: NextRequest) {
  const email = await eleveConnecte();
  if (!email) return refus();

  try {
    const body = await req.json();
    const inscriptionId = String(body.inscription_id ?? '');
    const action = body.action === 'baisser' ? 'baisser' : 'lever';
    const motif = body.motif === 'technique' ? 'technique' : 'aide';

    if (!inscriptionId) {
      return NextResponse.json({ error: 'Inscription manquante.' }, { status: 400 });
    }

    // Le contrôle qui compte : cette inscription est-elle bien la sienne ?
    const inscriptions = await mesInscriptions(email);
    if (!inscriptions.some((i) => i.id === inscriptionId)) {
      return NextResponse.json({ error: 'Ce bac blanc n’est pas le tien.' }, { status: 403 });
    }

    const resultat =
      action === 'baisser'
        ? await baisserLaMain(inscriptionId)
        : await leverLaMain(inscriptionId, { motif, source: 'espace' });

    if (!resultat.ok) {
      return NextResponse.json({ error: resultat.erreur }, { status: 500 });
    }
    return NextResponse.json({ success: true, main_levee: action === 'lever' });
  } catch (err) {
    console.error('❌ /api/eleve/appel POST', err);
    return NextResponse.json({ error: 'Erreur.' }, { status: 500 });
  }
}
