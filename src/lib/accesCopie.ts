/**
 * « Cette copie-là est-elle à cette personne-là ? »
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Les routes qui servent une copie par identifiant (`?id=…`) ne vérifiaient
 * que l'existence de la ligne. L'identifiant est un UUID, donc difficile à
 * deviner — mais un lien qui circule, un historique de navigateur ou une
 * capture d'écran suffisaient alors à ouvrir la copie et sa correction à
 * n'importe qui. Un identifiant n'est pas un droit d'accès.
 *
 * Trois façons légitimes d'ouvrir une copie :
 *  - l'administratrice, sans restriction ;
 *  - le professeur qui l'a déposée (`prof_email`) ;
 *  - l'élève dont c'est la copie, et seulement une fois le dossier envoyé.
 *
 * En cas de refus on répond 404, jamais 403 : confirmer qu'une copie existe
 * pour tel identifiant serait déjà une information.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { profConnecte } from '@/lib/authProf';
import { eleveConnecte } from '@/lib/authEleve';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export type AccesCopie =
  | { autorise: true; role: 'eleve' | 'prof' | 'admin' }
  | { autorise: false; reponse: NextResponse };

const introuvable = () =>
  NextResponse.json({ error: 'Copie introuvable' }, { status: 404 });

export async function autoriserCopie(id: string | null): Promise<AccesCopie> {
  if (!id) {
    return { autorise: false, reponse: NextResponse.json({ error: 'id manquant' }, { status: 400 }) };
  }

  const { data, error } = await supabase
    .from('copies')
    .select('eleve_email, prof_email, envoye')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return { autorise: false, reponse: introuvable() };

  const copie = data as { eleve_email: string | null; prof_email: string | null; envoye: boolean | null };

  const prof = await profConnecte();
  if (prof) {
    if (prof.role === 'admin') return { autorise: true, role: 'admin' };
    const sien = (copie.prof_email ?? '').toLowerCase() === prof.email.toLowerCase();
    return sien ? { autorise: true, role: 'prof' } : { autorise: false, reponse: introuvable() };
  }

  const eleve = await eleveConnecte();
  if (eleve) {
    const sienne = (copie.eleve_email ?? '').toLowerCase() === eleve;
    // `envoye` conditionne l'accès élève : une correction en cours de
    // rédaction n'a pas à être lisible avant que le prof l'ait envoyée.
    if (sienne && copie.envoye) return { autorise: true, role: 'eleve' };
    return { autorise: false, reponse: introuvable() };
  }

  return { autorise: false, reponse: introuvable() };
}
