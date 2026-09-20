/**
 * Les textes d'e-mails corrigés depuis la console.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Cinq zones par modèle, et cinq seulement — celles où une correction ne peut
 * rien casser (voir le script SQL 55). Le corps reste dans le code : c'est lui
 * qui porte les variables obligatoires, et une variable mal recopiée enverrait
 * « Bonjour undefined ».
 *
 * Une zone non renseignée = le texte d'origine. Effacer une zone suffit donc
 * à revenir en arrière : on ne perd jamais le texte de départ.
 *
 * Les textes acceptent les variables entre accolades — `{first_name}`,
 * `{subject_name}` — remplacées au moment de l'envoi, **échappées**. Une
 * variable inconnue est laissée telle quelle plutôt que remplacée par du
 * vide : on voit l'erreur au lieu de lire une phrase amputée.
 */
import { crmAdmin } from '@/lib/authProf';

export const ZONES = ['sujet', 'titre', 'intro', 'postscriptum', 'signature'] as const;
export type Zone = (typeof ZONES)[number];

export const LIBELLE_ZONE: Record<Zone, string> = {
  sujet: 'Objet du message',
  titre: 'Titre en haut du message',
  intro: 'Paragraphe ajouté avant le corps',
  postscriptum: 'Paragraphe ajouté après les boutons',
  signature: 'Formule de fin',
};

export const AIDE_ZONE: Record<Zone, string> = {
  sujet: 'Ce qui s’affiche dans la boîte de réception. Remplace l’objet d’origine.',
  titre: 'Le grand titre en haut de l’e-mail. Remplace le titre d’origine.',
  intro: 'S’ajoute juste avant le corps du message, sans rien supprimer.',
  postscriptum: 'S’ajoute tout en bas, après les boutons.',
  signature: 'Par défaut « À très vite ».',
};

export type TextesModele = Partial<Record<Zone, string>>;

export function estZone(v: string): v is Zone {
  return (ZONES as readonly string[]).includes(v);
}

let cache: { valeurs: Map<string, TextesModele>; expire: number } | null = null;
const DUREE_CACHE_MS = 20_000;

/** Tous les textes personnalisés, par type de modèle. */
export async function chargerTextes(force = false): Promise<Map<string, TextesModele>> {
  if (!force && cache && cache.expire > Date.now()) return cache.valeurs;

  const valeurs = new Map<string, TextesModele>();
  try {
    const { data, error } = await crmAdmin().from('email_textes').select('type, cle, valeur');
    if (error) throw error;
    for (const l of ((data ?? []) as { type: string; cle: string; valeur: string }[])) {
      if (!estZone(l.cle)) continue;
      const actuel = valeurs.get(l.type) ?? {};
      actuel[l.cle] = l.valeur;
      valeurs.set(l.type, actuel);
    }
  } catch {
    // Table absente (script 55 pas encore joué) : aucun texte personnalisé,
    // les modèles d'origine s'appliquent. Jamais bloquant.
  }

  cache = { valeurs, expire: Date.now() + DUREE_CACHE_MS };
  return valeurs;
}

/** Les textes d'UN modèle. */
export async function textesDuModele(type: string): Promise<TextesModele> {
  return (await chargerTextes()).get(type) ?? {};
}

export async function enregistrerTexte(
  type: string,
  zone: Zone,
  valeur: string,
  auteur?: string | null,
): Promise<void> {
  const propre = String(valeur ?? '').trim();
  const db = crmAdmin();

  // Vider une zone, c'est revenir au texte d'origine : on supprime la ligne
  // plutôt que d'enregistrer une chaîne vide, qui effacerait l'objet.
  if (!propre) {
    await db.from('email_textes').delete().eq('type', type).eq('cle', zone);
  } else {
    await db
      .from('email_textes')
      .upsert(
        { type, cle: zone, valeur: propre, modifie_par: auteur ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'type,cle' },
      );
  }
  cache = null;
}

/**
 * Remplace `{cle}` par la valeur de la variable, échappée pour le HTML.
 *
 * Une clé inconnue est laissée telle quelle : mieux vaut lire « {prenom} » et
 * comprendre la faute que recevoir une phrase trouée.
 */
export function appliquerVariables(
  texte: string,
  variables: Record<string, string>,
  echapper: (v: string) => string,
): string {
  return String(texte ?? '').replace(/\{([a-z0-9_]+)\}/gi, (entier, cle: string) => {
    const v = variables[cle];
    return v === undefined || v === '' ? entier : echapper(v);
  });
}
