import { NextRequest, NextResponse } from 'next/server';
import {
  codeDepotConfigure,
  fermerAccesCode,
  ouvrirAccesCode,
  verifierCodeDepot,
} from '@/lib/accesDepot';

export const dynamic = 'force-dynamic';

/**
 * POST — ouvre l'accès au dépôt avec le code partagé.
 * DELETE — referme cet accès (bouton « Quitter »).
 *
 * Le code n'est jamais renvoyé au navigateur ni écrit dans un log : en cas
 * d'échec on ne journalise que le fait qu'une tentative a eu lieu.
 */
export async function POST(req: NextRequest) {
  if (!codeDepotConfigure()) {
    return NextResponse.json(
      { error: "Le code d'accès n'est pas configuré sur ce serveur." },
      { status: 503 },
    );
  }

  try {
    const { code } = await req.json();
    if (!verifierCodeDepot(String(code ?? ''))) {
      console.warn('⚠️ /api/depot/acces : code refusé');
      return NextResponse.json({ error: "Code d'accès incorrect." }, { status: 401 });
    }

    await ouvrirAccesCode();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ /api/depot/acces POST', err);
    return NextResponse.json({ error: 'Erreur inconnue' }, { status: 500 });
  }
}

export async function DELETE() {
  await fermerAccesCode();
  return NextResponse.json({ ok: true });
}
