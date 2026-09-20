/**
 * GET /api/eleve/packs — les matinées prépayées de l'élève connecté.
 *
 * L'identité vient UNIQUEMENT du cookie signé (`lib/authEleve`) : aucune
 * adresse passée en paramètre n'est acceptée, sinon connaître l'adresse d'un
 * camarade suffirait à lire ce qu'il a acheté.
 *
 * On ne renvoie que les packs RÉGLÉS et non périmés : un pack en attente de
 * paiement ne donne droit à rien, et l'afficher comme disponible ferait venir
 * une famille qui croit avoir payé.
 */
import { NextResponse } from 'next/server';
import { eleveConnecte } from '@/lib/authEleve';
import { crmAdmin } from '@/lib/authProf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const email = await eleveConnecte();
  if (!email) {
    return NextResponse.json(
      { error: 'Connecte-toi à ton espace élève pour voir tes matinées.' },
      { status: 401 },
    );
  }

  try {
    const { data, error } = await crmAdmin()
      .from('v_packs_eleve')
      .select('id, email, code, libelle, matinees_total, matinees_utilisees, matinees_restantes, expire_le, paiement_statut');
    // Vue absente (script 54 pas encore joué) : pas de pack, pas d'erreur à
    // l'écran — l'espace élève doit s'afficher quoi qu'il arrive.
    if (error) return NextResponse.json({ packs: [] });

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const miens = (data ?? [])
      .filter((p) => String((p as { email: string }).email).trim().toLowerCase() === email)
      .filter((p) => (p as { paiement_statut: string }).paiement_statut === 'paye')
      .filter((p) => (p as { expire_le: string }).expire_le >= aujourdhui)
      .filter((p) => Number((p as { matinees_restantes: number }).matinees_restantes) > 0)
      .map(({ email: _sansAdresse, ...reste }) => reste);

    return NextResponse.json({ packs: miens });
  } catch (err) {
    console.error('❌ /api/eleve/packs', err);
    return NextResponse.json({ packs: [] });
  }
}
