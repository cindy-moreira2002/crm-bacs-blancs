import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { gardeApiProfDetail } from '@/lib/gardeAcces';
import { eleveConnecte } from '@/lib/authEleve';
import { autoriserCopie } from '@/lib/accesCopie';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service_role côté serveur : passe outre RLS. Repli sur anon en dev local.
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST — un prof dépose une copie à corriger
export async function POST(req: NextRequest) {
  try {
    const {
      matiere, eleve_nom, eleve_email, prof_email, notes_prof, copie_texte, remarques,
      fichier_base64, fichier_type, fichier_nom,
    } = await req.json();

    // Il faut au moins du texte OU un fichier
    const hasTexte = copie_texte && copie_texte.trim().length >= 20;
    if (!matiere || !eleve_nom || (!hasTexte && !fichier_base64)) {
      return NextResponse.json(
        { error: 'Matière, nom de l\'élève et une copie (texte ou fichier) sont requis' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('copies')
      .insert([{
        matiere, eleve_nom, eleve_email, prof_email, notes_prof, copie_texte, remarques,
        fichier_base64, fichier_type, fichier_nom,
      }])
      .select();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log('✅ Copie déposée:', { matiere, eleve_nom });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('❌ Erreur dépôt copie:', err);
    return NextResponse.json({ error: 'Erreur lors du dépôt' }, { status: 500 });
  }
}

// PATCH — sauvegarde la correction éditée par le prof, sur SES copies seulement
export async function PATCH(req: NextRequest) {
  const garde = await gardeApiProfDetail();
  if (garde.refus) return garde.refus;

  try {
    const { id, correction_texte, a_envoyer, note } = await req.json();
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    // Être professeur ne suffit pas : encore faut-il que la copie soit la
    // sienne. Sans cette vérification, un prof pouvait noter et envoyer le
    // dossier d'un élève suivi par quelqu'un d'autre.
    const acces = await autoriserCopie(String(id));
    if (!acces.autorise) return acces.reponse;
    if (acces.role === 'eleve') {
      return NextResponse.json({ error: 'Copie introuvable' }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof correction_texte === 'string') patch.correction_texte = correction_texte;
    if (typeof a_envoyer === 'boolean') patch.a_envoyer = a_envoyer;
    // note : number pour enregistrer, null pour effacer
    if (typeof note === 'number' || note === null) patch.note = note;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'rien à mettre à jour' }, { status: 400 });
    }

    const { error } = await supabase.from('copies').update(patch).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur PATCH copie:', err);
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}

/**
 * GET — liste des copies. Chacun ne voit que ce qui le concerne :
 *
 *  - élève connecté  → ses copies à lui, et seulement celles déjà envoyées.
 *    L'adresse vient du cookie signé, JAMAIS de l'URL : `?eleve_email=` laissait
 *    lire les copies de n'importe qui à qui savait son adresse ;
 *  - professeur      → les copies qu'il a lui-même déposées (`prof_email`) ;
 *  - administratrice → tout.
 *
 * Un paramètre `?eleve_email=` éventuellement présent est ignoré : le laisser
 * agir rouvrirait exactement la porte que ce garde ferme.
 */
export async function GET(req: NextRequest) {
  const eleve = await eleveConnecte();
  let profEmail: string | null = null;

  if (!eleve) {
    const garde = await gardeApiProfDetail();
    if (garde.refus) return garde.refus;
    // L'administratrice voit tout ; un prof ne voit que ses dépôts.
    profEmail = garde.prof.role === 'admin' ? null : garde.prof.email.toLowerCase();
  }

  try {
    const statut = req.nextUrl.searchParams.get('statut');
    // On exclut les gros champs base64 du listing
    const build = (cols: string) => {
      let query = supabase.from('copies').select(cols).order('created_at', { ascending: false });
      if (statut) query = query.eq('statut', statut);
      if (eleve) query = query.eq('eleve_email', eleve).eq('envoye', true);
      else if (profEmail) query = query.eq('prof_email', profEmail);
      return query;
    };

    const AVEC_NOTE = 'id, matiere, eleve_nom, eleve_email, prof_email, notes_prof, note, copie_texte, remarques, fichier_type, fichier_nom, statut, correction_texte, pdf_pret, a_envoyer, envoye, created_at';
    const SANS_NOTE = 'id, matiere, eleve_nom, eleve_email, prof_email, notes_prof, copie_texte, remarques, fichier_type, fichier_nom, statut, correction_texte, pdf_pret, a_envoyer, envoye, created_at';

    let { data, error } = await build(AVEC_NOTE);
    // Repli si la colonne note n'existe pas encore (migration non faite)
    if (error && /note/.test(error.message || '')) {
      ({ data, error } = await build(SANS_NOTE));
    }
    if (error) throw error;

    return NextResponse.json({ copies: data });
  } catch (err) {
    console.error('❌ Erreur liste copies:', err);
    return NextResponse.json({ error: 'Erreur lecture' }, { status: 500 });
  }
}
