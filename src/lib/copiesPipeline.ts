/**
 * Lien entre une ligne CRM `copies` et une correction du pipeline.
 *
 * Une correction publiée par `npm run correction:publier` porte son
 * identifiant dans `copies.remarques.pipeline.correction_id`. L'espace élève
 * affiche alors, au lieu du PDF stocké en base (`pdf_pret`), un bouton vers le
 * dossier HTML du pipeline : /dossier/<correction_id>.
 *
 * Pas de colonne dédiée : `remarques` est déjà un jsonb, et publier ne demande
 * ainsi aucun SQL à jouer. Aucun import serveur ici : utilisable partout.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lienDossierPipeline(correctionId: string): string {
  return `/dossier/${correctionId}`;
}

/** Le lien du dossier pipeline d'une copie, ou null si elle n'en a pas. */
export function dossierUrlDeCopie(remarques: unknown): string | null {
  if (!remarques || typeof remarques !== 'object') return null;
  const pipeline = (remarques as { pipeline?: { correction_id?: unknown } }).pipeline;
  const id = pipeline?.correction_id;
  return typeof id === 'string' && UUID.test(id) ? lienDossierPipeline(id) : null;
}
