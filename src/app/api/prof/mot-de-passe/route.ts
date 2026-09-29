/**
 * Le prof change lui-même son mot de passe (onglet « Mon profil »).
 *
 * L'ancien mot de passe est exigé : un cookie de session oublié sur un
 * ordinateur partagé ne doit pas suffire à verrouiller le prof dehors.
 * Refusé pendant un « Voir comme » : l'admin qui regarde l'espace d'un prof
 * ne doit pas pouvoir changer son mot de passe par erreur depuis cet écran
 * (elle a sa propre action de réinitialisation dans /direction/profs).
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin, profCourant, verifierForceMotDePasse, verifierMotDePasse } from '@/lib/authProf';

export async function POST(req: NextRequest) {
  const { prof, usurpePar } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  if (usurpePar) {
    return NextResponse.json(
      { error: 'Tu consultes l’espace d’un prof : réinitialise son mot de passe depuis la direction.' },
      { status: 403 },
    );
  }
  if (!prof.user_id) {
    return NextResponse.json({ error: 'Ce compte n’a pas de mot de passe.' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const ancien = String(body.ancien ?? '');
    const nouveau = String(body.nouveau ?? '');

    const faiblesse = verifierForceMotDePasse(nouveau);
    if (faiblesse) return NextResponse.json({ error: faiblesse }, { status: 400 });

    const { ok } = await verifierMotDePasse(prof.email, ancien);
    if (!ok) return NextResponse.json({ error: 'Mot de passe actuel incorrect.' }, { status: 400 });

    const { error } = await crmAdmin().auth.admin.updateUserById(prof.user_id, { password: nouveau });
    if (error) {
      console.error('❌ Changement mot de passe prof:', error);
      return NextResponse.json({ error: 'Impossible de changer le mot de passe.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ Mot de passe prof:', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
