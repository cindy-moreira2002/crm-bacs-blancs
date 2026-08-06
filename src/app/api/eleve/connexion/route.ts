/**
 * POST /api/eleve/connexion — vérifie le code et ouvre la session élève.
 * POST /api/eleve/deconnexion vit à côté ; ici on n'ouvre que.
 *
 * Aucune donnée n'est renvoyée : le navigateur repart avec un cookie signé,
 * et c'est ce cookie — jamais un paramètre d'URL — qui déterminera ensuite de
 * qui l'on lit les copies et les inscriptions.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  normaliserEmail,
  ouvrirSessionEleve,
  secretElevePresent,
  verifierDefi,
} from '@/lib/authEleve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!secretElevePresent()) {
    return NextResponse.json(
      { error: 'Connexion non configurée (PROF_SESSION_SECRET).' },
      { status: 503 },
    );
  }

  let email = '';
  let code = '';
  let defi = '';
  try {
    const body = await req.json();
    email = normaliserEmail(body?.email);
    code = String(body?.code ?? '').trim().toUpperCase();
    defi = String(body?.defi ?? '');
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  if (!verifierDefi(email, code, defi)) {
    // Un seul message pour « code faux » et « code expiré » : inutile d'aider
    // qui essaie au hasard à savoir laquelle des deux hypothèses creuser.
    return NextResponse.json(
      { error: 'Code incorrect ou expiré. Demande un nouveau code.' },
      { status: 401 },
    );
  }

  await ouvrirSessionEleve(email);
  return NextResponse.json({ ok: true });
}
