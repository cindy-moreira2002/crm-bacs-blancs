/**
 * La file « à regarder par Cindy » (matières sans prof relecteur).
 *
 * GET                → la liste (et le plafond IA du jour) ;
 * GET ?pdf=<id>      → un lien de 10 min vers la copie d'origine ;
 * POST {id, action}  → valider | corriger_quand_meme | retirer.
 *
 * Réservé à l'administratrice : noms d'élèves et copies.
 */
import { NextRequest, NextResponse } from 'next/server';
import { consommerBudgetIa } from '@/lib/accesDepot';
import { profConnecte } from '@/lib/authProf';
import { agirSurCopieFile, chargerFileCindy, type ActionFileCindy } from '@/lib/fileCindy';
import { pipelineDb, pipelineManquant } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

async function garde() {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return { refus: NextResponse.json({ error: 'Réservé à l’administratrice.' }, { status: 403 }) };
  }
  const manquants = pipelineManquant();
  if (manquants.length) {
    return { refus: NextResponse.json({ error: 'Pipeline non configuré', manquants }, { status: 503 }) };
  }
  return { moi };
}

export async function GET(req: NextRequest) {
  const g = await garde();
  if (g.refus) return g.refus;
  try {
    const pdf = req.nextUrl.searchParams.get('pdf');
    if (pdf) {
      const db = pipelineDb();
      const { data: c } = await db.from('corrections').select('original_storage_path').eq('id', pdf).single();
      if (!c?.original_storage_path) return NextResponse.json({ error: 'Copie introuvable.' }, { status: 404 });
      const { data, error } = await db.storage.from('student-copies').createSignedUrl(c.original_storage_path, 600);
      if (error || !data) throw error ?? new Error('Lien impossible.');
      return NextResponse.json({ url: data.signedUrl });
    }
    const [copies, budget] = await Promise.all([
      chargerFileCindy(),
      pipelineDb().rpc('ia_budget_etat').then((r) => (r.error ? null : r.data)),
    ]);
    return NextResponse.json({ copies, budget });
  } catch (err) {
    console.error('❌ /api/admin/correction/a-regarder GET', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const ACTIONS: ActionFileCindy[] = ['valider', 'corriger_quand_meme', 'retirer'];

export async function POST(req: NextRequest) {
  const g = await garde();
  if (g.refus) return g.refus;
  try {
    const { id, action } = (await req.json()) as { id?: string; action?: ActionFileCindy };
    if (!id || !action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: `id et action (${ACTIONS.join(', ')}) obligatoires.` }, { status: 400 });
    }
    if (action === 'corriger_quand_meme') {
      const budget = await consommerBudgetIa('forcage', id, 'file-cindy');
      if (!budget.ok) return NextResponse.json({ error: budget.message }, { status: 429 });
    }
    const par = `${g.moi!.prenom ?? ''} ${g.moi!.nom ?? ''}`.trim() || g.moi!.email;
    await agirSurCopieFile(id, action, par);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ /api/admin/correction/a-regarder POST', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
