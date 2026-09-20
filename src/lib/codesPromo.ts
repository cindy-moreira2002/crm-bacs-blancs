/**
 * Les codes promo — 10 € de remise, une seule fois par élève.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du CRM).
 *
 * La règle, posée le 20 septembre 2026 : un élève qui s'inscrit avec le code
 * de son prof paie 10 € de moins, et seulement à sa PREMIÈRE matinée. Sa
 * deuxième inscription est au prix normal, même code, même prof.
 *
 * Deux choses que ce fichier refuse, volontairement :
 *
 *  1. **Un code inventé.** Avant, un code inconnu était simplement ignoré et
 *     l'inscription passait : la famille croyait avoir une remise, personne ne
 *     s'en apercevait. Désormais, seuls les codes du répertoire
 *     (`codes_promo`, script 53) existent. Le reste est refusé À L'ÉCRAN.
 *  2. **Un deuxième usage.** Le compte se fait sur l'adresse de l'élève ET sur
 *     son nom rapproché de l'adresse du parent — sans quoi il suffirait de
 *     reprendre une autre adresse pour se re-remiser à chaque session.
 *
 * La remise est ensuite écrite EN DUR sur l'inscription (`remise_euros`) : le
 * jour où le montant de la remise change, les inscriptions déjà prises gardent
 * le prix auquel elles ont été vendues.
 */
import { crmAdmin } from '@/lib/authProf';

export type CodePromo = {
  code: string;
  libelle: string;
  professeur_id: string | null;
  remise_euros: number;
  categorie: 'prof' | 'campagne';
  actif: boolean;
  valide_du: string | null;
  valide_au: string | null;
  usages_par_eleve: number;
};

/** Verdict rendu à l'inscription — c'est lui qui décide du prix payé. */
export type VerdictCode =
  | { etat: 'aucun'; remise: 0; code: null }
  | { etat: 'accepte'; remise: number; code: string; libelle: string; professeur_id: string | null }
  | { etat: 'deja_utilise'; remise: 0; code: string; libelle: string; professeur_id: string | null }
  | { etat: 'inconnu'; remise: 0; code: string; message: string };

/**
 * Forme canonique d'un code : sans espaces, en majuscules. Même règle que
 * `normaliserCode` de l'affiliation — les deux doivent produire exactement la
 * même chaîne, sinon un code accepté ici serait introuvable là-bas.
 */
export function normaliserPromo(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 40);
}

/** Le nom d'un élève, comparable : sans accents, sans ponctuation, en minuscules. */
function nomComparable(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Le code du répertoire, ou `null` s'il n'existe pas, est désactivé, ou est
 * hors de sa fenêtre de validité. Un code hors période est traité exactement
 * comme un code inexistant : la famille ne doit pas apprendre qu'il a existé.
 */
export async function lireCodePromo(saisi: unknown): Promise<CodePromo | null> {
  const code = normaliserPromo(saisi);
  if (code.length < 4) return null;

  try {
    const { data, error } = await crmAdmin()
      .from('codes_promo')
      .select('code, libelle, professeur_id, remise_euros, categorie, actif, valide_du, valide_au, usages_par_eleve')
      .eq('code', code)
      .maybeSingle();
    if (error || !data) return null;

    const ligne = data as CodePromo;
    if (!ligne.actif) return null;

    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (ligne.valide_du && aujourdhui < ligne.valide_du) return null;
    if (ligne.valide_au && aujourdhui > ligne.valide_au) return null;

    return ligne;
  } catch (err) {
    // Répertoire illisible (table pas encore créée, panne réseau) : on ne
    // bloque pas une inscription pour ça, on la prend au prix plein.
    console.error('[codes promo] répertoire illisible :', err);
    return null;
  }
}

/**
 * Combien de fois cet élève a DÉJÀ bénéficié d'une remise.
 *
 * Le repérage se fait sur deux clés, parce qu'aucune ne suffit seule :
 *  - l'adresse de l'élève : la plus fiable, mais on peut en créer une autre ;
 *  - nom + prénom rapprochés de l'adresse du parent : c'est le foyer, et deux
 *    enfants d'une même famille gardent bien chacun leur propre remise.
 */
export async function remisesDejaAccordees(
  emailEleve: string,
  nomEleve: string,
  emailParent: string | null,
): Promise<number> {
  const email = String(emailEleve ?? '').trim().toLowerCase();
  const parent = String(emailParent ?? '').trim().toLowerCase();
  const nom = nomComparable(nomEleve);

  try {
    const db = crmAdmin();
    const { data, error } = await db
      .from('inscriptions')
      .select('id, nom, email, email_parent, remise_euros, paiement_statut')
      .gt('remise_euros', 0)
      .limit(500);
    if (error || !data) return 0;

    return (data as {
      nom: string | null;
      email: string | null;
      email_parent: string | null;
      paiement_statut: string | null;
    }[]).filter((i) => {
      // Une inscription annulée n'a rien consommé : la place a été rendue,
      // la remise aussi. Sinon un virement oublié brûlerait la remise à vie.
      if (i.paiement_statut === 'annule') return false;
      const memeEmail = (i.email ?? '').trim().toLowerCase() === email && email !== '';
      const memeFoyer =
        parent !== '' &&
        (i.email_parent ?? '').trim().toLowerCase() === parent &&
        nomComparable(i.nom) === nom &&
        nom !== '';
      return memeEmail || memeFoyer;
    }).length;
  } catch (err) {
    console.error('[codes promo] comptage des remises impossible :', err);
    return 0;
  }
}

/**
 * Le verdict complet, celui qui décide du prix affiché à la famille.
 *
 * `inconnu` est un REFUS : la route d'inscription répond 400 et l'élève
 * corrige son code. C'est le seul cas où une inscription échoue à cause d'un
 * code — et c'est voulu : mieux vaut un formulaire à recommencer qu'une
 * famille qui découvre au moment de payer que sa remise n'existait pas.
 */
export async function evaluerCode(
  saisi: unknown,
  eleve: { email: string; nom: string; emailParent: string | null },
): Promise<VerdictCode> {
  const code = normaliserPromo(saisi);
  if (!code) return { etat: 'aucun', remise: 0, code: null };

  const promo = await lireCodePromo(code);
  if (!promo) {
    return {
      etat: 'inconnu',
      remise: 0,
      code,
      message:
        'Ce code n’existe pas ou n’est plus valable. Vérifie-le auprès de ton professeur, ou laisse le champ vide.',
    };
  }

  const deja = await remisesDejaAccordees(eleve.email, eleve.nom, eleve.emailParent);
  if (deja >= promo.usages_par_eleve) {
    return {
      etat: 'deja_utilise',
      remise: 0,
      code: promo.code,
      libelle: promo.libelle,
      professeur_id: promo.professeur_id,
    };
  }

  return {
    etat: 'accepte',
    remise: Number(promo.remise_euros) || 0,
    code: promo.code,
    libelle: promo.libelle,
    professeur_id: promo.professeur_id,
  };
}

/** Le prix réellement dû, jamais négatif. */
export function prixApresRemise(montantPlein: number, remise: number): number {
  const plein = Number(montantPlein) || 0;
  const r = Number(remise) || 0;
  return Math.max(0, Math.round((plein - r) * 100) / 100);
}
