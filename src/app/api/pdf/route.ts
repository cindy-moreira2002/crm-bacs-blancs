import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dossierDocument } from '@/lib/dossierStyle';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const execFileP = promisify(execFile);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function POST(req: NextRequest) {
  try {
    const { body, filename, id } = await req.json();
    if (!body || typeof body !== 'string') {
      return NextResponse.json({ error: 'HTML manquant' }, { status: 400 });
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
