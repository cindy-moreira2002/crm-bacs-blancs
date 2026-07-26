/**
 * Connexion d'un professeur.
 * Le mot de passe est vérifié par Supabase Auth ; on n'en garde aucune trace.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  CHAMPS_PROF,
  authManquant,
  crmAdmin,
  ouvrirSession,
  verifierMotDePasse,
} from '@/lib/authProf';

export async function POST(req: NextRequest) {
  const manquants = authManquant();
  if (manquants.length) {
    return NextResponse.json(
      { error: `Espaces prof non configurés (${manquants.join(', ')}).` },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const motDePasse = String(body.motDePasse ?? '');

    if (!email || !motDePasse) {
      return NextResponse.json({ error: 'E-mail et mot de passe requis.' }, { status: 400 });
    }

    const { ok } = await verifierMotDePasse(email, motDePasse);
    if (!ok) {
      // Message volontairement identique quel que soit le champ fautif :
      // on n'indique pas si l'adresse existe.
      return NextResponse.json({ error: 'E-mail ou mot de passe incorrect.' }, { status: 401 });
    }

    const { data: prof } = await crmAdmin()
      .from('professeurs')
      .select(CHAMPS_PROF)
      .eq('email', email)
      .maybeSingle();

    if (!prof) {
      return NextResponse.json(
        { error: "Aucun espace prof n'est rattaché à ce compte. Contacte l'administratrice." },
        { status: 403 },
      );
    }
    if ((prof as { statut_compte: string }).statut_compte === 'suspendu') {
      return NextResponse.json(
        { error: "Ce compte est suspendu. Contacte l'administratrice." },
        { status: 403 },
      );
    }

    await ouvrirSession((prof as { id: string }).id);
    return NextResponse.json({ success: true, prof });
  } catch (err) {
    console.error('❌ Connexion prof:', err);
    return NextResponse.json({ error: 'Erreur de connexion.' }, { status: 500 });
  }
}
