/**
 * POST /api/direction/invitation — fabriquer le lien d'entrée d'un membre
 * de la direction.
 *
 * Le lien ouvre /direction/acces?t=…, où la personne choisit ELLE-MÊME son
 * mot de passe. C'est la seule façon d'ouvrir un accès : personne, pas même
 * l'administratrice, ne connaît le mot de passe de quelqu'un d'autre.
 *
 * Ce que fait exactement le lien, et rien d'autre :
 *   • il ne vaut que pour l'adresse écrite dans sa signature ;
 *   • il expire (72 h) ;
 *   • il crée, pour cette adresse, un compte avec l'accès direction.
 *
 * Cette route existait déjà sous forme de script en ligne de commande
 * (scripts/lien-acces-admin.mjs). Elle passe dans l'interface parce qu'ouvrir
 * un accès ne doit pas demander un terminal.
 */
import { NextRequest, NextResponse } from 'next/server';
import { jetonAccesAdmin, secretAccesAdminPresent, VALIDITE_LIEN_ADMIN_MS } from '@/lib/accesAdmin';
import { gardeApiAdmin } from '@/lib/gardeAcces';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  if (!secretAccesAdminPresent()) {
    return NextResponse.json(
      { error: 'PIPELINE_INTERNAL_SECRET manquant sur le serveur : impossible de signer un lien.' },
      { status: 503 },
    );
  }

  let corps: Record<string, unknown>;
  try {
    corps = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête illisible' }, { status: 400 });
  }

  const email = String(corps.email ?? '').trim().toLowerCase();
  if (!email.includes('@') || email.length < 5) {
    return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 });
  }

  const expire = Date.now() + VALIDITE_LIEN_ADMIN_MS;
  const jeton = jetonAccesAdmin(email, expire);

  // L'origine réelle de la requête : le lien doit être cliquable depuis le
  // domaine par lequel on est entré (espaces.matineesdubac.fr en production).
  const hote = req.headers.get('host') ?? 'espaces.matineesdubac.fr';
  const protocole = hote.startsWith('localhost') ? 'http' : 'https';

  return NextResponse.json({
    lien: `${protocole}://${hote}/direction/acces?t=${jeton}`,
    email,
    expire: new Date(expire).toISOString(),
  });
}
