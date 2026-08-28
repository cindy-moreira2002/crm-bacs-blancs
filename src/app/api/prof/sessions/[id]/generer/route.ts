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

/** Ce qu'on lit d'une copie du pipeline pour y poser la correction du prof. */
type CorrectionPipeline = {
  id: string;
  student_name: string;
  status: string;
  created_at: string;
  result_json: unknown;
};

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
    /** Élèves ayant plusieurs copies : la note du prof n'a pas été posée d'office. */
    const noteNonAppliquee: string[] = [];
    let pipelineIndisponible: string | null = null;

    if (pipelineManquant().length) {
      pipelineIndisponible =
        'Le pipeline de correction n’est pas configuré sur ce déploiement : les corrections sont enregistrées, mais aucun dossier n’a été généré.';
      sansCopie.push(...retenues.map((l) => l.eleveNom));
    } else {
      const pipeline = pipelineDb();
      // Même matière que le bac blanc : sans ce filtre, une copie de français
      // pouvait être rapprochée d'une session d'HGGSP sur le seul nom.
      const { data: corrections } = await pipeline
        .from('corrections')
        .select('id, student_name, status, result_json, created_at')
        .eq('matiere', session.matiere)
        .order('created_at', { ascending: false });

      for (const ligne of retenues) {
        const eleve = autorises.get(ligne.inscriptionId)!;
        const candidates = ((corrections ?? []) as CorrectionPipeline[]).filter(
          (c) => norm(c.student_name) === norm(eleve.nom) && c.result_json,
        );
        const correction = candidates[0];

        if (!correction) {
          sansCopie.push(eleve.nom);
          continue;
        }

        // CORRECTION HYBRIDE : la grille du prof est recopiée sur la copie du
        // pipeline AVANT de demander le dossier. generate-dossier la lit et
        // rédige à partir d'elle — la note du prof fait foi, l'IA ne renote
        // pas. Si la colonne n'existe pas encore (SQL 50 pas joué), on le
        // signale et le dossier reste 100 % IA : rien ne casse.
        const grilleProf = {
          note: ligne.note,
          criteres: ligne.criteres ?? {},
          colonnes,
          professeur: { id: prof.id, nom: `${prof.prenom} ${prof.nom}`.trim(), email: prof.email },
          enregistre_le: new Date().toISOString(),
        };

        // LA NOTE DU PROFESSEUR FAIT FOI PARTOUT, pas seulement dans le
        // dossier. Tous les écrans lisent `result_json.note_finale` : on l'y
        // écrit, en gardant la note de l'IA à côté (`note_ia`) — rien n'est
        // perdu, et on sait toujours d'où vient le chiffre affiché.
        //
        // Une seule copie par élève : sinon (HGGSP, deux exercices notés
        // séparément), la note du prof porte sur l'épreuve entière et
        // l'écrire sur un exercice fausserait le total. Dans ce cas la grille
        // est transmise, la note ne l'est pas, et le prof en est informé.
        const noteApplicable = ligne.note != null && candidates.length === 1;
        const ancien = (correction.result_json ?? {}) as Record<string, unknown>;
        const majCorrection: Record<string, unknown> = { grille_prof: grilleProf };

        if (noteApplicable) {
          majCorrection.result_json = {
            ...ancien,
            note_finale: ligne.note,
            note_ia: ancien.note_ia ?? ancien.note_finale ?? null,
            note_source: 'professeur',
            note_professeur: ligne.note,
          };
          majCorrection.score_validated = ligne.note;
          majCorrection.validee_par = `${prof.prenom} ${prof.nom}`.trim() || prof.email;
          majCorrection.validee_le = new Date().toISOString();
          majCorrection.human_review_required = false;
        } else if (ligne.note != null) {
          noteNonAppliquee.push(eleve.nom);
        }

        // La grille part sur TOUTES les copies de l'élève dans cette matière :
        // les deux exercices d'une même épreuve ont été corrigés avec elle.
        for (const c of candidates) {
          const { error: erreurGrille } = await pipeline
            .from('corrections')
            .update(c.id === correction.id ? majCorrection : { grille_prof: grilleProf })
            .eq('id', c.id);
          if (erreurGrille) {
            console.warn(
              `⚠️ Grille prof non transmise au pipeline (${eleve.nom}) — le dossier sera 100 % IA :`,
              erreurGrille.message,
            );
          }
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
      noteNonAppliquee,
      pipelineIndisponible,
    });
  } catch (err) {
    console.error('❌ Génération dossiers:', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
