import { createHmac } from 'crypto';

// Code d'une copie dans l'espace écriture : « lea-martin-x7f3 ».
//
// La partie lisible sert au repérage humain (l'élève et le professeur voient le
// même code sur les deux écrans). Le suffixe est une signature : il dépend d'un
// secret qui ne quitte jamais le serveur, donc l'adresse d'une copie ne peut pas
// être devinée à partir du seul nom de l'élève. Sans lui, n'importe qui pouvait
// ouvrir — et griffonner — la copie de n'importe quel élève en tapant son nom.
//
// La signature est déterministe : le même élève et la même matière redonnent
// toujours le même code, y compris après une réinstallation de l'application.
//
// ATTENTION : changer le secret change tous les codes, donc rend inaccessibles
// les copies déjà commencées. À ne faire qu'entre deux sessions.

export function slugNom(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Secret dédié si disponible ; sinon on réutilise un secret serveur déjà en
// place, pour qu'aucune configuration ne soit nécessaire à la mise en ligne.
function secret(): string | null {
  return (
    process.env.ECRITURE_CODE_SECRET ||
    process.env.PIPELINE_INTERNAL_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

/**
 * Code de copie d'un élève pour une matière donnée.
 * Renvoie null si aucun secret n'est disponible : mieux vaut ne pas proposer
 * d'accès du tout que d'en proposer un que tout le monde peut deviner.
 */
export function codeCopie(nom: string, matiere: string): string | null {
  const base = slugNom(nom);
  if (!base) return null;
  const cle = secret();
  if (!cle) return null;
  const signature = createHmac('sha256', cle)
    .update(`ecriture:${base}:${slugNom(matiere)}`)
    .digest('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 6);
  return `${base}-${signature}`;
}
