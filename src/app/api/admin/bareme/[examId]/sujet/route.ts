/**
 * Le sujet arrive par son PDF, jamais par un copier-coller.
 *
 * Personne ne devrait recopier un énoncé de mathématiques à la main : les
 * exposants, les indices et les symboles se perdent en route, et une réponse
 * attendue fausse note faux. On dépose le PDF, le serveur en lit le texte.
 *
 * POST { action: 'preparer', nom }  → URL signée d'écriture (le navigateur
 *   téléverse en direct dans le Storage : aucune clé ne descend au client, et
 *   la limite de 4,5 Mo des fonctions Vercel ne s'applique pas).
 * POST { action: 'lire', chemin }   → télécharge le PDF, en extrait le texte,
 *   l'écrit dans exams.sujet_texte et garde le chemin du fichier.
 * GET                               → lien de téléchargement signé (1 h) du
 *   PDF déjà déposé, pour le relire.
 *
 * Le texte extrait n'est pas verrouillé : il s'édite ensuite dans la fiche.
 * Un PDF scanné (une photocopie) ne contient aucun texte — on le dit au lieu
 * d'enregistrer une page blanche.
 */
import { NextRequest, NextResponse } from 'next/server';
import { chargerExamen, majExamen } from '@/lib/bareme';
import { pipelineDb } from '@/lib/pipeline';
import { gardeAdmin, erreur } from '../../garde';

export const dynamic = 'force-dynamic';

/** Bucket privé déjà en place pour les documents de référence des barèmes. */
const BUCKET = 'official-references';
const MAX_OCTETS = 25 * 1024 * 1024;

/** Un nom de fichier sans accent ni espace : le Storage n'aime ni l'un ni l'autre. */
function assainir(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;
  const { examId } = await params;

  try {
    const examen = await chargerExamen(examId);
    if (!examen) return NextResponse.json({ error: 'Examen introuvable.' }, { status: 404 });
    const chemin = examen.sujet_url;
    if (!chemin || chemin.startsWith('http')) {
      return NextResponse.json({ lien: chemin ?? null });
    }
    const { data, error } = await pipelineDb().storage.from(BUCKET).createSignedUrl(chemin, 3600);
    if (error) throw new Error(error.message);
    return NextResponse.json({ lien: data.signedUrl });
  } catch (err) {
    return erreur(err, 'Lien indisponible');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const garde = await gardeAdmin();
  if (!garde.ok) return garde.reponse;
  const { examId } = await params;

  try {
    const corps = (await req.json()) as { action?: string; nom?: string; chemin?: string };
    const examen = await chargerExamen(examId);
    if (!examen) return NextResponse.json({ error: 'Examen introuvable.' }, { status: 404 });
    const db = pipelineDb();

    if (corps.action === 'preparer') {
      const nom = assainir(corps.nom ?? 'sujet.pdf');
      const chemin = `sujets/${examId}/${Date.now()}-${nom}`;
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(chemin);
      if (error) throw new Error(`Préparation du dépôt : ${error.message}`);
      return NextResponse.json({ chemin, signed_url: data.signedUrl, token: data.token });
    }

    if (corps.action === 'lire') {
      if (!corps.chemin) {
        return NextResponse.json({ error: 'chemin est obligatoire.' }, { status: 400 });
      }
      const { data: fichier, error } = await db.storage.from(BUCKET).download(corps.chemin);
      if (error || !fichier) {
        throw new Error(`Téléchargement du PDF : ${error?.message ?? 'fichier absent'}`);
      }
      if (fichier.size > MAX_OCTETS) {
        return NextResponse.json({ error: 'Le PDF dépasse 25 Mo.' }, { status: 413 });
      }

      // unpdf embarque pdf.js : import dynamique pour ne pas le charger sur
      // les routes qui ne lisent aucun PDF.
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(await fichier.arrayBuffer()));
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      const texte = String(text ?? '').trim();

      if (texte.length < 200) {
        return NextResponse.json(
          {
            error:
              `Ce PDF ne contient presque pas de texte (${texte.length} caractères sur ` +
              `${totalPages} page(s)). C’est le cas des sujets scannés ou photographiés : ` +
              `l’image ne se lit pas. Dépose le PDF d’origine, celui qui sort du traitement de texte.`,
            pages: totalPages,
            caracteres: texte.length,
          },
          { status: 422 },
        );
      }

      await majExamen(examId, { sujet_texte: texte, sujet_url: corps.chemin });
      return NextResponse.json({ pages: totalPages, caracteres: texte.length, sujet_texte: texte });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (err) {
    return erreur(err, 'Dépôt du sujet impossible');
  }
}
