/**
 * Le code d'épreuve de l'élève connecté — celui qu'il lit dans son espace.
 *
 * Un code par élève et par bac blanc. L'élève le saisit UNE fois, sur
 * l'ordinateur où il va écrire, au moment où il ouvre sa copie ; ensuite cet
 * ordinateur (et le téléphone appairé) reste ouvert jusqu'au soir.
 *
 * L'identité vient uniquement du cookie signé : aucune adresse en paramètre,
 * sinon connaître l'adresse d'un camarade suffirait à lire son code.
 * Et on ne renvoie jamais que le sien.
 */
import { NextResponse } from 'next/server';
import { crmAdmin } from '@/lib/authProf';
import { eleveConnecte } from '@/lib/authEleve';
import { sessionsDeLEleve } from '@/lib/bacsBlancs';
import { codeCopie } from '@/lib/codeCopie';
import { codeEpreuveEleve, codesDisponibles } from '@/lib/ecritureAcces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface CodeEleve {
  session_id: string;
  matiere: string;
  date_epreuve: string;
  code: string;
  /** Déjà saisi quelque part : l'espace le dit, pour que l'élève ne cherche pas. */
  ouvert: boolean;
}

export async function GET() {
  const email = await eleveConnecte();
  if (!email) {
    return NextResponse.json({ error: 'Connecte-toi à ton espace élève.' }, { status: 401 });
  }
  if (!codesDisponibles()) return NextResponse.json({ codes: [] });

  try {
    const ids = await sessionsDeLEleve(email);
    if (!ids.length) return NextResponse.json({ codes: [] });

    const db = crmAdmin();
    const [sessionsRes, insRes] = await Promise.all([
      db.from('sessions_bacs_blancs').select('id, matiere, date_epreuve').in('id', ids),
      db.from('inscriptions').select('nom, matiere, session_id').ilike('email', email.trim().toLowerCase()),
    ]);

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const sessions = ((sessionsRes.data ?? []) as {
      id: string;
      matiere: string;
      date_epreuve: string;
    }[])
      // Un code ne sert que le jour de l'épreuve : inutile d'en montrer un pour
      // un bac blanc passé, il ne marcherait plus.
      .filter((s) => (s.date_epreuve ?? '') >= aujourdhui)
      .sort((a, b) => (a.date_epreuve ?? '').localeCompare(b.date_epreuve ?? ''));

    const inscriptions = (insRes.data ?? []) as {
      nom: string | null;
      matiere: string | null;
      session_id: string | null;
    }[];

    const codes: CodeEleve[] = [];
    for (const s of sessions) {
      const ins =
        inscriptions.find((i) => i.session_id === s.id) ??
        inscriptions.find((i) => (i.matiere ?? '') === s.matiere);
      const copieId = codeCopie(ins?.nom ?? '', s.matiere);
      if (!ins?.nom || !copieId) continue;

      const code = await codeEpreuveEleve(
        s.id,
        { copieId, nom: ins.nom, matiere: s.matiere },
        s.date_epreuve?.slice(0, 10),
      );
      if (!code) continue;
      codes.push({
        session_id: s.id,
        matiere: s.matiere,
        date_epreuve: s.date_epreuve,
        code: code.code,
        ouvert: Boolean(code.ouvert_le),
      });
    }

    return NextResponse.json({ codes });
  } catch (err) {
    console.error('❌ /api/eleve/code-epreuve', err);
    return NextResponse.json({ error: 'Erreur de lecture.' }, { status: 500 });
  }
}
