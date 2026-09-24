/**
 * Les codes d'épreuve d'un bac blanc, pour la console du professeur.
 *
 * GET  → la liste (créée au premier appel, puis stable).
 * POST { code } → libère ce code : l'élève pourra le ressaisir sur un autre
 *                 poste. C'est le filet de sécurité du jour J — un ordinateur
 *                 qui plante ne doit pas coûter la copie.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profCourant } from '@/lib/authProf';
import { codeCopie } from '@/lib/codeCopie';
import { codesDeLaSession, codesDisponibles, libererCode } from '@/lib/ecritureAcces';
import {
  chargerElevesSession,
  chargerSessionAutorisee,
  type SessionEnrichie,
} from '@/lib/espaceProf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  const { id: sessionId } = await params;
  const session = await chargerSessionAutorisee(prof, sessionId);
  if (!session) return NextResponse.json({ error: 'Bac blanc introuvable.' }, { status: 404 });
  if (!codesDisponibles()) return NextResponse.json({ actif: false, codes: [] });
  const codes = await codesDe(session, { nom: `${prof.prenom ?? ''} ${prof.nom ?? ''}`.trim() });
  return NextResponse.json({
    actif: true,
    // Séparés dès le serveur : le professeur a SON code, et la liste de ses
    // élèves sert à débloquer, pas à dicter.
    moi: codes.find((c) => c.role === 'prof') ?? null,
    codes: codes.filter((c) => c.role !== 'prof'),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  const { id: sessionId } = await params;
  const session = await chargerSessionAutorisee(prof, sessionId);
  if (!session) return NextResponse.json({ error: 'Bac blanc introuvable.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const code = String((body as { code?: string }).code ?? '').trim();
  if (!code) return NextResponse.json({ error: 'Code manquant.' }, { status: 400 });

  // Le code doit appartenir à CETTE session : sans ce contrôle, un professeur
  // pourrait libérer l'accès d'un bac blanc qui n'est pas le sien.
  const codes = await codesDe(session, { nom: `${prof.prenom ?? ''} ${prof.nom ?? ''}`.trim() });
  if (!codes.some((c) => c.code === code)) {
    return NextResponse.json({ error: 'Ce code n’est pas celui de ce bac blanc.' }, { status: 403 });
  }

  const ok = await libererCode(code);
  if (!ok) return NextResponse.json({ error: 'Déblocage impossible.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}

/**
 * Les codes de cette session, élèves inscrits compris.
 *
 * Un élève inscrit après la création des codes reçoit le sien au prochain
 * chargement de la console : la création est idempotente, elle ne fait
 * qu'ajouter ce qui manque.
 */
async function codesDe(session: SessionEnrichie, prof: { nom: string }) {
  const eleves = (await chargerElevesSession(session))
    .map((e) => ({ copieId: codeCopie(e.nom, e.matiere), nom: e.nom, matiere: e.matiere }))
    .filter((e): e is { copieId: string; nom: string; matiere: string } => Boolean(e.copieId));
  // Le code du professeur est créé en même temps que ceux de ses élèves : il
  // n'a pas de copie à lui, il ouvre toutes celles de la session.
  return codesDeLaSession(session.id, eleves, session.date_epreuve?.slice(0, 10), {
    nom: prof.nom,
    matiere: session.matiere,
  });
}
