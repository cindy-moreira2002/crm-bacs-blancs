/**
 * Enregistrement des corrections relues et génération des dossiers.
 *
 * POST — reçoit les lignes validées par le prof (celles qu'il a relues et
 * éventuellement modifiées à l'écran), les enregistre dans corrections_grille,
 * puis déclenche la génération du dossier pour chaque élève qui a déjà une
 * correction dans le pipeline.
 *
 * On enregistre toujours, même si le pipeline ne peut pas générer : le travail
 * du prof ne doit jamais être perdu à cause d'une copie manquante.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin, profCourant } from '@/lib/authProf';
import { chargerElevesSession, chargerSessionAutorisee } from '@/lib/espaceProf';
import { pipelineDb, pipelineManquant } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

type LigneValidee = {
  inscriptionId: string;
  eleveNom: string;
  note: number | null;
  criteres: Record<string, string>;
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export async function POST(req: NextRequest, { params }: Params) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  const { id } = await params;
  const session = await chargerSessionAutorisee(prof, id);
  if (!session) return NextResponse.json({ error: 'Bac blanc introuvable.' }, { status: 404 });

  try {
    const body = await req.json();
    const colonnes = Array.isArray(body.colonnes) ? body.colonnes : [];
    const lignes: LigneValidee[] = Array.isArray(body.lignes) ? body.lignes : [];

    if (lignes.length === 0) {
      return NextResponse.json({ error: 'Aucune correction à générer.' }, { status: 400 });
    }

    // On n'accepte que des élèves réellement inscrits à CETTE session : le
    // corps de la requête vient du navigateur, il ne fait pas autorité.
    const eleves = await chargerElevesSession(session);
    const autorises = new Map(eleves.map((e) => [e.id, e]));

    const retenues = lignes.filter((l) => autorises.has(l.inscriptionId));
    if (retenues.length === 0) {
      return NextResponse.json(
        { error: 'Aucun des élèves envoyés n’est inscrit à ce bac blanc.' },
        { status: 400 },
      );
    }

    // 1. Enregistrement (upsert : réimporter la grille corrige la précédente).
    const db = crmAdmin();
    const { error: erreurEcriture } = await db.from('corrections_grille').upsert(
      retenues.map((l) => ({
        session_id: session.id,
        inscription_id: l.inscriptionId,
        professeur_id: prof.id,
        eleve_nom: l.eleveNom,
        note: l.note,
        criteres: l.criteres ?? {},
        colonnes,
        statut: 'validee',
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'session_id,inscription_id' },
    );

    if (erreurEcriture) {
      console.error('❌ Écriture corrections_grille:', erreurEcriture);
      return NextResponse.json({ error: 'Impossible d’enregistrer les corrections.' }, { status: 500 });
    }

    // 2. Génération des dossiers, pour les élèves qui ont une copie corrigée
    //    dans le pipeline. Les autres sont simplement signalés au prof.
    const generes: string[] = [];
    const sansCopie: string[] = [];
    let pipelineIndisponible: string | null = null;

    if (pipelineManquant().length) {
      pipelineIndisponible =
        'Le pipeline de correction n’est pas configuré sur ce déploiement : les corrections sont enregistrées, mais aucun dossier n’a été généré.';
      sansCopie.push(...retenues.map((l) => l.eleveNom));
    } else {
      const pipeline = pipelineDb();
      const { data: corrections } = await pipeline
        .from('corrections')
        .select('id, student_name, status, result_json');

      for (const ligne of retenues) {
        const eleve = autorises.get(ligne.inscriptionId)!;
        const correction = (corrections ?? []).find(
          (c) => norm((c as { student_name: string }).student_name) === norm(eleve.nom),
        ) as { id: string; result_json: unknown } | undefined;

        if (!correction?.result_json) {
          sansCopie.push(eleve.nom);
          continue;
        }

        const { error } = await pipeline.rpc('crm_generer_dossier', {
          p_correction_id: correction.id,
        });
        if (error) {
          console.error('❌ Génération dossier', eleve.nom, error);
          sansCopie.push(eleve.nom);
          continue;
        }

        generes.push(eleve.nom);
        await db
          .from('corrections_grille')
          .update({ statut: 'dossier_demande' })
          .eq('session_id', session.id)
          .eq('inscription_id', ligne.inscriptionId);
      }
    }

    return NextResponse.json({
      success: true,
      enregistrees: retenues.length,
      generes,
      sansCopie,
      pipelineIndisponible,
    });
  } catch (err) {
    console.error('❌ Génération dossiers:', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
