import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { codeCopie } from '@/lib/codeCopie';
import { lienSalon } from '@/lib/discord/config';
import { apresInscription } from '@/lib/emails/declencheurs';
import { gardeApiProfDetail } from '@/lib/gardeAcces';
import { eleveConnecte } from '@/lib/authEleve';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service_role côté serveur : passe outre RLS. Repli sur anon en dev local.
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GMAIL_WEBAPP = process.env.GMAIL_WEBAPP_URL;

/**
 * La session de `sessions_bacs_blancs` qui correspond à cette matière et cette
 * date, ou `null`. La comparaison des matières est tolérante aux accents et à
 * la casse : « Histoire-Géo » et « histoire-geo » désignent la même épreuve.
 *
 * Une inscription sans date reste sans session : on ne devine pas à quelle
 * épreuve un élève s'inscrit.
 */
async function trouverSession(matiere: string, date: string | null): Promise<string | null> {
  if (!date) return null;
  const { data, error } = await supabase
    .from('sessions_bacs_blancs')
    .select('id, matiere')
    .eq('date_epreuve', date);
  if (error || !data?.length) return null;
  const cible = normMatiere(matiere);
  return data.find((s) => normMatiere(s.matiere) === cible)?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const { nom, email, email_parent, telephone, matiere, date_epreuve } = await req.json();

    if (!nom || !email || !email_parent || !telephone || !matiere) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // 1. Insert Supabase — rattaché à SA session quand on peut la retrouver.
    //
    // `session_id` restait vide : le tableau de bord des bacs blancs comptait
    // donc « 0 élève » sur des épreuves pleines, et les e-mails liés à une
    // session ne partaient pas. La matière et la date suffisent à retrouver la
    // ligne de `sessions_bacs_blancs` — c'est exactement ce que l'élève a choisi
    // dans le formulaire, qui lit désormais la même table.
    const sessionId = await trouverSession(matiere, date_epreuve);
    const row = {
      nom,
      email,
      email_parent,
      telephone,
      matiere,
      date_epreuve: date_epreuve || null,
      ...(sessionId ? { session_id: sessionId } : {}),
    };
    let { data, error } = await supabase.from('inscriptions').insert([row]).select();

    // Repli si la colonne date_epreuve n'existe pas encore (migration non faite)
    if (error && /date_epreuve/.test(error.message || '')) {
      const { date_epreuve: _omit, ...rowSansDate } = row;
      void _omit;
      ({ data, error } = await supabase.from('inscriptions').insert([rowSansDate]).select());
    }

    // Idem pour session_id : mieux vaut une inscription non rattachée qu'une
    // inscription perdue.
    if (error && /session_id/.test(error.message || '')) {
      const { session_id: _sansSession, ...rowSansSession } = row as typeof row & { session_id?: string };
      void _sansSession;
      ({ data, error } = await supabase.from('inscriptions').insert([rowSansSession]).select());
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

    // 2. E-mails automatiques.
    //
    // Dès que BREVO_API_KEY est posée, la confirmation (et toute la suite :
    // informations pratiques, lien de visio, rappels) passe par la file
    // d'attente Supabase + Brevo. On MET EN FILE, on n'envoie pas ici : la
    // réponse au navigateur ne dépend jamais de la disponibilité de Brevo, et
    // un double envoi du formulaire ne peut pas produire deux e-mails.
    //
    // Tant que la clé n'est pas posée, l'ancien envoi Gmail (Apps Script)
    // continue de fonctionner exactement comme avant.
    const nouvelleInscription = (data as { id?: string }[] | null)?.[0];
    if (process.env.BREVO_API_KEY && nouvelleInscription?.id) {
      try {
        const misEnFile = await apresInscription(nouvelleInscription.id, email, nom);
        console.log(`📬 ${misEnFile} e-mail(s) mis en file pour ${email}`);
      } catch (mailErr) {
        // Non bloquant : le planificateur repassera dans les 5 minutes.
        console.error('⚠️ Mise en file échouée (non bloquant) :', mailErr);
      }
    } else if (GMAIL_WEBAPP) {
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
/** Comparaison de matières tolérante aux accents et à la casse. */
function normMatiere(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * GET — inscriptions. Chacun ne voit que ce qui le concerne :
 *
 *  - élève connecté  → ses inscriptions à lui, d'après le cookie signé et non
 *    d'après `?email=`, qui laissait consulter l'annuaire de n'importe qui ;
 *  - professeur      → les inscriptions de SES matières (`professeurs.matieres`) ;
 *  - administratrice → tout.
 *
 * L'enjeu n'est pas seulement le nom et l'adresse : chaque ligne porte le
 * `code_copie` signé, qui ouvre l'application d'écriture de l'élève.
 */
export async function GET(req: NextRequest) {
  const eleve = await eleveConnecte();
  let matieresProf: string[] | null = null;

  if (!eleve) {
    const garde = await gardeApiProfDetail();
    if (garde.refus) return garde.refus;
    if (garde.prof.role !== 'admin') {
      matieresProf = (garde.prof.matieres ?? []).map(normMatiere).filter(Boolean);
    }
  }

  try {
    const matiere = req.nextUrl.searchParams.get('matiere');
    const build = (cols: string) => {
      let q = supabase.from('inscriptions').select(cols).order('created_at', { ascending: false });
      if (matiere) q = q.eq('matiere', matiere);
      if (eleve) q = q.eq('email', eleve);
      return q;
    };

    let { data, error } = await build(
      'id, nom, email, matiere, date_epreuve, created_at, discord_salon_id',
    );
    // Repli si la colonne discord_salon_id n'existe pas encore (script 45) :
    // l'élève doit continuer à voir son espace, salon verrouillé.
    if (error && /discord_salon_id/.test(error.message || '')) {
      ({ data, error } = await build('id, nom, email, matiere, date_epreuve, created_at'));
    }
    // Repli si la colonne date_epreuve n'existe pas encore
    if (error && /date_epreuve/.test(error.message || '')) {
      ({ data, error } = await build('id, nom, email, matiere, created_at'));
    }
    if (error) throw error;

    // Le filtrage par matière se fait ici plutôt qu'en SQL : les libellés
    // varient (accents, casse) entre `professeurs.matieres` et `inscriptions`.
    // Les lignes écartées ne quittent jamais le serveur.
    let lignes = (data ?? []) as unknown as {
      nom: string;
      matiere: string;
      discord_salon_id?: string | null;
    }[];
    if (matieresProf) {
      const permises = new Set(matieresProf);
      lignes = lignes.filter((i) => permises.has(normMatiere(i.matiere)));
    }

    // Le code d'accès à la copie est signé ici, côté serveur : le navigateur ne
    // peut pas le recalculer, il ne peut que recevoir celui de ses inscriptions.
    // L'adresse du salon est construite ici, côté serveur : le navigateur ne
    // connaît pas l'identifiant du serveur Discord, et surtout il ne peut pas
    // fabriquer l'adresse d'une salle qui n'est pas la sienne — il reçoit
    // seulement celle inscrite sur SON inscription.
    const inscriptions = lignes.map(({ discord_salon_id, ...i }) => ({
      ...i,
      code_copie: codeCopie(i.nom ?? '', i.matiere ?? ''),
      salon_url: lienSalon(discord_salon_id),
    }));

    return NextResponse.json({ inscriptions });
  } catch (err) {
    console.error('❌ Erreur liste inscriptions:', err);
    return NextResponse.json({ error: 'Erreur lecture' }, { status: 500 });
  }
}
