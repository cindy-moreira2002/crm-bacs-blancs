/** POST /api/eleve/deconnexion — referme la session élève. */
import { NextResponse } from 'next/server';
import { fermerSessionEleve } from '@/lib/authEleve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await fermerSessionEleve();
  return NextResponse.json({ ok: true });
}
