import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service_role côté serveur : passe outre RLS. Repli sur anon en dev local.
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GMAIL_WEBAPP = process.env.GMAIL_WEBAPP_URL;

export async function POST(req: NextRequest) {
  try {
    const { nom, email, email_parent, telephone, matiere, date_epreuve } = await req.json();

    if (!nom || !email || !email_parent || !telephone || !matiere) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // 1. Insert Supabase
    const row = { nom, email, email_parent, telephone, matiere, date_epreuve: date_epreuve || null };
    let { data, error } = await supabase.from('inscriptions').insert([row]).select();

    // Repli si la colonne date_epreuve n'existe pas encore (migration non faite)
    if (error && /date_epreuve/.test(error.message || '')) {
      const { date_epreuve: _omit, ...rowSansDate } = row;
      void _omit;
      ({ data, error } = await supabase.from('inscriptions').insert([rowSansDate]).select());
    }

    if (error) {
      console.error('Supabase error:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Vous êtes déjà inscrit à cette matière' },
          { status: 409 }
        );
      }
      throw error;
    }

    console.log('✅ Inscrit Supabase:', { nom, email, matiere });

    // 2. Envoyer email de confirmation via Gmail (Apps Script web app)
    if (GMAIL_WEBAPP) {
      try {
        const mailRes = await fetch(GMAIL_WEBAPP, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (MatineesDuBac)',
          },
          body: JSON.stringify({ nom, email, email_parent, telephone, matiere }),
        });
        console.log('✅ Email Gmail:', mailRes.status);
      } catch (mailErr) {
        console.error('⚠️ Email fail (non-bloquant):', mailErr);
      }
    } else {
      console.warn('⚠️ GMAIL_WEBAPP_URL manquant en .env');
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('❌ Inscription error:', err);
    return NextResponse.json(
      { error: 'Erreur lors de l\'inscription' },
      { status: 500 }
    );
  }
}

// GET — liste des élèves inscrits aux bacs blancs (filtrable par matière)
export async function GET(req: NextRequest) {
  try {
    const matiere = req.nextUrl.searchParams.get('matiere');
    const email = req.nextUrl.searchParams.get('email');
    const build = (cols: string) => {
      let q = supabase.from('inscriptions').select(cols).order('created_at', { ascending: false });
      if (matiere) q = q.eq('matiere', matiere);
      if (email) q = q.eq('email', email);
      return q;
    };

    let { data, error } = await build('id, nom, email, matiere, date_epreuve, created_at');
    // Repli si la colonne date_epreuve n'existe pas encore
    if (error && /date_epreuve/.test(error.message || '')) {
      ({ data, error } = await build('id, nom, email, matiere, created_at'));
    }
    if (error) throw error;

    return NextResponse.json({ inscriptions: data });
  } catch (err) {
    console.error('❌ Erreur liste inscriptions:', err);
    return NextResponse.json({ error: 'Erreur lecture' }, { status: 500 });
  }
}
