import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dossierDocument } from '@/lib/dossierStyle';
import { createClient } from '@supabase/supabase-js';
import { gardeApiProf } from '@/lib/gardeAcces';
import { autoriserCopie } from '@/lib/accesCopie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileP = promisify(execFile);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service_role côté serveur : passe outre RLS. Repli sur anon en dev local.
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * POST — fabrique le PDF du dossier et, si un `id` est fourni, l'enregistre
 * sur la copie.
 *
 * Réservé aux professeurs : la route faisait tourner un Chrome sans tête sur
 * du HTML fourni par l'appelant, et écrivait `pdf_base64` sur l'identifiant de
 * copie demandé — donc, sans garde, sur la copie de n'importe qui.
 */
export async function POST(req: NextRequest) {
  const refus = await gardeApiProf();
  if (refus) return refus;

  try {
    const { body, filename, id } = await req.json();
    if (!body || typeof body !== 'string') {
      return NextResponse.json({ error: 'HTML manquant' }, { status: 400 });
    }

    if (id) {
      const acces = await autoriserCopie(String(id));
      if (!acces.autorise) return acces.reponse;
      if (acces.role === 'eleve') {
        return NextResponse.json({ error: 'Copie introuvable' }, { status: 404 });
      }
    }

    const fileId = randomUUID();
    const htmlPath = join(tmpdir(), `dossier-${fileId}.html`);
    const pdfPath = join(tmpdir(), `dossier-${fileId}.pdf`);

    await writeFile(htmlPath, dossierDocument(body), 'utf8');

    await execFileP(CHROME, [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--virtual-time-budget=5000',
      `--print-to-pdf=${pdfPath}`,
      htmlPath,
    ]);

    const pdf = await readFile(pdfPath);
    // Nettoyage best-effort
    unlink(htmlPath).catch(() => {});
    unlink(pdfPath).catch(() => {});

    // Stocke le PDF dans Supabase si un id est fourni (téléchargeable + envoyable)
    if (id) {
      const dataUrl = `data:application/pdf;base64,${pdf.toString('base64')}`;
      await supabase
        .from('copies')
        .update({ pdf_base64: dataUrl, pdf_pret: true })
        .eq('id', id);
    }

    const name = (filename || 'dossier-correction').replace(/[^a-zA-Z0-9_-]/g, '_');
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}.pdf"`,
      },
    });
  } catch (err) {
    console.error('❌ Erreur génération PDF:', err);
    return NextResponse.json({ error: 'Erreur génération PDF' }, { status: 500 });
  }
}
