/**
 * Le sujet du bac blanc, côté élève.
 *
 * GET  : les sujets des sessions où l'élève connecté est inscrit. Un sujet
 *        pas encore ouvert apparaît sans fichier, avec son heure d'ouverture.
 * POST : { sujet_id } → une URL signée de 5 minutes, et une ligne de journal.
 *
 * L'identité vient UNIQUEMENT du cookie signé (`lib/authEleve`) : aucune
 * adresse passée en paramètre n'est acceptée, sinon connaître l'adresse d'un
 * camarade suffirait à récupérer le sujet avant l'heure.
 *
 * Le filtrage (type « sujet » seulement, session de l'élève, sujet ouvert) est
 * fait dans `lib/bacsBlancs`, jamais ici : une route ne doit pas être le seul
 * endroit où la règle existe.
 */
import { NextRequest, NextResponse } from 'next/server';
import { eleveConnecte } from '@/lib/authEleve';
import { lienSujetEleve, sujetsPourEleve } from '@/lib/bacsBlancs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const refus = () =>
  NextResponse.json({ error: 'Connecte-toi à ton espace élève pour voir ton sujet.' }, { status: 401 });

export async function GET() {
  const email = await eleveConnecte();
  if (!email) return refus();

  try {
    return NextResponse.json({ sujets: await sujetsPourEleve(email) });
  } catch (err) {
    console.error('❌ /api/eleve/sujets GET', err);
    return NextResponse.json({ error: 'Erreur de lecture.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await eleveConnecte();
  if (!email) return refus();

  try {
    const { sujet_id } = await req.json();
    if (!sujet_id) return NextResponse.json({ error: 'Sujet manquant.' }, { status: 400 });

    const url = await lienSujetEleve(String(sujet_id), email);
    // Volontairement le même message que le sujet inexistant : la réponse ne
    // dit pas à un curieux si le sujet existe et n'est pas encore ouvert.
    if (!url) return NextResponse.json({ error: 'Ce sujet n’est pas disponible.' }, { status: 403 });

    return NextResponse.json({ url });
  } catch (err) {
    console.error('❌ /api/eleve/sujets POST', err);
    return NextResponse.json({ error: 'Erreur de lecture.' }, { status: 500 });
  }
}
