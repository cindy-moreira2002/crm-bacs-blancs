/**
 * Proposition de barème à partir du sujet.
 *
 * POST { version_id, sujet_pdf_base64?, sujet_texte?, consignes? }
 *   → { proposition: { exercices, questions }, total, max_score, remarques }
 *
 * Cette route ne modifie RIEN. Elle rend un brouillon que l'éditeur affiche
 * sans l'enregistrer : c'est le bouton « Enregistrer » de l'éditeur, donc un
 * geste humain, qui écrit le barème. Une note d'élève ne se pose pas toute
 * seule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { chargerExamen } from '@/lib/bareme';
import { invoquerEdge } from '@/lib/pipeline';
import { gardeAdmin, erreur } from '../../garde';

export const dynamic = 'force-dynamic';

/** Vercel refuse les corps de requête au-delà de ~4,5 Mo : on s'arrête avant. */
const MAX_PDF_OCTETS = 3 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;
  const { examId } = await params;

  try {
    const corps = (await req.json()) as {
      version_id?: string;
      sujet_pdf_base64?: string;
      sujet_texte?: string;
      consignes?: string;
    };
    if (!corps.version_id) {
      return NextResponse.json({ error: 'version_id est obligatoire.' }, { status: 400 });
    }

    const examen = await chargerExamen(examId);
    if (!examen) return NextResponse.json({ error: 'Examen introuvable.' }, { status: 404 });

    if (corps.sujet_pdf_base64) {
      // base64 → octets : 4 caractères pour 3 octets.
      const octets = Math.floor((corps.sujet_pdf_base64.length * 3) / 4);
      if (octets > MAX_PDF_OCTETS) {
        return NextResponse.json(
          {
            error:
              `Ce PDF pèse ${Math.round(octets / 1024 / 1024)} Mo ; la limite est de 3 Mo. ` +
              `Dépose une version allégée, ou colle le texte du sujet dans l’onglet Examen.`,
          },
          { status: 413 },
        );
      }
    }

    const { ok, status, data } = await invoquerEdge('propose-bareme', {
      version_id: corps.version_id,
      sujet_pdf_base64: corps.sujet_pdf_base64,
      sujet_texte: corps.sujet_texte,
      consignes: corps.consignes,
    });
    if (!ok) {
      // Une fonction absente répond 404 sans champ `error` : le dire en clair
      // plutôt que « échec », sinon on cherche la panne dans le barème.
      const message =
        (data as { error?: string; message?: string } | null)?.error ??
        (status === 404
          ? 'La fonction propose-bareme n’est pas déployée sur Supabase (node scripts/deployer-edge.mjs propose-bareme).'
          : (data as { message?: string } | null)?.message ?? 'La proposition de barème a échoué.');
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json(data);
  } catch (err) {
    return erreur(err, 'Proposition impossible');
  }
}
