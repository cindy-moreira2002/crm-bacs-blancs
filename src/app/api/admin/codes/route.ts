/**
 * Le répertoire des codes promo — lecture et écriture, réservé à
 * l'administratrice.
 *
 * GET    → tous les codes, avec le nombre d'élèves qui s'en sont servis et le
 *          total des remises accordées. C'est ce total qui doit se retrouver
 *          dans le classeur de suivi financier.
 * POST   → crée ou met à jour un code (le code lui-même est la clé).
 * DELETE → désactive un code. On ne SUPPRIME jamais : des inscriptions le
 *          portent, et leur ligne doit rester lisible des années après.
 */
import { NextRequest, NextResponse } from 'next/server';
import { crmAdmin } from '@/lib/authProf';
import { gardeApiAdmin } from '@/lib/gardeAcces';
import { normaliserPromo } from '@/lib/codesPromo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LigneCode = {
  code: string;
  libelle: string;
  professeur_id: string | null;
  remise_euros: number;
  categorie: string;
  actif: boolean;
  valide_du: string | null;
  valide_au: string | null;
  usages_par_eleve: number;
  note: string | null;
};

export async function GET() {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  try {
    const db = crmAdmin();
    const [codes, usages] = await Promise.all([
      db
        .from('codes_promo')
        .select('code, libelle, professeur_id, remise_euros, categorie, actif, valide_du, valide_au, usages_par_eleve, note')
        .order('libelle'),
      db.from('inscriptions').select('code_promo, remise_euros, paiement_statut').not('code_promo', 'is', null),
    ]);

    if (codes.error) {
      // Table absente = script 53 pas encore joué. Message actionnable plutôt
      // qu'une page en erreur.
      return NextResponse.json(
        {
          error:
            'Le répertoire des codes n’existe pas encore. Joue supabase/sql/53_codes_promo.sql dans le SQL Editor du projet CRM.',
          manquant: 'codes_promo',
        },
        { status: 503 },
      );
    }

    const lignes = (usages.data ?? []) as {
      code_promo: string | null;
      remise_euros: number | null;
      paiement_statut: string | null;
    }[];

    const parCode = new Map<string, { utilisations: number; remises: number; payees: number }>();
    for (const l of lignes) {
      const c = normaliserPromo(l.code_promo);
      if (!c) continue;
      const acc = parCode.get(c) ?? { utilisations: 0, remises: 0, payees: 0 };
      acc.utilisations += 1;
      acc.remises += Number(l.remise_euros) || 0;
      if (l.paiement_statut === 'paye') acc.payees += 1;
      parCode.set(c, acc);
    }

    return NextResponse.json({
      codes: ((codes.data ?? []) as LigneCode[]).map((c) => ({
        ...c,
        remise_euros: Number(c.remise_euros) || 0,
        ...(parCode.get(c.code) ?? { utilisations: 0, remises: 0, payees: 0 }),
      })),
    });
  } catch (err) {
    console.error('❌ /api/admin/codes GET', err);
    return NextResponse.json({ error: 'Erreur de lecture.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  try {
    const corps = await req.json();
    const code = normaliserPromo(corps.code);
    if (code.length < 4) {
      return NextResponse.json({ error: 'Un code fait au moins 4 caractères.' }, { status: 400 });
    }
    const libelle = String(corps.libelle ?? '').trim();
    if (!libelle) {
      return NextResponse.json(
        { error: 'Donne un libellé : c’est ce qui apparaîtra dans le suivi financier.' },
        { status: 400 },
      );
    }

    const remise = Number(corps.remise_euros);
    const ligne = {
      code,
      libelle,
      professeur_id: corps.professeur_id || null,
      remise_euros: Number.isFinite(remise) && remise >= 0 ? remise : 10,
      categorie: corps.categorie === 'campagne' ? 'campagne' : 'prof',
      actif: corps.actif !== false,
      valide_du: corps.valide_du || null,
      valide_au: corps.valide_au || null,
      usages_par_eleve: Math.max(1, Number(corps.usages_par_eleve) || 1),
      note: corps.note ? String(corps.note).trim() : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await crmAdmin().from('codes_promo').upsert(ligne, { onConflict: 'code' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, code });
  } catch (err) {
    console.error('❌ /api/admin/codes POST', err);
    return NextResponse.json({ error: 'Erreur d’enregistrement.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  const code = normaliserPromo(req.nextUrl.searchParams.get('code'));
  if (!code) return NextResponse.json({ error: 'Code manquant.' }, { status: 400 });

  const { error } = await crmAdmin()
    .from('codes_promo')
    .update({ actif: false, updated_at: new Date().toISOString() })
    .eq('code', code);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, desactive: code });
}
