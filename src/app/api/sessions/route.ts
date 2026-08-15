/**
 * GET /api/sessions — les bacs blancs ouverts à l'inscription.
 *
 * Publique et sans secret : c'est la seule information de `sessions_bacs_blancs`
 * qu'un visiteur a le droit de voir (la RLS le dit aussi, policy
 * `sessions_lecture_publique`). Elle sert le formulaire d'inscription et
 * l'espace élève.
 *
 * C'EST LE POINT DE BASCULE : les dates proposées aux familles venaient d'un
 * tableau écrit en dur dans `src/lib/sessions.ts`. Un bac blanc créé depuis
 * /admin/bacs-blancs n'y apparaissait donc jamais. Désormais la base fait foi,
 * et le tableau en dur n'est plus qu'un filet de secours côté navigateur.
 *
 * Ne sont servies que les sessions à venir, `statut = 'ouverte'` et non
 * annulées : une épreuve complète ou annulée ne doit pas accepter d'inscrit.
 */
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { Session } from '@/lib/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

const COLONNES = 'matiere, date_epreuve, heure_debut, heure_fin, places, statut';

/** '9h' + '13h' → « 9h — 13h ». Sans heure de fin, l'heure de début suffit. */
function plageHoraire(debut: string | null, fin: string | null): string {
  const d = (debut ?? '').trim() || '9h';
  const f = (fin ?? '').trim();
  return f ? `${d} — ${f}` : d;
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ sessions: [] });
  }

  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const depuis = aujourdhui.toISOString().slice(0, 10);

  // Les filtres avant `order` : `.order()` ferme la construction de la requête.
  const filtres = () =>
    db()
      .from('sessions_bacs_blancs')
      .select(COLONNES)
      .eq('statut', 'ouverte')
      .gte('date_epreuve', depuis);

  // `annulee_le` vient du SQL des e-mails (28_...). S'il n'a pas été joué sur
  // ce projet, on relit sans le filtre plutôt que de renvoyer une liste vide.
  let { data, error } = await filtres().is('annulee_le', null).order('date_epreuve', { ascending: true });
  if (error && /annulee_le/.test(error.message ?? '')) {
    ({ data, error } = await filtres().order('date_epreuve', { ascending: true }));
  }

  if (error) {
    console.error('❌ /api/sessions', error);
    return NextResponse.json({ sessions: [], error: 'Sessions indisponibles.' }, { status: 500 });
  }

  const sessions: Session[] = ((data ?? []) as Record<string, unknown>[]).map((s) => ({
    matiere: String(s.matiere ?? ''),
    date: String(s.date_epreuve),
    heure: plageHoraire((s.heure_debut as string) ?? null, (s.heure_fin as string) ?? null),
    places: Number(s.places ?? 0),
  }));

  return NextResponse.json({ sessions });
}
