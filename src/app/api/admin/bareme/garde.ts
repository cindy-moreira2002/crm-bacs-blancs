/**
 * Garde commune aux routes /api/admin/bareme/*.
 *
 * Un barème décide de la note officielle d'un bac blanc : sa création, sa
 * modification et son verrouillage sont réservés à l'administratrice, et
 * chaque écriture est tracée avec son adresse (colonnes cree_par /
 * verrouille_par / valide_par, et table bareme_audit).
 */
import { NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { pipelineManquant } from '@/lib/pipeline';

export type Autorisation = { ok: true; auteur: string } | { ok: false; reponse: NextResponse };

export async function gardeAdmin(): Promise<Autorisation> {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Réservé à l’administratrice.' }, { status: 403 }),
    };
  }
  const manquants = pipelineManquant();
  if (manquants.length) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 }),
    };
  }
  return { ok: true, auteur: moi.email ?? 'admin' };
}

/** Message d'erreur lisible plutôt qu'une stack. */
export function erreur(err: unknown, defaut = 'Erreur inconnue') {
  const message = err instanceof Error ? err.message : defaut;
  return NextResponse.json({ error: message }, { status: 400 });
}
