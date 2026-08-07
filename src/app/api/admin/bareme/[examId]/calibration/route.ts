/**
 * Tableau de calibration d'une version de barème.
 *
 * GET  ?version=…   — comparaisons copie par copie et statistiques.
 * POST { action: 'figer' }        — enregistre le tableau daté (calibration_runs).
 * POST { action: 'recalculer' }   — relance les corrections faites avec une
 *                                   ancienne version, sur la version courante.
 *
 * Ce que le tableau ne fait jamais : modifier une note. Un décalage
 * systématique se corrige dans le barème, avant verrouillage, pour toutes
 * les copies à la fois.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  chargerTableauCalibration,
  enregistrerRunCalibration,
  lireCalibration,
} from '@/lib/calibration';
import { chargerExamen } from '@/lib/bareme';
import { pipelineDb } from '@/lib/pipeline';
import { gardeAdmin, erreur } from '../../garde';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;
  const { examId } = await params;

  try {
    const examen = await chargerExamen(examId);
    if (!examen) return NextResponse.json({ error: 'Examen introuvable.' }, { status: 404 });

    const versionId = req.nextUrl.searchParams.get('version') ?? examen.bareme_version_active;
    if (!versionId) {
      return NextResponse.json({
        tableau: null,
        lecture: {
          niveau: 'aucune',
          message: "Aucune version de barème : la calibration n'a pas commencé.",
        },
      });
    }

    const tableau = await chargerTableauCalibration(examId, versionId);
    return NextResponse.json({ tableau, lecture: lireCalibration(tableau.stats) });
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
    version_source?: string;
    commentaire?: string;
  };

  try {
    if (corps.action === 'figer') {
      if (!corps.version_id) throw new Error('version_id est obligatoire.');
      const id = await enregistrerRunCalibration(
        examId,
        corps.version_id,
        garde.auteur,
        corps.commentaire,
      );
      return NextResponse.json({ calibration_run_id: id }, { status: 201 });
    }

    if (corps.action === 'recalculer') {
      if (!corps.version_id) throw new Error('version_id est obligatoire.');
      return NextResponse.json(await recalculer(examId, corps.version_id, corps.version_source));
    }

    return NextResponse.json({ error: `Action inconnue : ${corps.action}` }, { status: 400 });
  } catch (err) {
    return erreur(err);
  }
}

/**
 * Relance les copies corrigées avec une version périmée.
 *
 * L'historique n'est pas effacé : l'ancienne correction est conservée dans
 * `bareme_audit` avant d'être remplacée, et on ne relance QUE les copies
 * dont la version diffère de la version cible — un lot ne doit jamais
 * mélanger silencieusement deux versions.
 */
async function recalculer(examId: string, versionCible: string, versionSource?: string) {
  const db = pipelineDb();

  const { data: cible } = await db
    .from('bareme_versions')
    .select('statut, version')
    .eq('id', versionCible)
    .maybeSingle();
  if (!cible) throw new Error('Version cible introuvable.');
  if ((cible as { statut: string }).statut !== 'locked') {
    throw new Error(
      `La version ${(cible as { version: string }).version} n'est pas verrouillée : ` +
        'on ne relance pas un lot sur un barème encore modifiable.',
    );
  }

  let req = db
    .from('corrections')
    .select('id, bareme_version_id, result_json, score_raw, status')
    .eq('exam_id', examId)
    .eq('moteur', 'bareme_sujet')
    .eq('est_etalon', false)
    .neq('bareme_version_id', versionCible);
  if (versionSource) req = req.eq('bareme_version_id', versionSource);

  const { data, error } = await req;
  if (error) throw new Error(error.message);

  const copies = (data ?? []) as {
    id: string;
    bareme_version_id: string | null;
    result_json: unknown;
    score_raw: number | null;
    status: string;
  }[];

  const relancees: string[] = [];
  for (const c of copies) {
    // Trace de l'ancienne correction AVANT de la remplacer.
    await db.from('bareme_audit').insert({
      table_cible: 'corrections',
      ligne_id: c.id,
      action: 'recalcul_nouvelle_version',
      avant: {
        bareme_version_id: c.bareme_version_id,
        score_raw: c.score_raw,
        status: c.status,
        result_json: c.result_json,
      },
      apres: { bareme_version_id: versionCible },
    });

    await db
      .from('corrections')
      .update({ bareme_version_id: versionCible, updated_at: new Date().toISOString() })
      .eq('id', c.id);

    const { error: errRpc } = await db.rpc('crm_lancer_correction', { p_correction_id: c.id });
    if (!errRpc) relancees.push(c.id);
  }

  return {
    concernees: copies.length,
    relancees: relancees.length,
    corrections: relancees,
    message:
      copies.length === 0
        ? 'Toutes les copies de ce lot utilisent déjà cette version.'
        : `${relancees.length} copie(s) relancée(s) sur la version ${(cible as { version: string }).version}. Les corrections précédentes sont conservées dans bareme_audit.`,
  };
}
