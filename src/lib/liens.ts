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

export function lienEcritureCopie(
  code: string | null,
  matiere: string,
  prof = false,
): string | null {
  if (!code) return null;
  // ?prof=1 : la même page, mais avec le panneau de commentaires en mode
  // professeur (il pose les commentaires, l'élève y répond).
  return `${ECRITURE_URL}/copie/${code}?m=${encodeURIComponent(matiere)}${prof ? '&prof=1' : ''}`;
}
