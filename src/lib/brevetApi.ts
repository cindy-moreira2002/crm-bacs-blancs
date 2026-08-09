/**
 * Poignées communes aux routes `/api/admin/brevet/*`.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Les routes des deux matières sont des fichiers SÉPARÉS — c'est ce que le
 * cahier des charges demande, et cela rend impossible d'appeler la route du
 * français avec un examen de mathématiques. Mais la plomberie (garde admin,
 * lecture du corps, messages d'erreur) est identique : elle vit ici, et chaque
 * route la traverse en passant SA matière, jamais celle de l'autre.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { pipelineManquant, invoquerEdge } from '@/lib/pipeline';
import type { MatiereBrevet } from '@/lib/brevetNoyau';
import {
  chargerBaremeActifBrevet,
  chargerBaremeBrevet,
  chargerCorrectionBrevet,
  chargerExamenBrevet,
  creerExamenBrevet,
  enregistrerQuestionsBrevet,
  listerCopiesBrevet,
  listerExamensBrevet,
  majConfig,
  majExamenBrevet,
  nouvelleVersionBrevet,
  ouvrirCorrectionsBrevet,
  remplacerLignes,
  verifierBaremeEnBase,
  verrouillerBaremeBrevet,
  type SaisieQuestionBrevet,
} from '@/lib/brevet';
import { calibrationBrevet, statistiquesBrevet } from '@/lib/brevetStats';
import {
  retoucherScore,
  trancherErreurDictee,
  traiterValidation,
  validerCorrectionBrevet,
  type CibleRetouche,
} from '@/lib/brevetRetouches';

export type Garde = { ok: true; auteur: string } | { ok: false; reponse: NextResponse };

/**
 * Réservé à l'administratrice, comme les barèmes du bac : un barème de brevet
 * décide de la note officielle d'un brevet blanc. Chaque écriture est tracée
 * avec son adresse.
 */
export async function gardeAdminBrevet(): Promise<Garde> {
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

export function erreurLisible(err: unknown, defaut = 'Erreur inconnue') {
  const message = err instanceof Error ? err.message : defaut;
  return NextResponse.json({ error: message }, { status: 400 });
}

async function corps(req: NextRequest): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Examens                                                           */
/* ------------------------------------------------------------------ */

export async function listerExamens(matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;
  try {
    return NextResponse.json({ matiere, examens: await listerExamensBrevet(matiere) });
  } catch (err) {
    return erreurLisible(err);
  }
}

export async function creerExamen(req: NextRequest, matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;

  const c = await corps(req);
  if (!c.code || !c.titre) {
    return NextResponse.json({ error: 'code et titre sont obligatoires.' }, { status: 400 });
  }
  try {
    const { examen, version } = await creerExamenBrevet({
      code: String(c.code).trim(),
      matiere,
      titre: String(c.titre).trim(),
      serie: 'generale',
      session: c.session ? String(c.session) : String(new Date().getFullYear() + 1),
      date_epreuve: c.date_epreuve ? String(c.date_epreuve) : null,
      subject_id: c.subject_id ? String(c.subject_id) : null,
      auteur: garde.auteur,
    });
    return NextResponse.json({ examen, version }, { status: 201 });
  } catch (err) {
    return erreurLisible(err);
  }
}

export async function lireExamen(examId: string, matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;
  try {
    const examen = await chargerExamenBrevet(examId, matiere);
    if (!examen) {
      return NextResponse.json({ error: 'Examen introuvable pour cette matière.' }, { status: 404 });
    }
    const bareme = await chargerBaremeActifBrevet(examId, matiere);
    const calibration = await calibrationBrevet(examId, matiere);
    return NextResponse.json({ examen, bareme, calibration });
  } catch (err) {
    return erreurLisible(err);
  }
}

/**
 * Les actions d'un examen. Chacune est explicitement nommée : on ne devine
 * jamais qu'un PATCH veut dire « verrouille ».
 */
export async function agirSurExamen(req: NextRequest, examId: string, matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;

  const c = await corps(req);
  const action = String(c.action ?? 'maj');

  try {
    const examen = await chargerExamenBrevet(examId, matiere);
    if (!examen) {
      return NextResponse.json({ error: 'Examen introuvable pour cette matière.' }, { status: 404 });
    }

    switch (action) {
      case 'maj':
        return NextResponse.json({
          examen: await majExamenBrevet(examId, matiere, c.champs as Record<string, never>),
        });

      case 'verifier': {
        const bareme = await chargerBaremeActifBrevet(examId, matiere);
        if (!bareme) return NextResponse.json({ error: 'Aucun barème.' }, { status: 400 });
        return NextResponse.json({ controles: await verifierBaremeEnBase(bareme.version.id) });
      }

      case 'verrouiller': {
        const bareme = await chargerBaremeActifBrevet(examId, matiere);
        if (!bareme) return NextResponse.json({ error: 'Aucun barème.' }, { status: 400 });
        return NextResponse.json({
          controles: await verrouillerBaremeBrevet(bareme.version.id, garde.auteur),
        });
      }

      case 'ouvrir_corrections':
        return NextResponse.json({ resultat: await ouvrirCorrectionsBrevet(examId, garde.auteur) });

      case 'nouvelle_version': {
        const bareme = await chargerBaremeActifBrevet(examId, matiere);
        if (!bareme) return NextResponse.json({ error: 'Aucun barème.' }, { status: 400 });
        const id = await nouvelleVersionBrevet(
          bareme.version.id,
          String(c.version ?? ''),
          garde.auteur,
        );
        return NextResponse.json({ version_id: id });
      }

      default:
        return NextResponse.json({ error: `Action « ${action} » inconnue.` }, { status: 400 });
    }
  } catch (err) {
    return erreurLisible(err);
  }
}

/* ------------------------------------------------------------------ */
/*  Barème                                                            */
/* ------------------------------------------------------------------ */

/**
 * Enregistre un barème. Le contenu accepté DÉPEND de la matière : la route du
 * français ne sait rien des automatismes, celle des mathématiques ne sait rien
 * de la dictée. Une clé de l'autre matière est refusée, pas ignorée.
 */
export async function enregistrerBaremeBrevet(
  req: NextRequest,
  examId: string,
  matiere: MatiereBrevet,
) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;

  const c = await corps(req);
  try {
    const bareme = await chargerBaremeActifBrevet(examId, matiere);
    if (!bareme) {
      return NextResponse.json({ error: 'Examen ou barème introuvable.' }, { status: 404 });
    }
    const versionId = String(c.version_id ?? bareme.version.id);
    const versionCiblee = await chargerBaremeBrevet(versionId, matiere);
    if (!versionCiblee) {
      return NextResponse.json({ error: 'Version de barème introuvable pour cette matière.' }, { status: 404 });
    }

    const clesFrancais = ['reecriture_config', 'reecriture_items', 'dictee_config', 'dictee_regles', 'redaction'];
    const clesMaths = ['automatismes', 'qualite_redaction'];
    const interdites = matiere === 'brevet_francais' ? clesMaths : clesFrancais;
    for (const cle of interdites) {
      if (cle in c) {
        return NextResponse.json(
          {
            error:
              `« ${cle} » n'appartient pas au barème de ${matiere}. ` +
              'Les deux matières ne partagent aucune règle : rien n’a été enregistré.',
          },
          { status: 400 },
        );
      }
    }

    if (Array.isArray(c.questions)) {
      await enregistrerQuestionsBrevet(versionId, c.questions as SaisieQuestionBrevet[]);
    }

    if (matiere === 'brevet_francais') {
      if (c.reecriture_config) {
        await majConfig(versionId, 'brevet_reecriture_config', c.reecriture_config as Record<string, unknown>);
      }
      if (Array.isArray(c.reecriture_items)) {
        await remplacerLignes(versionId, 'brevet_reecriture_items', c.reecriture_items as Record<string, unknown>[]);
      }
      if (c.dictee_config) {
        await majConfig(versionId, 'brevet_dictee_config', c.dictee_config as Record<string, unknown>);
      }
      if (Array.isArray(c.dictee_regles)) {
        await remplacerLignes(versionId, 'brevet_dictee_regles', c.dictee_regles as Record<string, unknown>[]);
      }
      if (Array.isArray(c.redaction)) {
        await enregistrerGrillesRedaction(versionId, c.redaction as GrilleSaisie[]);
      }
    } else {
      if (Array.isArray(c.automatismes)) {
        await remplacerLignes(versionId, 'brevet_automatismes', c.automatismes as Record<string, unknown>[]);
      }
      if (Array.isArray(c.qualite_redaction)) {
        await remplacerLignes(
          versionId,
          'brevet_qualite_redaction_criteres',
          c.qualite_redaction as Record<string, unknown>[],
        );
      }
    }

    const controles = await verifierBaremeEnBase(versionId);
    return NextResponse.json({
      controles,
      bareme: await chargerBaremeBrevet(versionId, matiere),
    });
  } catch (err) {
    return erreurLisible(err);
  }
}

type GrilleSaisie = {
  type_sujet: 'imagination' | 'reflexion';
  intitule?: string;
  max_points?: number;
  longueur_minimale?: number | null;
  issue_du_sujet?: boolean;
  consigne?: string | null;
  criteres: {
    code: string;
    libelle: string;
    max_points: number;
    descripteurs?: unknown[];
    famille?: string | null;
    cumul_famille_autorise?: boolean;
    actif?: boolean;
  }[];
};

/** Les deux grilles de rédaction, écrites l'une après l'autre, jamais fusionnées. */
async function enregistrerGrillesRedaction(versionId: string, grilles: GrilleSaisie[]) {
  const { pipelineDb } = await import('@/lib/pipeline');
  const db = pipelineDb();

  for (const g of grilles) {
    const { data: existante } = await db
      .from('brevet_redaction_grilles')
      .select('id')
      .eq('bareme_version_id', versionId)
      .eq('type_sujet', g.type_sujet)
      .maybeSingle();

    const payload = {
      bareme_version_id: versionId,
      type_sujet: g.type_sujet,
      intitule: g.intitule ?? '',
      max_points: g.max_points ?? 40,
      longueur_minimale: g.longueur_minimale ?? null,
      issue_du_sujet: g.issue_du_sujet ?? false,
      consigne: g.consigne ?? null,
    };

    let grilleId = (existante as { id: string } | null)?.id;
    if (grilleId) {
      const { error } = await db.from('brevet_redaction_grilles').update(payload).eq('id', grilleId);
      if (error) throw new Error(`Grille ${g.type_sujet} : ${error.message}`);
    } else {
      const { data, error } = await db
        .from('brevet_redaction_grilles')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw new Error(`Grille ${g.type_sujet} : ${error.message}`);
      grilleId = (data as { id: string }).id;
    }

    await db.from('brevet_redaction_criteres').delete().eq('grille_id', grilleId);
    if (g.criteres.length) {
      const { error } = await db.from('brevet_redaction_criteres').insert(
        g.criteres.map((c, i) => ({
          grille_id: grilleId,
          code: c.code,
          libelle: c.libelle,
          max_points: c.max_points,
          descripteurs: c.descripteurs ?? [],
          famille: c.famille ?? null,
          cumul_famille_autorise: c.cumul_famille_autorise ?? false,
          actif: c.actif ?? true,
          ordre: i,
        })),
      );
      if (error) throw new Error(`Critères de la grille ${g.type_sujet} : ${error.message}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Copies                                                            */
/* ------------------------------------------------------------------ */

export async function listerCopies(req: NextRequest, matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;
  try {
    return NextResponse.json({
      copies: await listerCopiesBrevet(matiere, {
        examId: req.nextUrl.searchParams.get('examId') ?? undefined,
        aVerifier: req.nextUrl.searchParams.get('aVerifier') === '1',
      }),
    });
  } catch (err) {
    return erreurLisible(err);
  }
}

export async function lireCopie(correctionId: string, matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;
  try {
    const detail = await chargerCorrectionBrevet(correctionId, matiere);
    if (!detail) {
      return NextResponse.json({ error: 'Copie introuvable pour cette matière.' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    return erreurLisible(err);
  }
}

/** Les actions humaines sur une copie : retoucher, trancher, valider, relancer. */
export async function agirSurCopie(req: NextRequest, correctionId: string, matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;

  const c = await corps(req);
  const action = String(c.action ?? '');

  try {
    switch (action) {
      case 'retoucher':
        return NextResponse.json(
          await retoucherScore({
            correctionId,
            matiere,
            cibleType: String(c.cible_type) as CibleRetouche,
            cibleCle: String(c.cible_cle),
            valeurHumaine: Number(c.valeur),
            correcteur: garde.auteur,
            motif: String(c.motif ?? ''),
            commentaire: c.commentaire ? String(c.commentaire) : null,
          }),
        );

      case 'trancher_dictee':
        return NextResponse.json(
          await trancherErreurDictee({
            correctionId,
            rang: Number(c.rang),
            retenue: c.retenue === true,
            correcteur: garde.auteur,
            motif: String(c.motif ?? 'Décision du correcteur.'),
          }),
        );

      case 'traiter_validation':
        await traiterValidation({
          correctionId,
          validationId: String(c.validation_id),
          decision: c.decision === 'rejetee' ? 'rejetee' : 'traitee',
          correcteur: garde.auteur,
          commentaire: String(c.commentaire ?? ''),
        });
        return NextResponse.json({ ok: true });

      case 'valider':
        return NextResponse.json(
          await validerCorrectionBrevet({ correctionId, matiere, correcteur: garde.auteur }),
        );

      case 'relancer_correction': {
        // Le moteur est déduit de la matière de la route, jamais du corps de
        // la requête : impossible d'envoyer une copie de français au moteur
        // de mathématiques en trafiquant le JSON.
        const fonction =
          matiere === 'brevet_francais' ? 'correct-brevet-francais' : 'correct-brevet-maths';
        const r = await invoquerEdge(fonction, { correction_id: correctionId });
        return NextResponse.json(r.data, { status: r.ok ? 200 : r.status });
      }

      default:
        return NextResponse.json({ error: `Action « ${action} » inconnue.` }, { status: 400 });
    }
  } catch (err) {
    return erreurLisible(err);
  }
}

/* ------------------------------------------------------------------ */
/*  Statistiques et calibration                                        */
/* ------------------------------------------------------------------ */

export async function lireStatistiques(matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;
  try {
    return NextResponse.json(await statistiquesBrevet(matiere));
  } catch (err) {
    return erreurLisible(err);
  }
}

export async function lireCalibration(req: NextRequest, matiere: MatiereBrevet) {
  const garde = await gardeAdminBrevet();
  if (!garde.ok) return garde.reponse;
  const examId = req.nextUrl.searchParams.get('examId');
  if (!examId) return NextResponse.json({ error: 'examId est obligatoire.' }, { status: 400 });
  try {
    return NextResponse.json(await calibrationBrevet(examId, matiere));
  } catch (err) {
    return erreurLisible(err);
  }
}
