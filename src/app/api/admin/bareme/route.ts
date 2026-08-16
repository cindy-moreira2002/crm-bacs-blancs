/**
 * GET  — la liste des bacs blancs et de leurs barèmes.
 * POST — créer un bac blanc (et sa version de barème 1.0, vide).
 *
 * Un examen ne peut PAS exister sans barème : la version 1.0 naît avec lui,
 * en brouillon, et l'examen reste `draft` tant qu'elle n'est pas complète,
 * testée sur des étalons, validée puis verrouillée.
 */
import { NextRequest, NextResponse } from 'next/server';
import { listerExamens, creerExamen } from '@/lib/bareme';
import { CE_QUI_SE_DEFINIT, moteurAttendu } from '@/lib/moteurs';
import { gardeAdmin, erreur } from '../bareme/garde';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;

  const matiere = req.nextUrl.searchParams.get('matiere') ?? undefined;
  try {
    return NextResponse.json({ examens: await listerExamens(matiere) });
  } catch (err) {
    return erreur(err);
  }
}

export async function POST(req: NextRequest) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;

  const corps = (await req.json().catch(() => ({}))) as Record<string, string | null>;
  if (!corps.code || !corps.matiere || !corps.titre) {
    return NextResponse.json(
      { error: 'code, matiere et titre sont obligatoires.' },
      { status: 400 },
    );
  }

  // Un barème par sujet n'a de sens que là où les questions changent d'un
  // sujet à l'autre. Ailleurs (tout le bac depuis le 15 août 2026), en créer un
  // ouvre un chantier qui ne se refermera jamais : l'examen resterait bloqué en
  // brouillon, et sa matière se corrige déjà par sa grille.
  const matiere = String(corps.matiere).trim();
  const moteur = moteurAttendu(matiere);
  if (moteur !== 'bareme_sujet') {
    return NextResponse.json(
      {
        error:
          `Cette matière ne se note pas au barème par sujet. ${CE_QUI_SE_DEFINIT[moteur]} ` +
          'Les barèmes par sujet ne concernent que le brevet.',
      },
      { status: 400 },
    );
  }

  try {
    const { examen, version } = await creerExamen({
      code: String(corps.code).trim(),
      matiere,
      titre: String(corps.titre).trim(),
      track: corps.track ? String(corps.track) : 'generale',
      exercise_type: corps.exercise_type ?? null,
      session: corps.session ?? null,
      date_epreuve: corps.date_epreuve ?? null,
      subject_id: corps.subject_id ?? null,
      auteur: garde.auteur,
    });
    return NextResponse.json({ examen, version }, { status: 201 });
  } catch (err) {
    return erreur(err);
  }
}
