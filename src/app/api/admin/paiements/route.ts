/**
 * /api/admin/paiements — les écritures « argent des profs ».
 *
 * Réservée à l'administratrice (garde `admin`). Quatre actions, toutes
 * étroites : pas de suppression libre, pas de mise à jour d'une colonne
 * quelconque.
 *
 *   revenu_statut  → « viré » / « pas encore viré » sur une ligne de revenu ;
 *   coaching_du    → transforme un coaching PRÉVU (session_coachs) en somme
 *                    DUE (revenus_prof), une seule fois par session et par prof ;
 *   virement       → l'IBAN du prof, pour savoir où envoyer l'argent ;
 *   rattraper      → recrée les 10 € d'affiliation manquants pour les élèves
 *                    déjà payés (utile juste après le script SQL 47).
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin } from '@/lib/authProf';
import { gardeApiAdmin } from '@/lib/gardeAcces';
import { synchroniserAffiliation } from '@/lib/affiliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  let corps: Record<string, unknown>;
  try {
    corps = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Corps JSON illisible' }, { status: 400 });
  }

  const db = crmAdmin();
  const action = String(corps.action ?? '');

  try {
    switch (action) {
      // --- Marquer un revenu viré (ou revenir en arrière) -----------------
      case 'revenu_statut': {
        const id = String(corps.revenu_id ?? '');
        const statut = String(corps.statut ?? '');
        if (!id) return NextResponse.json({ error: 'revenu_id manquant' }, { status: 400 });
        if (!['a_payer', 'paye'].includes(statut)) {
          return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
        }
        const { data, error } = await db
          .from('revenus_prof')
          .update({ statut })
          .eq('id', id)
          .select('id');
        if (error) throw error;
        if (!data?.length) {
          return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 });
        }
        return NextResponse.json({ ok: true, statut });
      }

      // --- Un coaching prévu devient une somme due ------------------------
      case 'coaching_du': {
        const sessionId = String(corps.session_id ?? '');
        const profId = String(corps.professeur_id ?? '');
        if (!sessionId || !profId) {
          return NextResponse.json({ error: 'session_id et professeur_id requis' }, { status: 400 });
        }

        // Le montant vient de l'engagement pris sur la session, jamais du
        // navigateur : c'est ce qui a été convenu avec le prof.
        const { data: engagement, error: erreurEngagement } = await db
          .from('session_coachs')
          .select('remuneration, statut')
          .eq('session_id', sessionId)
          .eq('professeur_id', profId)
          .maybeSingle();
        if (erreurEngagement) throw erreurEngagement;
        if (!engagement) {
          return NextResponse.json({ error: 'Ce prof ne coache pas cette session' }, { status: 404 });
        }
        if ((engagement as { statut: string }).statut === 'annule') {
          return NextResponse.json({ error: 'Coaching annulé : rien n’est dû' }, { status: 409 });
        }

        const { data: dejaLa } = await db
          .from('revenus_prof')
          .select('id')
          .eq('type', 'coaching')
          .eq('session_id', sessionId)
          .eq('professeur_id', profId)
          .maybeSingle();
        if (dejaLa) {
          return NextResponse.json({ ok: true, deja: true });
        }

        const { data: session } = await db
          .from('sessions_bacs_blancs')
          .select('matiere, date_epreuve')
          .eq('id', sessionId)
          .maybeSingle();
        const s = session as { matiere: string; date_epreuve: string } | null;

        const { error } = await db.from('revenus_prof').insert([
          {
            professeur_id: profId,
            type: 'coaching',
            montant: Number((engagement as { remuneration: number | string }).remuneration ?? 0),
            session_id: sessionId,
            libelle: s ? `Coaching — ${s.matiere} du ${s.date_epreuve}` : 'Coaching',
            statut: 'a_payer',
          },
        ]);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // --- Où virer l'argent ---------------------------------------------
      case 'virement': {
        const profId = String(corps.professeur_id ?? '');
        if (!profId) return NextResponse.json({ error: 'professeur_id manquant' }, { status: 400 });

        const iban = String(corps.iban ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 34);
        const titulaire = String(corps.titulaire_compte ?? '').trim().slice(0, 120);
        if (iban && !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)) {
          return NextResponse.json(
            { error: 'IBAN invalide : il commence par deux lettres de pays (FR76…).' },
            { status: 400 },
          );
        }

        const { data, error } = await db
          .from('professeurs')
          .update({ iban: iban || null, titulaire_compte: titulaire || null })
          .eq('id', profId)
          .select('id');
        if (error) {
          if (/iban|titulaire_compte/i.test(error.message ?? '')) {
            return NextResponse.json(
              { error: 'Colonnes IBAN absentes : joue le script SQL 47_affiliation.sql.' },
              { status: 409 },
            );
          }
          throw error;
        }
        if (!data?.length) return NextResponse.json({ error: 'Prof introuvable' }, { status: 404 });
        return NextResponse.json({ ok: true });
      }

      // --- Rattraper les affiliations manquantes --------------------------
      case 'rattraper': {
        const { data, error } = await db
          .from('inscriptions')
          .select('id')
          .eq('paiement_statut', 'paye')
          .not('code_affiliation', 'is', null);
        if (error) throw error;

        let creees = 0;
        for (const l of (data ?? []) as { id: string }[]) {
          const res = await synchroniserAffiliation(l.id);
          if (res === 'creee') creees += 1;
        }
        return NextResponse.json({ ok: true, creees, examinees: data?.length ?? 0 });
      }

      default:
        return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[admin/paiements]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
