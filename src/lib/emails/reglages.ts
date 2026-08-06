/**
 * Réglages du système d'e-mails — TOUS les délais sont ici.
 *
 * Une seule table (`email_reglages`, clé/valeur) et un seul jeu de valeurs
 * par défaut, dans ce fichier. Rien n'est éparpillé ailleurs : pour changer
 * « rappel la veille à 18 h », on change une ligne dans /admin/emails, et
 * c'est fini.
 *
 * Si la table est vide ou injoignable, les valeurs par défaut s'appliquent :
 * le système ne s'arrête jamais faute de réglage.
 */
import { emailsDb } from './client';
import { LIBELLE_REGLAGE, type Reglages } from './reglages-libelles';

export { LIBELLE_REGLAGE };
export type { Reglages };

export const REGLAGES_DEFAUT: Reglages = {
  infos_pratiques_jours_avant: 5,
  lien_visio_jours_avant: 2,
  rappel_veille_heure: 18,
  dernier_rappel_minutes_avant: 60,
  relance_paiement_heures_apres: 48,
  relance_paiement_max: 2,
  demande_avis_jours_apres: 3,
  prof_infos_jours_avant: 5,
  prof_rappel_heures_avant: 24,
  prof_echeance_correction_jours: 7,
  relance_interet_jours_apres: 3,
  quota_quotidien: 300,
  quota_marge: 30,
  lien_avis_url: '',
  paiement_instructions: '',
  paiement_montant_defaut: '29',
  envoi_actif: 'oui',
  // Par défaut : « maintenant ». Tant que la ligne n'existe pas en base, le
  // planificateur ne remonte donc pas dans le passé.
  actif_depuis: new Date().toISOString(),
};

/** Réglages qui sont des nombres — le reste est du texte libre. */
const NUMERIQUES = new Set<keyof Reglages>([
  'infos_pratiques_jours_avant',
  'lien_visio_jours_avant',
  'rappel_veille_heure',
  'dernier_rappel_minutes_avant',
  'relance_paiement_heures_apres',
  'relance_paiement_max',
  'demande_avis_jours_apres',
  'prof_infos_jours_avant',
  'prof_rappel_heures_avant',
  'prof_echeance_correction_jours',
  'relance_interet_jours_apres',
  'quota_quotidien',
  'quota_marge',
]);

export function estReglage(cle: string): cle is keyof Reglages {
  return Object.prototype.hasOwnProperty.call(REGLAGES_DEFAUT, cle);
}

/** Applique des valeurs texte (celles de la base) sur les valeurs par défaut. */
export function fusionnerReglages(lignes: { cle: string; valeur: string }[]): Reglages {
  const r: Reglages = { ...REGLAGES_DEFAUT };
  for (const { cle, valeur } of lignes) {
    if (!estReglage(cle)) continue;
    if (NUMERIQUES.has(cle)) {
      const n = Number(valeur);
      if (Number.isFinite(n)) (r as unknown as Record<string, number>)[cle] = n;
    } else {
      (r as unknown as Record<string, string>)[cle] = String(valeur ?? '');
    }
  }
  return r;
}

// Petit cache : le moteur lit les réglages plusieurs fois par exécution.
let cache: { valeurs: Reglages; expire: number } | null = null;
const DUREE_CACHE_MS = 20_000;

export async function chargerReglages(force = false): Promise<Reglages> {
  if (!force && cache && cache.expire > Date.now()) return cache.valeurs;

  try {
    const { data, error } = await emailsDb().from('email_reglages').select('cle, valeur');
    if (error) throw error;
    const valeurs = fusionnerReglages((data ?? []) as { cle: string; valeur: string }[]);
    cache = { valeurs, expire: Date.now() + DUREE_CACHE_MS };
    return valeurs;
  } catch (err) {
    console.error('⚠️ Réglages e-mails illisibles, valeurs par défaut appliquées :', err);
    return { ...REGLAGES_DEFAUT };
  }
}

export async function enregistrerReglage(cle: keyof Reglages, valeur: string): Promise<void> {
  const { error } = await emailsDb()
    .from('email_reglages')
    .upsert({ cle, valeur, libelle: LIBELLE_REGLAGE[cle] }, { onConflict: 'cle' });
  if (error) throw error;
  cache = null;
}

/** Le mode « rien ne part » demandé depuis l'administration. */
export function envoiDesactive(r: Reglages): boolean {
  return String(r.envoi_actif).trim().toLowerCase() !== 'oui';
}
