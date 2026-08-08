/**
 * Mes bacs blancs — API du professeur.
 *
 * GET  : les sessions où CE prof est assigné, avec le sujet quand
 *        l'administratrice l'a rendu visible, et son propre retour.
 * POST : télécharger un sujet (lien signé court), ou envoyer le retour de fin
 *        de session.
 *
 * Deux gardes, jamais une seule : le prof doit être connecté ET assigné à la
 * session demandée. Sans la seconde, n'importe quel prof lirait le sujet de
 * n'importe quelle épreuve avant l'heure.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profCourant } from '@/lib/authProf';
import {
  chargerMesBacsBlancs,
  enregistrerRetour,
  lienSujet,
  profAssigneA,
  type ReponsesRetour,
} from '@/lib/bacsBlancs';
import { crmAdmin } from '@/lib/authProf';

export const dynamic = 'force-dynamic';

const DEROULEMENTS = ['tres_bien', 'bien', 'moyen', 'difficile'];
const DUREES = ['trop_court', 'juste', 'trop_long'];
const DIFFICULTES = ['trop_facile', 'adapte', 'trop_difficile'];
const NIVEAUX = ['faible', 'heterogene', 'bon'];

/** Valeur d'une liste fermée, ou null. Le formulaire ne dicte pas la base. */
const choix = (v: unknown, permis: string[]) =>
  typeof v === 'string' && permis.includes(v) ? v : null;

const entier = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const texte = (v: unknown, max = 4000) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export async function GET() {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });

  try {
    return NextResponse.json({ bacs_blancs: await chargerMesBacsBlancs(prof) });
  } catch (err) {
    console.error('❌ /api/prof/bacs-blancs GET', err);
    return NextResponse.json({ error: 'Erreur de lecture.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { prof } = await profCourant();
  if (!prof) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });

  try {
    const corps = await req.json();
    const action = String(corps.action ?? '');
    const sessionId = String(corps.session_id ?? '');

    if (!(await profAssigneA(prof.id, sessionId))) {
      return NextResponse.json(
        { error: 'Vous n’êtes pas assigné à ce bac blanc.' },
        { status: 403 },
      );
    }

    if (action === 'lien-sujet') {
      // Le sujet doit appartenir à CETTE session et être marqué visible :
      // un chemin de fichier envoyé à la main ne doit rien ouvrir d'autre.
      const { data } = await crmAdmin()
        .from('session_sujets')
        .select('fichier_path, visible_prof, session_id')
        .eq('id', String(corps.sujet_id))
        .maybeSingle();
      const sujet = data as { fichier_path: string | null; visible_prof: boolean; session_id: string } | null;
      if (!sujet || sujet.session_id !== sessionId || !sujet.visible_prof || !sujet.fichier_path) {
        return NextResponse.json({ error: 'Sujet indisponible.' }, { status: 404 });
      }
      const url = await lienSujet(sujet.fichier_path);
      if (!url) return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 });
      return NextResponse.json({ url });
    }

    if (action === 'retour') {
      const r = corps.reponses ?? {};
      const reponses: ReponsesRetour = {
        deroulement: choix(r.deroulement, DEROULEMENTS),
        nb_eleves_presents: entier(r.nb_eleves_presents, 0, 200),
        nb_eleves_absents: entier(r.nb_eleves_absents, 0, 200),
        duree_adaptee: choix(r.duree_adaptee, DUREES),
        difficulte_sujet: choix(r.difficulte_sujet, DIFFICULTES),
        niveau_eleves: choix(r.niveau_eleves, NIVEAUX),
        incidents: texte(r.incidents),
        retours_eleves: texte(r.retours_eleves),
        besoins: texte(r.besoins),
        note_organisation: entier(r.note_organisation, 1, 5),
        recommanderait: typeof r.recommanderait === 'boolean' ? r.recommanderait : null,
      };
      await enregistrerRetour(sessionId, prof.id, reponses);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (err) {
    console.error('❌ /api/prof/bacs-blancs POST', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
