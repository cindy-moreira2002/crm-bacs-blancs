/**
 * Analyse d'une grille de correction exportée du Google Sheet.
 *
 * POST — reçoit le CSV, renvoie le rapport d'import. N'écrit RIEN : le prof
 * doit pouvoir relire et corriger avant que quoi que ce soit soit enregistré.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profCourant } from '@/lib/authProf';
import { chargerElevesSession, chargerSessionAutorisee } from '@/lib/espaceProf';
import { analyserGrille } from '@/lib/importGrille';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Un export de grille reste petit ; au-delà, c'est probablement le mauvais fichier.
const TAILLE_MAX = 2 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: Params) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  const { id } = await params;
  const session = await chargerSessionAutorisee(prof, id);
  if (!session) return NextResponse.json({ error: 'Bac blanc introuvable.' }, { status: 404 });

  try {
    const form = await req.formData();
    const fichier = form.get('fichier');
    if (!(fichier instanceof File)) {
      return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
    }
    if (fichier.size > TAILLE_MAX) {
      return NextResponse.json(
        { error: 'Fichier trop volumineux (2 Mo maximum). Exporte bien la page en CSV.' },
        { status: 400 },
      );
    }
    if (/\.(xlsx|xls|ods)$/i.test(fichier.name)) {
      return NextResponse.json(
        {
          error:
            'Ce format n’est pas lisible tel quel. Dans le Sheet : Fichier → Télécharger → Valeurs séparées par des virgules (.csv).',
        },
        { status: 400 },
      );
    }

    const csv = await fichier.text();
    const eleves = await chargerElevesSession(session);
    const rapport = analyserGrille(csv, eleves);

    return NextResponse.json({ success: true, rapport, nomFichier: fichier.name });
  } catch (err) {
    console.error('❌ Import grille:', err);
    return NextResponse.json({ error: 'Fichier illisible.' }, { status: 400 });
  }
}
