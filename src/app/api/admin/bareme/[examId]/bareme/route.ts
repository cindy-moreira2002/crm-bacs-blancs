/**
 * Le barème lui-même : édition, vérification, verrouillage, versions.
 *
 * PUT  { version_id, exercices?, questions[] }  — remplace la structure.
 * POST { action: 'verifier' | 'verrouiller' | 'ouvrir_corrections'
 *              | 'nouvelle_version' | 'dupliquer' | 'statut', ... }
 *
 * Les deux garde-fous qui comptent, et qui vivent en base, pas ici :
 *   • une version verrouillée refuse toute écriture (trigger) ;
 *   • bareme_verrouiller() rejoue tous les contrôles avant de verrouiller,
 *     donc on ne peut pas ouvrir les corrections sur un barème incomplet
 *     même en appelant l'API à la main.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  enregistrerBareme,
  verifierEnBase,
  verrouillerBareme,
  ouvrirCorrections,
  nouvelleVersion,
  dupliquerVersExamen,
  chargerBareme,
  controlerBareme,
  type SaisieQuestion,
} from '@/lib/bareme';
import { pipelineDb } from '@/lib/pipeline';
import { gardeAdmin, erreur } from '../../garde';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;
  await params;

  try {
    const corps = (await req.json()) as {
      version_id?: string;
      exercices?: { code: string; titre?: string | null; ordre?: number }[];
      questions?: SaisieQuestion[];
    };
    if (!corps.version_id) {
      return NextResponse.json({ error: 'version_id est obligatoire.' }, { status: 400 });
    }

    await enregistrerBareme(corps.version_id, {
      exercices: corps.exercices,
      questions: corps.questions ?? [],
    });

    const bareme = await chargerBareme(corps.version_id);
    return NextResponse.json({
      bareme,
      controles: bareme?.version.controles ?? null,
      controles_locaux: bareme ? controlerBareme(bareme) : null,
    });
  } catch (err) {
    return erreur(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;
  const { examId } = await params;

  const corps = (await req.json().catch(() => ({}))) as {
    action?: string;
    version_id?: string;
    version?: string;
    exam_cible?: string;
    statut?: string;
  };

  try {
    switch (corps.action) {
      case 'verifier': {
        if (!corps.version_id) throw new Error('version_id est obligatoire.');
        return NextResponse.json({ controles: await verifierEnBase(corps.version_id) });
      }

      case 'verrouiller': {
        if (!corps.version_id) throw new Error('version_id est obligatoire.');
        return NextResponse.json({ controles: await verrouillerBareme(corps.version_id, garde.auteur) });
      }

      case 'ouvrir_corrections':
        return NextResponse.json({ resultat: await ouvrirCorrections(examId, garde.auteur) });

      case 'nouvelle_version': {
        if (!corps.version_id || !corps.version) {
          throw new Error('version_id et version sont obligatoires.');
        }
        const id = await nouvelleVersion(corps.version_id, corps.version, garde.auteur);
        return NextResponse.json({ version_id: id });
      }

      case 'dupliquer': {
        if (!corps.version_id || !corps.exam_cible) {
          throw new Error('version_id et exam_cible sont obligatoires.');
        }
        const id = await dupliquerVersExamen(
          corps.version_id,
          corps.exam_cible,
          corps.version ?? '1.0',
          garde.auteur,
        );
        return NextResponse.json({ version_id: id });
      }

      case 'statut': {
        // Avancement dans le parcours de calibration. Le passage à 'locked'
        // et à 'correction_open' n'est PAS accessible ici : il exige les
        // fonctions dédiées, qui rejouent les contrôles.
        const autorises = ['draft', 'calibrating', 'ready_for_validation', 'validated', 'archived'];
        if (!corps.version_id || !corps.statut || !autorises.includes(corps.statut)) {
          throw new Error(`statut doit valoir l'un de : ${autorises.join(', ')}.`);
        }
        const db = pipelineDb();
        const champs: Record<string, unknown> = { statut: corps.statut };
        if (corps.statut === 'validated') {
          champs.valide_par = garde.auteur;
          champs.valide_le = new Date().toISOString();
        }
        const { error } = await db.from('bareme_versions').update(champs).eq('id', corps.version_id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, statut: corps.statut });
      }

      default:
        return NextResponse.json({ error: `Action inconnue : ${corps.action}` }, { status: 400 });
    }
  } catch (err) {
    return erreur(err);
  }
}
