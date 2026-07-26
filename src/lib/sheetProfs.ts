/**
 * Recopie la fiche d'un prof dans le Google Sheet de suivi.
 *
 * ⚠️ Le mot de passe n'est JAMAIS envoyé ici, sous aucune forme. Le Sheet est
 * une trace de gestion (qui s'est inscrit, dans quelle matière, où en est la
 * candidature), pas un coffre-fort d'identifiants.
 *
 * Côté Google : un Apps Script publié en web app reçoit ce POST et écrit la
 * ligne. Voir GOOGLE_APPS_SCRIPT_PROFS.js à la racine du projet.
 *
 * L'appel est volontairement non bloquant : si le Sheet est injoignable,
 * l'inscription du prof aboutit quand même.
 */
import type { Professeur } from '@/lib/authProf';

const WEBAPP = process.env.PROFS_SHEET_WEBAPP_URL ?? '';
const TOKEN = process.env.PROFS_SHEET_TOKEN ?? '';

export type LigneSheetProf = {
  action: 'upsert';
  token: string;
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  matieres: string;
  date_inscription: string;
  statut_candidature: string;
  statut_compte: string;
  bacs_blancs: string;
};

export function ligneSheet(prof: Professeur, bacsBlancs: string[] = []): LigneSheetProf {
  return {
    action: 'upsert',
    token: TOKEN,
    id: prof.id,
    prenom: prof.prenom,
    nom: prof.nom,
    email: prof.email,
    telephone: prof.telephone ?? '',
    matieres: (prof.matieres ?? []).join(', '),
    date_inscription: new Date(prof.created_at).toLocaleDateString('fr-FR'),
    statut_candidature: prof.statut_candidature,
    statut_compte: prof.statut_compte,
    bacs_blancs: bacsBlancs.join(' | '),
  };
}

/** Ne lève jamais : une panne du Sheet ne doit pas casser une inscription. */
export async function synchroniserSheet(prof: Professeur, bacsBlancs: string[] = []) {
  if (!WEBAPP) {
    console.warn('⚠️ PROFS_SHEET_WEBAPP_URL absent — Google Sheet des profs non mis à jour.');
    return;
  }
  try {
    const res = await fetch(WEBAPP, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (MatineesDuBac)',
      },
      body: JSON.stringify(ligneSheet(prof, bacsBlancs)),
    });
    console.log('✅ Sheet profs:', res.status);
  } catch (err) {
    console.error('⚠️ Sheet profs injoignable (non bloquant):', err);
  }
}
