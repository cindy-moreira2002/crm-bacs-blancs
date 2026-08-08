/**
 * Pilotage des bacs blancs — API de l'administratrice.
 *
 * GET  : l'état complet (sessions, élèves inscrits, profs assignés, sujets,
 *        retours reçus, alertes).
 * POST : une action, nommée dans le corps.
 *
 * Réservé aux comptes `role = 'admin'`. Le dépôt d'un sujet passe par une URL
 * signée : le fichier va du navigateur au Storage sans traverser Vercel, ce qui
 * évite la limite de 4,5 Mo des fonctions serverless — même principe que le
 * dépôt des copies.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import {
  assignerProf,
  chargerEtatBacsBlancs,
  enregistrerSujet,
  lienSujet,
  majSujet,
  preparerDepotSujet,
  retirerProf,
  supprimerSujet,
} from '@/lib/bacsBlancs';

export const dynamic = 'force-dynamic';

async function exigerAdmin() {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') return null;
  return moi;
}

const refus = () =>
  NextResponse.json({ error: 'Accès réservé à l’administratrice.' }, { status: 403 });

export async function GET() {
  if (!(await exigerAdmin())) return refus();
  try {
    return NextResponse.json(await chargerEtatBacsBlancs());
  } catch (err) {
    console.error('❌ /api/admin/bacs-blancs GET', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const moi = await exigerAdmin();
  if (!moi) return refus();

  try {
    const corps = await req.json();
    const action = String(corps.action ?? '');

    switch (action) {
      case 'assigner-prof': {
        await assignerProf(String(corps.session_id), String(corps.professeur_id));
        return NextResponse.json({ ok: true });
      }

      case 'retirer-prof': {
        await retirerProf(String(corps.assignation_id));
        return NextResponse.json({ ok: true });
      }

      // Étape 1 du dépôt : l'URL signée. Aucune ligne n'est encore créée.
      case 'preparer-depot': {
        const prep = await preparerDepotSujet(String(corps.session_id), String(corps.fichier_nom ?? 'sujet.pdf'));
        return NextResponse.json(prep);
      }

      // Étape 2 : le fichier est monté, on enregistre la fiche.
      case 'enregistrer-sujet': {
        const sujet = await enregistrerSujet({
          session_id: String(corps.session_id),
          type: corps.type ? String(corps.type) : 'sujet',
          titre: corps.titre ? String(corps.titre) : null,
          consigne: corps.consigne ? String(corps.consigne) : null,
          fichier_path: corps.fichier_path ? String(corps.fichier_path) : null,
          fichier_nom: corps.fichier_nom ? String(corps.fichier_nom) : null,
          fichier_octets: corps.fichier_octets ? Number(corps.fichier_octets) : null,
          subject_card_id: corps.subject_card_id ? String(corps.subject_card_id) : null,
          visible_prof: corps.visible_prof === true,
          depose_par: moi.id,
        });
        return NextResponse.json({ ok: true, sujet });
      }

      case 'maj-sujet': {
        await majSujet(String(corps.sujet_id), {
          ...(corps.titre !== undefined ? { titre: corps.titre ? String(corps.titre) : null } : {}),
          ...(corps.consigne !== undefined ? { consigne: corps.consigne ? String(corps.consigne) : null } : {}),
          ...(corps.type !== undefined ? { type: String(corps.type) } : {}),
          ...(corps.visible_prof !== undefined ? { visible_prof: corps.visible_prof === true } : {}),
          ...(corps.subject_card_id !== undefined
            ? { subject_card_id: corps.subject_card_id ? String(corps.subject_card_id) : null }
            : {}),
        });
        return NextResponse.json({ ok: true });
      }

      case 'supprimer-sujet': {
        await supprimerSujet(String(corps.sujet_id));
        return NextResponse.json({ ok: true });
      }

      case 'lien-sujet': {
        const url = await lienSujet(String(corps.fichier_path));
        if (!url) return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 });
        return NextResponse.json({ url });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
    }
  } catch (err) {
    console.error('❌ /api/admin/bacs-blancs POST', err);
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
