/**
 * « Voir comme » — l'administratrice ouvre l'espace d'un prof.
 *
 * C'est la réponse à « je veux pouvoir accéder à chaque espace Prof » sans
 * connaître les mots de passe : on pose un cookie signé qui dit quel espace
 * afficher. Le compte réellement connecté reste celui de l'admin, et un bandeau
 * rouge le rappelle en permanence.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin, definirVoirComme, profConnecte } from '@/lib/authProf';

export async function POST(req: NextRequest) {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé à l’administratrice.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const cible = body.professeurId ? String(body.professeurId) : null;

  // Sans cible : on arrête l'usurpation et l'admin revient chez elle.
  if (!cible) {
    await definirVoirComme(null);
    return NextResponse.json({ success: true, voirComme: null });
  }

  const { data: prof } = await crmAdmin()
    .from('professeurs')
    .select('id, prenom, nom')
    .eq('id', cible)
    .maybeSingle();

  if (!prof) {
    return NextResponse.json({ error: 'Professeur introuvable.' }, { status: 404 });
  }

  await definirVoirComme(cible);
  return NextResponse.json({ success: true, voirComme: prof });
}
