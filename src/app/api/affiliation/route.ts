/**
 * GET /api/affiliation?code=CLAIRE3F7B — « ce code existe-t-il ? »
 *
 * Appelée par le formulaire d'inscription pendant que l'élève tape, pour
 * afficher « ✅ Recommandé par Claire M. » plutôt que de laisser partir un
 * code fautif qu'on ne verrait jamais.
 *
 * Ne renvoie QUE le prénom et l'initiale du nom : on confirme un code déjà
 * connu de la personne, on ne publie pas l'annuaire des professeurs. Aucune
 * liste : sans code exact en entrée, rien ne sort.
 */
import { NextRequest, NextResponse } from 'next/server';
import { nomCourt, normaliserCode, profParCode } from '@/lib/affiliation';
import { lireCodePromo } from '@/lib/codesPromo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = normaliserCode(req.nextUrl.searchParams.get('code'));
  if (code.length < 4) {
    return NextResponse.json({ connu: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Le répertoire des codes promo fait FOI : un code de prof retiré du
  // répertoire ne donne plus rien, même si le professeur existe encore.
  const [prof, promo] = await Promise.all([profParCode(code), lireCodePromo(code)]);

  if (!promo) {
    return NextResponse.json({ connu: false, code }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json(
    {
      connu: true,
      code: promo.code,
      // Le prénom du prof quand il y en a un, sinon le libellé du code
      // (« Lycée Camille Sée », « Campagne rentrée ») : la famille doit
      // reconnaître ce qu'elle a saisi, sans qu'on publie l'annuaire.
      prof: prof ? nomCourt(prof) : null,
      libelle: promo.libelle,
      remise: Number(promo.remise_euros) || 0,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
