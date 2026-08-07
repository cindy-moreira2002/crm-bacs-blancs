/**
 * Copies étalons d'un examen — couche 3.
 *
 * GET  ?version=…  — les copies, leurs corrections humaines et IA.
 * POST { action }  — 'creer' | 'correction_humaine' | 'corriger_ia' | 'statut'
 *
 * Rappel de doctrine, qui explique pourquoi rien ici ne touche à la note
 * d'un élève : les étalons servent à VÉRIFIER et AJUSTER le barème avant
 * son verrouillage. Si l'IA note 10 là où trois professeurs mettent 13,
 * on corrige le barème pour toutes les copies — on n'ajoute pas trois
 * points aux copies qui ressemblent aux étalons.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  listerEtalons,
  creerEtalon,
  enregistrerCorrectionHumaine,
  chargerCorrectionsHumaines,
  chargerCorrectionsIa,
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
    const etalons = await listerEtalons(examId);
    const ids = etalons.map((e) => e.id);

    return NextResponse.json({
      etalons,
      version_id: versionId,
      corrections_humaines: versionId ? await chargerCorrectionsHumaines(ids, versionId) : [],
      corrections_ia: versionId ? await chargerCorrectionsIa(ids, versionId) : [],
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

  const corps = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    switch (corps.action) {
      case 'creer': {
        if (!corps.libelle) throw new Error('libelle est obligatoire.');
        const etalon = await creerEtalon({
          exam_id: examId,
          libelle: String(corps.libelle),
          niveau_cible: (corps.niveau_cible as string) ?? null,
          frontiere: corps.frontiere === true,
          storage_path: (corps.storage_path as string) ?? null,
          source_url: (corps.source_url as string) ?? null,
          commentaire: (corps.commentaire as string) ?? null,
        });
        return NextResponse.json({ etalon }, { status: 201 });
      }

      case 'correction_humaine': {
        if (!corps.etalon_copie_id || !corps.bareme_version_id || !corps.prof_nom) {
          throw new Error('etalon_copie_id, bareme_version_id et prof_nom sont obligatoires.');
        }
        const correction = await enregistrerCorrectionHumaine({
          etalon_copie_id: String(corps.etalon_copie_id),
          bareme_version_id: String(corps.bareme_version_id),
          prof_nom: String(corps.prof_nom),
          prof_email: (corps.prof_email as string) ?? null,
          commentaire: (corps.commentaire as string) ?? null,
          questions: (corps.questions ?? []) as {
            question_key: string;
            points: number;
            justification?: string | null;
          }[],
        });
        return NextResponse.json({ correction }, { status: 201 });
      }

      case 'corriger_ia':
        return NextResponse.json(await lancerCorrectionIa(examId, corps));

      case 'statut': {
        const autorises = ['importee', 'corrigee_humain', 'corrigee_ia', 'comparee', 'validee', 'rejetee'];
        if (!corps.etalon_copie_id || !autorises.includes(String(corps.statut))) {
          throw new Error(`statut doit valoir l'un de : ${autorises.join(', ')}.`);
        }
        const db = pipelineDb();
        const { error } = await db
          .from('etalon_copies')
          .update({
            statut: corps.statut,
            commentaire: (corps.commentaire as string) ?? undefined,
            maj_le: new Date().toISOString(),
          })
          .eq('id', corps.etalon_copie_id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Action inconnue : ${corps.action}` }, { status: 400 });
    }
  } catch (err) {
    return erreur(err);
  }
}

/**
 * Fait corriger une copie étalon par l'IA, avec la version de barème
 * demandée. C'est le seul cas où l'on corrige sans barème verrouillé :
 * tester le barème avant de le verrouiller est précisément le but.
 */
async function lancerCorrectionIa(examId: string, corps: Record<string, unknown>) {
  const db = pipelineDb();
  const examen = await chargerExamen(examId);
  if (!examen) throw new Error('Examen introuvable.');

  const versionId = String(corps.bareme_version_id ?? examen.bareme_version_active ?? '');
  if (!versionId) throw new Error('Aucune version de barème indiquée.');

  const { data: etalon, error } = await db
    .from('etalon_copies')
    .select('*')
    .eq('id', String(corps.etalon_copie_id ?? ''))
    .maybeSingle();
  if (error || !etalon) throw new Error('Copie étalon introuvable.');

  const copie = etalon as { id: string; libelle: string; storage_path: string | null; correction_id: string | null };
  if (!copie.storage_path) {
    throw new Error(
      "Cette copie étalon n'a aucun fichier déposé : rien à transcrire. Importe le PDF avant de lancer l'IA.",
    );
  }

  const { data: correction, error: errC } = await db
    .from('corrections')
    .insert({
      pseudonymous_student_id: `ETALON-${copie.id.slice(0, 8).toUpperCase()}`,
      track: examen.track,
      exercise_type: examen.exercise_type ?? 'examen_complet',
      matiere: examen.matiere,
      exam_id: examId,
      bareme_version_id: versionId,
      moteur: 'bareme_sujet',
      est_etalon: true,
      original_storage_path: copie.storage_path,
      status: 'uploaded',
      student_name: `Copie étalon — ${copie.libelle}`,
      source: 'calibration',
    })
    .select('id')
    .single();
  if (errC) throw new Error(`Création de la correction : ${errC.message}`);

  const correctionId = (correction as { id: string }).id;
  await db.from('etalon_copies').update({ correction_id: correctionId }).eq('id', copie.id);

  const { error: errRpc } = await db.rpc('crm_lancer_correction', { p_correction_id: correctionId });
  if (errRpc) {
    return {
      correction_id: correctionId,
      lance: false,
      error: `Copie enregistrée mais le moteur n'a pas démarré : ${errRpc.message}`,
    };
  }
  return { correction_id: correctionId, lance: true };
}
