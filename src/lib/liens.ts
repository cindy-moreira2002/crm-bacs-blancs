/**
 * Liens externes utilisés à plusieurs endroits.
 *
 * Les candidatures de professeurs passent UNIQUEMENT par ce formulaire Google :
 * plus aucune création de compte n'est possible depuis le site (voir
 * /api/prof/inscription, volontairement fermée). L'administratrice lit les
 * réponses, choisit qui rejoint l'équipe, puis crée le compte elle-même.
 */
export const FORMULAIRE_CANDIDATURE_PROF =
  'https://docs.google.com/forms/d/e/1FAIpQLSd86zSSky8DHO_8Hedjqq7ttAhfLagwtejGzVTrJoYpoj9Zjw/viewform';

/**
 * L'application d'écriture — « le téléphone devient le stylo ».
 *
 * L'élève y écrit sa copie ; le professeur y lit la même copie, en direct.
 * L'adresse se déduit du code signé de la copie (`lib/codeCopie`), donc les
 * deux espaces montrent forcément la même chose : rien à recopier, rien à
 * coller. C'est ce lien-là que l'élève reçoit à son inscription.
 */
export const ECRITURE_URL = (
  process.env.NEXT_PUBLIC_ECRITURE_URL?.trim() || 'https://matinees-appweb-ecriture.vercel.app'
).replace(/\/+$/, '');

export function lienEcritureCopie(code: string | null, matiere: string): string | null {
  if (!code) return null;
  return `${ECRITURE_URL}/copie/${code}?m=${encodeURIComponent(matiere)}`;
}
