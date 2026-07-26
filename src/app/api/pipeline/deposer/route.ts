import { NextRequest, NextResponse } from 'next/server';
import { pipelineDb, pipelineManquant, MATIERE_PAR_DEFAUT } from '@/lib/pipeline';
import { accesDepot, verifierQuotaDepot } from '@/lib/accesDepot';

export const dynamic = 'force-dynamic';

/**
 * POST — enregistre la copie deposee et lance la chaine de correction.
 *
 * Le fichier a deja ete televerse par le navigateur via une URL signee
 * (voir /api/pipeline/upload-url) : ici on ne recoit que son chemin.
 *
 * Chaine declenchee : transcription -> correction (trigger automatique).
 * Le dossier est genere ensuite, quand la correction est prete.
 */
export async function POST(req: NextRequest) {
  // C'est ici que la depense demarre : garde d'acces, puis plafond.
  const acces = await accesDepot();
  if (!acces.autorise) {
    return NextResponse.json(
      { error: 'Accès réservé aux professeurs. Connecte-toi ou saisis le code d’accès.' },
      { status: 401 },
    );
  }

  const quota = await verifierQuotaDepot();
  if (!quota.ok) {
    return NextResponse.json({ error: quota.message }, { status: 429 });
  }

  const manquants = pipelineManquant();
  if (manquants.length) {
    return NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 });
  }

  try {
    const body = await req.json();
    const {
      path, subject_id, rubric_id, track, exercise_type,
      eleve_nom, eleve_email, prof_email, eleve_code, matiere,
    } = body;

    if (!path || !subject_id || !rubric_id || !track || !exercise_type) {
      return NextResponse.json(
        { error: 'Bac blanc et copie obligatoires (path, subject_id, rubric_id, track, exercise_type).' },
        { status: 400 },
      );
    }
    if (!eleve_nom || !String(eleve_nom).trim()) {
      return NextResponse.json({ error: "Nom de l'élève obligatoire." }, { status: 400 });
    }

    const db = pipelineDb();

    const { data: correction, error } = await db
      .from('corrections')
      .insert({
        pseudonymous_student_id: eleve_code || `CRM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        track,
        exercise_type,
        subject_id,
        rubric_id,
        original_storage_path: path,
        status: 'uploaded',
        student_name: String(eleve_nom).trim(),
        student_email: eleve_email ? String(eleve_email).trim() : null,
        // À défaut d'email saisi, on trace le prof connecté : on saura toujours
        // qui a déclenché une correction.
        teacher_email: prof_email ? String(prof_email).trim() : acces.email,
        matiere: matiere || MATIERE_PAR_DEFAUT,
        source: 'crm',
      })
      .select('id, status')
      .single();

    if (error) throw error;

    // Lancement du moteur. Asynchrone cote base (pg_net) : retour immediat.
    const { error: rpcError } = await db.rpc('crm_lancer_correction', {
      p_correction_id: correction.id,
    });

    if (rpcError) {
      // La copie est enregistree : on le dit, sans faire croire a un echec total.
      console.error('❌ crm_lancer_correction', rpcError);
      return NextResponse.json(
        {
          correction_id: correction.id,
          lance: false,
          error: `Copie enregistrée mais le moteur n'a pas démarré : ${rpcError.message}`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ correction_id: correction.id, lance: true }, { status: 201 });
  } catch (err) {
    console.error('❌ /api/pipeline/deposer', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
