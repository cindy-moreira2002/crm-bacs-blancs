/**
 * Les deux adresses que le prof ouvre à chaque bac blanc.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 *  · la grille de correction : c'est LE MÊME classeur pour tous les élèves et
 *    tous les bacs blancs. Elle était rangée session par session, donc vide
 *    partout — et l'espace prof affichait un lien de démonstration qui ne
 *    menait nulle part. Elle vit maintenant en un seul endroit ;
 *  · le dossier des copies : le dossier général, celui où l'on range les
 *    documents des élèves.
 *
 * Une session garde le droit d'avoir les siens (colonnes `sheet_correction_url`
 * et `drive_copies_url`) : quand elles sont remplies, elles gagnent. C'est ce
 * qui permet un bac blanc particulier sans casser la règle générale.
 *
 * Rangés dans `email_reglages`, la table clé/valeur qui existe déjà : une
 * deuxième table pour deux lignes n'aurait rien apporté.
 */
import { crmAdmin } from '@/lib/authProf';

export type ReglagesConsole = {
  /** Le classeur de correction commun. Chaîne vide = pas encore renseigné. */
  sheet_correction_url: string;
  /** Le dossier général des copies. Chaîne vide = pas encore renseigné. */
  drive_copies_url: string;
};

export const CLES_CONSOLE = ['sheet_correction_url', 'drive_copies_url'] as const;

const VIDE: ReglagesConsole = { sheet_correction_url: '', drive_copies_url: '' };

/**
 * Ne lève jamais : une lecture ratée renvoie des adresses vides, et la console
 * affiche « à renseigner » plutôt qu'un lien mort.
 */
export async function chargerReglagesConsole(): Promise<ReglagesConsole> {
  const { data, error } = await crmAdmin()
    .from('email_reglages')
    .select('cle, valeur')
    .in('cle', [...CLES_CONSOLE]);

  if (error || !data) return { ...VIDE };

  const lu = { ...VIDE };
  for (const ligne of data as { cle: string; valeur: string | null }[]) {
    if (ligne.cle === 'sheet_correction_url') lu.sheet_correction_url = (ligne.valeur ?? '').trim();
    if (ligne.cle === 'drive_copies_url') lu.drive_copies_url = (ligne.valeur ?? '').trim();
  }
  return lu;
}

/** Écrit une des deux adresses. Vide est une valeur valide : elle efface. */
export async function enregistrerReglageConsole(
  cle: (typeof CLES_CONSOLE)[number],
  valeur: string,
): Promise<{ ok: boolean; erreur?: string }> {
  const propre = String(valeur ?? '').trim();
  if (propre && !/^https?:\/\//i.test(propre)) {
    return { ok: false, erreur: 'L’adresse doit commencer par https://' };
  }

  const { error } = await crmAdmin()
    .from('email_reglages')
    .upsert({ cle, valeur: propre }, { onConflict: 'cle' });

  return error ? { ok: false, erreur: error.message } : { ok: true };
}

/** L'adresse retenue pour une session : la sienne, sinon la générale. */
export function adresseRetenue(
  propreALaSession: string | null | undefined,
  generale: string,
): string | null {
  const session = (propreALaSession ?? '').trim();
  if (session) return session;
  return generale || null;
}
