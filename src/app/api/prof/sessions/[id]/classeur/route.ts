/**
 * « Créer mon classeur de correction » — le prof duplique le classeur de sa
 * matière pour CE bac blanc.
 *
 * POST : crée la copie (ou rend celle qui existe déjà) et l'archive.
 *
 * Créer un fichier dans le Drive est une action visible côté Google : elle
 * n'est donc jamais déclenchée par le simple affichage de la console, mais par
 * un clic explicite du professeur — et une seule fois, la contrainte étant
 * tenue en base (script 52).
 */
import { NextRequest, NextResponse } from 'next/server';
import { profCourant } from '@/lib/authProf';
import { creerClasseur } from '@/lib/classeurs';
import { chargerSessionAutorisee } from '@/lib/espaceProf';
import { guidelinePour } from '@/lib/guidelines';
import { cleMatiere } from '@/lib/matieres';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  const { id } = await params;
  const session = await chargerSessionAutorisee(prof, id);
  if (!session) return NextResponse.json({ error: 'Bac blanc introuvable.' }, { status: 404 });

  // Le modèle : le classeur de la matière. Jamais la copie d'un autre bac
  // blanc — on repart toujours d'un classeur vierge.
  const cle = cleMatiere(session.matiere);
  const modele = cle ? guidelinePour(cle)?.url ?? null : null;

  const resultat = await creerClasseur({
    session: { id: session.id, matiere: session.matiere, date_epreuve: session.date_epreuve },
    prof,
    modeleUrl: modele,
  });

  if (!resultat.ok) return NextResponse.json({ error: resultat.erreur }, { status: 409 });

  return NextResponse.json({
    success: true,
    deja: resultat.deja,
    classeur: { url: resultat.classeur.url, nom: resultat.classeur.nom },
  });
}
