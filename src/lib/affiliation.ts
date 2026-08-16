/**
 * Affiliation — 10 € au prof dont le lien a amené l'élève.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du CRM).
 *
 * La chaîne complète, en une phrase : le prof partage
 * `…/inscription?ref=SONCODE`, l'élève voit son parrain à l'écran, le code
 * atterrit dans `inscriptions.code_affiliation`, et le jour où CET élève paie,
 * une ligne de 10 € apparaît dans `revenus_prof` — c'est elle qui remonte dans
 * la page Paiements et dans le classeur de suivi financier.
 *
 * Deux règles, volontairement strictes :
 *
 *  1. On ne crédite qu'un élève RÉELLEMENT PAYÉ (`paiement_statut = 'paye'`).
 *     Une inscription en attente affiche « à venir » : on ne doit pas de
 *     virement à un prof pour un élève qui n'a rien réglé, et une place
 *     offerte n'encaisse rien.
 *  2. Une inscription ne peut créditer qu'une seule fois : l'unicité est tenue
 *     par un index en base (`revenus_prof_affiliation_unique`, script 47), pas
 *     seulement par ce fichier.
 */
import { crmAdmin } from '@/lib/authProf';

/** Ce que touche un prof pour un élève qu'il a amené. */
export const MONTANT_AFFILIATION = (() => {
  const n = Number(process.env.AFFILIATION_MONTANT);
  return Number.isFinite(n) && n > 0 ? n : 10;
})();

export type ProfParraine = {
  id: string;
  prenom: string;
  nom: string;
  code_affiliation: string;
};

/**
 * Forme canonique d'un code : sans espaces, en majuscules. « claire3f7b »,
 * « CLAIRE3F7B » et « Claire 3F7B » désignent le même prof — un code recopié
 * à la main depuis un e-mail ne doit pas se perdre pour une majuscule.
 */
export function normaliserCode(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 40);
}

/**
 * Le prof qui porte ce code, ou `null`. Un compte suspendu ou une candidature
 * refusée ne parraine plus : mieux vaut ignorer le code que promettre à
 * l'élève une remise en règle qui n'existe plus.
 */
export async function profParCode(code: unknown): Promise<ProfParraine | null> {
  const cible = normaliserCode(code);
  if (!cible) return null;

  // `crmAdmin()` lève si les variables d'environnement manquent. Un
  // parrainage introuvable ne doit jamais empêcher une inscription de passer :
  // on retombe sur « pas de parrain », l'élève s'inscrit quand même.
  let data: unknown[] | null = null;
  try {
    const reponse = await crmAdmin()
      .from('professeurs')
      .select('id, prenom, nom, code_affiliation, statut_compte, statut_candidature');
    if (reponse.error) return null;
    data = reponse.data;
  } catch (e) {
    console.error('[affiliation] lecture des profs impossible :', e);
    return null;
  }
  if (!data) return null;

  const trouve = (data as (ProfParraine & {
    statut_compte: string | null;
    statut_candidature: string | null;
  })[]).find((p) => normaliserCode(p.code_affiliation) === cible);

  if (!trouve) return null;
  if (trouve.statut_compte === 'suspendu') return null;
  if (trouve.statut_candidature === 'refusee') return null;

  return {
    id: trouve.id,
    prenom: trouve.prenom,
    nom: trouve.nom,
    code_affiliation: trouve.code_affiliation,
  };
}

/** « Claire M. » — de quoi rassurer l'élève sans publier l'annuaire des profs. */
export function nomCourt(p: { prenom: string; nom: string }): string {
  const initiale = (p.nom ?? '').trim().charAt(0).toUpperCase();
  return initiale ? `${p.prenom} ${initiale}.` : p.prenom;
}

/**
 * Met la ligne d'affiliation de CETTE inscription en accord avec son état.
 *
 *  - élève payé, code valide            → la ligne de 10 € existe ;
 *  - élève repassé en attente / annulé  → la ligne est retirée, SAUF si le
 *    virement au prof est déjà parti (`statut = 'paye'`) : on n'efface jamais
 *    un versement réel, on laisse la ligne et la page Paiements la montre.
 *
 * Silencieuse par construction : elle est appelée derrière un enregistrement
 * de paiement, et rater une ligne d'affiliation ne doit jamais faire échouer
 * l'encaissement lui-même. Le retour dit ce qui s'est passé, pour les journaux.
 */
export async function synchroniserAffiliation(
  inscriptionId: string,
): Promise<'creee' | 'retiree' | 'inchangee' | 'sans_code' | 'erreur'> {
  if (!inscriptionId) return 'sans_code';

  try {
    const db = crmAdmin();
    const { data: inscription, error } = await db
      .from('inscriptions')
      .select('id, nom, matiere, session_id, code_affiliation, paiement_statut, annulee_le')
      .eq('id', inscriptionId)
      .maybeSingle();

    if (error || !inscription) return 'erreur';

    const ins = inscription as {
      id: string;
      nom: string | null;
      matiere: string | null;
      session_id: string | null;
      code_affiliation: string | null;
      paiement_statut: string | null;
      annulee_le: string | null;
    };

    if (!normaliserCode(ins.code_affiliation)) return 'sans_code';

    const { data: existante } = await db
      .from('revenus_prof')
      .select('id, statut')
      .eq('type', 'affiliation')
      .eq('inscription_id', ins.id)
      .maybeSingle();

    const duAuProf = ins.paiement_statut === 'paye' && !ins.annulee_le;

    if (!duAuProf) {
      const ligne = existante as { id: string; statut: string } | null;
      // Un virement déjà effectué ne s'annule pas d'un clic sur « en attente ».
      if (!ligne || ligne.statut === 'paye') return 'inchangee';
      await db.from('revenus_prof').delete().eq('id', ligne.id);
      return 'retiree';
    }

    if (existante) return 'inchangee';

    const prof = await profParCode(ins.code_affiliation);
    if (!prof) return 'sans_code';

    const libelle = `Affiliation — ${ins.nom ?? 'élève'}${ins.matiere ? ` (${ins.matiere})` : ''}`;
    const { error: erreurInsert } = await db.from('revenus_prof').insert([
      {
        professeur_id: prof.id,
        type: 'affiliation',
        montant: MONTANT_AFFILIATION,
        session_id: ins.session_id,
        inscription_id: ins.id,
        libelle,
        statut: 'a_payer',
      },
    ]);

    // 23505 = l'index unique a fait son travail : la ligne existait déjà.
    if (erreurInsert && (erreurInsert as { code?: string }).code !== '23505') {
      console.error('[affiliation] création impossible :', erreurInsert.message);
      return 'erreur';
    }
    return erreurInsert ? 'inchangee' : 'creee';
  } catch (e) {
    console.error('[affiliation] synchronisation impossible :', e);
    return 'erreur';
  }
}
