/**
 * Le bouton « ✋ Appeler le prof », dans la salle Discord de l'élève.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Comment ça marche sans bot allumé en permanence : Discord sait livrer les
 * clics de bouton par une simple requête HTTP, sur une adresse qu'on lui donne
 * (« Interactions Endpoint URL » dans le portail développeur). Aucune
 * passerelle temps réel, donc rien à héberger — la même contrainte que le reste
 * du module, tenue de la même façon.
 *
 * Discord signe chaque requête (Ed25519). La signature n'est pas une formalité :
 * sans elle, n'importe qui pourrait appeler notre adresse et faire sonner le
 * prof au nom d'un élève. Toute requête mal signée est refusée en 401, et
 * Discord lui-même vérifie ce refus avant d'accepter l'adresse.
 */
import { createPublicKey, verify as verifierSignatureCrypto } from 'node:crypto';

/** ⚠️ PUBLIC au sens de Discord, mais à poser en variable d'environnement. */
export const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? '';

/**
 * Le bouton n'est posé QUE si la clé est connue. Sans elle, nous ne saurions
 * pas vérifier les clics : le bouton s'afficherait dans la salle de l'élève et
 * répondrait « échec de l'interaction ». Mieux vaut pas de bouton du tout.
 */
export function boutonAppelActif(): boolean {
  return PUBLIC_KEY.length === 64;
}

/** Types d'interaction utilisés (Discord en définit d'autres, inutiles ici). */
export const TYPE_INTERACTION = {
  PING: 1,
  COMPONENT: 3,
} as const;

/** Types de réponse utilisés. */
export const TYPE_REPONSE = {
  PONG: 1,
  MESSAGE: 4,
} as const;

/** Message visible du seul élève qui a cliqué. */
export const MESSAGE_PRIVE = 64;

/** Identifiants de nos deux boutons. */
export const BOUTON = {
  AIDE: 'appeler-le-prof',
  TECHNIQUE: 'appeler-le-prof:technique',
  ANNULER: 'baisser-la-main',
} as const;

/**
 * La clé publique de Discord est fournie en hexadécimal brut (32 octets).
 * Node veut une clé structurée : on l'habille de l'en-tête DER qui décrit
 * « clé publique Ed25519 », ce qui évite d'ajouter une dépendance pour douze
 * octets constants.
 */
const ENTETE_DER = Buffer.from('302a300506032b6570032100', 'hex');

function cléPublique() {
  return createPublicKey({
    key: Buffer.concat([ENTETE_DER, Buffer.from(PUBLIC_KEY, 'hex')]),
    format: 'der',
    type: 'spki',
  });
}

/**
 * La requête vient-elle vraiment de Discord ?
 *
 * `corpsBrut` doit être le texte EXACT reçu — pas un objet re-sérialisé : la
 * signature porte sur les octets, et un espace de différence la casse.
 */
export function signatureValide(
  corpsBrut: string,
  signature: string | null,
  horodatage: string | null,
): boolean {
  if (!boutonAppelActif() || !signature || !horodatage) return false;
  try {
    return verifierSignatureCrypto(
      null,
      Buffer.from(horodatage + corpsBrut),
      cléPublique(),
      Buffer.from(signature, 'hex'),
    );
  } catch {
    // Signature illisible (hexadécimal invalide, longueur inattendue) : c'est
    // un refus, pas une panne.
    return false;
  }
}

/** Le message posé dans la salle de chaque élève, avec ses deux boutons. */
export function messageBoutonAppel() {
  return {
    content:
      '**Besoin d’aide pendant l’épreuve ?**\n' +
      'Appuie sur le bouton : ton professeur voit ta demande sur son tableau de bord ' +
      'et te rejoint dans cette salle. Pas besoin de parler ni d’écrire.',
    components: [
      {
        type: 1, // rangée
        components: [
          { type: 2, style: 1, label: '✋ Appeler le prof', custom_id: BOUTON.AIDE },
          { type: 2, style: 2, label: '🛠️ Souci technique', custom_id: BOUTON.TECHNIQUE },
          { type: 2, style: 2, label: '↩️ Finalement, ça va', custom_id: BOUTON.ANNULER },
        ],
      },
    ],
  };
}
