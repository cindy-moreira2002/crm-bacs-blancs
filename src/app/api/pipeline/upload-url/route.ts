import { NextRequest, NextResponse } from 'next/server';
import { pipelineDb, pipelineManquant, BUCKET_COPIES, MATIERE_PAR_DEFAUT } from '@/lib/pipeline';
import { refuserSiPasAutorise } from '@/lib/accesDepot';

export const dynamic = 'force-dynamic';

/** Nom de fichier sur : pas d'accent, pas d'espace, pas de chemin relatif. */
function assainir(nom: string): string {
  return (nom || 'copie.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
}

/**
 * POST — prepare un depot de copie.
 *
 * Renvoie une URL signee : le navigateur televerse le PDF DIRECTEMENT vers
 * le Storage Supabase. Deux avantages :
 *   - aucune cle ne descend au navigateur (l'URL signee est a usage unique) ;
 *   - on evite la limite de 4,5 Mo des fonctions serverless Vercel.
 */
export async function POST(req: NextRequest) {
  // Sans ce garde, n'importe qui obtient une URL d'écriture dans le Storage.
  const refus = await refuserSiPasAutorise();
  if (refus) return refus;

  const manquants = pipelineManquant();
  if (manquants.length) {
    return NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 });
  }

  try {
    const { fichier_nom, exercise_type, matiere, eleve_code } = await req.json();

    const annee = new Date().getFullYear();
    const code = String(eleve_code || `CRM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
    const path = [
      annee,
      String(matiere || MATIERE_PAR_DEFAUT),
      String(exercise_type || 'commentaire'),
      code,
      `${Date.now()}-${assainir(fichier_nom)}`,
    ].join('/');

    const db = pipelineDb();
    const { data, error } = await db.storage.from(BUCKET_COPIES).createSignedUploadUrl(path);
    if (error) throw error;

    return NextResponse.json({
      path,
      eleve_code: code,
      signed_url: data.signedUrl,
      token: data.token,
    });
  } catch (err) {
    console.error('❌ /api/pipeline/upload-url', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
