/**
 * Le compte de virement des Matinées du Bac, mis en forme une seule fois.
 *
 * Deux endroits montrent exactement la même chose à la famille : l'écran qui
 * s'affiche juste après l'inscription, et l'e-mail de confirmation. Les deux
 * lisent donc ce fichier — pas question que l'IBAN soit formaté d'un côté et
 * pas de l'autre, ni que le délai annoncé diffère d'un support à l'autre.
 *
 * Module PUR : aucun accès base, aucune variable d'environnement. Il peut
 * donc être importé par un composant client sans embarquer Supabase.
 *
 * L'IBAN lui-même n'est pas ici : il vit dans `email_reglages`
 * (`paiement_iban`), saisi dans /direction/emails. Un IBAN écrit en dur resterait
 * dans l'historique git et survivrait à un changement de banque.
 */

export type CompteVirement = {
  /** IBAN groupé par 4, tel qu'on le lit sur un RIB. Vide si non renseigné. */
  iban: string;
  /** IBAN sans espaces, pour un copier-coller dans une appli bancaire. */
  ibanBrut: string;
  titulaire: string;
  bic: string;
  /** Montant en euros, déjà formaté (« 29 »). */
  montant: string;
  /** Ce que la famille doit écrire dans le libellé du virement. */
  reference: string;
  /** Minutes laissées pour régler. */
  delaiMinutes: number;
  /** Texte libre ajouté par l'administratrice, ou chaîne vide. */
  precisions: string;
  /** Peut-on afficher un cadre de virement ? Faux tant qu'il n'y a pas d'IBAN. */
  pret: boolean;
};

/** « FR7612345678901234567890123 » → « FR76 1234 5678 9012 3456 7890 123 ». */
export function formaterIban(v: string): string {
  const brut = String(v ?? '').replace(/\s+/g, '').toUpperCase();
  return brut.replace(/(.{4})/g, '$1 ').trim();
}

export function ibanBrut(v: string): string {
  return String(v ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Un IBAN est-il plausible ? Contrôle de forme seulement (deux lettres de
 * pays puis 13 à 32 caractères) — la banque fera le reste. Le but est
 * d'empêcher d'afficher aux familles un champ manifestement incomplet.
 */
export function ibanPlausible(v: string): boolean {
  return /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(ibanBrut(v));
}

export const DELAI_PAIEMENT_DEFAUT = 10;

/**
 * La référence à indiquer dans le virement : le nom de l'élève et le début de
 * l'identifiant d'inscription. Le nom seul ne suffit pas (deux frères et sœurs
 * sur le même compte), l'identifiant seul est illisible sur un relevé.
 */
export function referenceVirement(nom: string, inscriptionId: string): string {
  const propre = String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, 24);
  const ref = String(inscriptionId ?? '').slice(0, 8).toUpperCase();
  return [propre, ref].filter(Boolean).join(' ') || ref;
}

export function construireCompte(entree: {
  iban?: string | null;
  titulaire?: string | null;
  bic?: string | null;
  montant?: string | number | null;
  reference?: string | null;
  delaiMinutes?: number | null;
  precisions?: string | null;
}): CompteVirement {
  const brut = ibanBrut(entree.iban ?? '');
  const delai = Number(entree.delaiMinutes);
  return {
    iban: formaterIban(brut),
    ibanBrut: brut,
    titulaire: String(entree.titulaire ?? '').trim(),
    bic: String(entree.bic ?? '').replace(/\s+/g, '').toUpperCase(),
    montant: String(entree.montant ?? '').trim(),
    reference: String(entree.reference ?? '').trim(),
    delaiMinutes: Number.isFinite(delai) && delai > 0 ? Math.round(delai) : DELAI_PAIEMENT_DEFAUT,
    precisions: String(entree.precisions ?? '').trim(),
    pret: ibanPlausible(brut),
  };
}

/**
 * La phrase que Cindy a demandée, mot pour mot, et le délai qui va avec.
 * Écrite ici pour que l'écran et l'e-mail ne puissent pas diverger.
 */
export const AVERTISSEMENT_PAIEMENT =
  'Tant que vous n’aurez pas payé et validé le paiement, votre inscription ne sera pas enregistrée.';

export function phraseDelai(minutes: number): string {
  return `Vous avez ${minutes} minutes pour effectuer le virement. Passé ce délai, l’inscription est annulée et la place est rendue à un autre élève.`;
}
