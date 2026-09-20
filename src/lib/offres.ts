/**
 * Ce qui se passe APRÈS une inscription : le pack qu'on ouvre, le code de
 * groupe qu'on fabrique, et le trio qu'on annule quand le compte n'y est pas.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du CRM).
 *
 * Séparé de `codesPromo.ts` volontairement : là-bas on CALCULE un prix sans
 * rien écrire ; ici on écrit. Une erreur de prix se corrige, une écriture
 * fautive laisse de l'argent au mauvais endroit.
 *
 * Les deux règles de Cindy, 20 septembre 2026 :
 *
 *  - **Pack** : la famille paie les 3 matinées en une fois et n'en réserve
 *    qu'une. Les autres attendent dans `packs_eleve`, et l'espace élève lui
 *    dit combien il lui en reste.
 *  - **Trio** : le premier reçoit SON code (« LEA39 »), bon pour deux
 *    camarades et 48 heures. Si les trois ne sont pas réglés à l'heure dite,
 *    **tout le trio tombe** : les inscriptions sont annulées et ce qui avait
 *    été versé devient un avoir.
 */
import { crmAdmin } from '@/lib/authProf';
import { lireCodePromo, normaliserPromo } from '@/lib/codesPromo';

/** Combien d'heures le trio a pour se compléter. */
export const HEURES_TRIO = 48;

/**
 * Ouvre un pack prépayé au nom de l'élève et rattache l'inscription qui vient
 * d'en consommer la première matinée.
 *
 * Le pack naît `en_attente` : il ne donne droit à rien tant que le virement
 * n'est pas encaissé. C'est /direction/paiements qui le passe à `paye`, en
 * même temps que l'inscription.
 */
export async function ouvrirPack(
  eleve: { email: string; nom: string },
  pack: { code: string; matinees: number; prix: number },
  inscriptionId: string,
): Promise<string | null> {
  try {
    const { data, error } = await crmAdmin()
      .from('packs_eleve')
      .insert([
        {
          email: eleve.email,
          nom: eleve.nom,
          code: pack.code,
          matinees_total: pack.matinees,
          prix_paye: pack.prix,
          paiement_statut: 'en_attente',
          inscription_origine: inscriptionId,
        },
      ])
      .select('id')
      .single();
    if (error || !data) {
      console.error('⚠️ Pack non créé :', error?.message);
      return null;
    }

    const packId = (data as { id: string }).id;
    // La matinée d'aujourd'hui est la première du pack : on la rattache, sinon
    // la famille aurait payé 3 matinées et en verrait 3 encore disponibles.
    await crmAdmin().from('inscriptions').update({ pack_id: packId }).eq('id', inscriptionId);
    return packId;
  } catch (err) {
    console.error('⚠️ Pack non créé :', err);
    return null;
  }
}

/**
 * « Léa Martin » → « LEA39 ». Un code qu'on peut dicter au téléphone.
 * Si le code est déjà pris (deux Léa le même mois), on suffixe : LEA39B, LEA39C.
 */
async function codeLibre(prenom: string, suffixe: string): Promise<string> {
  const base = normaliserPromo(
    String(prenom ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 12),
  );
  const racine = (base || 'TRIO') + suffixe;

  const db = crmAdmin();
  for (const lettre of ['', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    const essai = racine + lettre;
    const { data } = await db.from('codes_promo').select('code').eq('code', essai).maybeSingle();
    if (!data) return essai;
  }
  return racine + Date.now().toString().slice(-3);
}

/**
 * Fabrique le code de groupe du premier inscrit, à partir du gabarit TRIO39.
 *
 * Le code hérite du prix du gabarit (39 €), ne vaut que pour SA matinée, et
 * meurt dans 48 heures. `usages_max = 3` compte l'initiateur : deux camarades
 * après lui, et le troisième lit « Code promo expiré ».
 */
export async function genererCodeTrio(
  gabarit: string,
  inscription: { id: string; nom: string; session_id: string | null },
): Promise<{ code: string; expire_a: string } | null> {
  try {
    const modele = await lireCodePromo(gabarit);
    if (!modele) return null;

    const prenom = String(inscription.nom ?? '').trim().split(/\s+/)[0] ?? '';
    // Le suffixe reprend le nombre de participants : TRIO39 → « 39 ».
    const suffixe = (modele.prix_unitaire ?? 39).toString().replace(/\D/g, '') || '39';
    const code = await codeLibre(prenom, suffixe);
    const expireA = new Date(Date.now() + HEURES_TRIO * 3_600_000).toISOString();

    const { error } = await crmAdmin()
      .from('codes_promo')
      .insert([
        {
          code,
          libelle: `Trio de ${prenom || 'l’élève'}`,
          type: 'prix_fixe',
          prix_unitaire: modele.prix_unitaire,
          matinees_incluses: 1,
          min_participants: modele.min_participants,
          meme_session: true,
          usages_par_eleve: 1,
          usages_max: modele.min_participants, // 3 : l'initiateur + 2 camarades
          categorie: 'groupe',
          actif: true,
          session_id: inscription.session_id,
          genere_par: inscription.id,
          expire_a: expireA,
          modele: modele.code,
          note: `Créé automatiquement à l’inscription. Valable ${HEURES_TRIO} h.`,
        },
      ]);
    if (error) {
      console.error('⚠️ Code de trio non créé :', error.message);
      return null;
    }

    // L'initiateur porte SON code, pas le gabarit : sinon il ne serait pas
    // compté dans son propre trio et on attendrait un quatrième participant.
    await crmAdmin().from('inscriptions').update({ code_promo: code }).eq('id', inscription.id);

    return { code, expire_a: expireA };
  } catch (err) {
    console.error('⚠️ Code de trio non créé :', err);
    return null;
  }
}

export type TrioEchu = {
  code: string;
  email_initiateur: string | null;
  nom_initiateur: string | null;
  inscrits: number;
  payes: number;
  session_id: string | null;
};

/**
 * Les trios dont les 48 heures sont écoulées sans que les trois aient réglé.
 *
 * On lit la vue `v_trios` (script 54) : elle compte les inscriptions et les
 * paiements par code. Rien n'est décidé ici — la fonction rend la liste, le
 * planificateur annule et écrit les e-mails.
 */
export async function triosEchus(): Promise<TrioEchu[]> {
  try {
    const { data, error } = await crmAdmin()
      .from('v_trios')
      .select('code, email_initiateur, nom_initiateur, inscrits, payes, session_id, delai_depasse, actif')
      .eq('actif', true)
      .eq('delai_depasse', true);
    if (error || !data) return [];

    return (data as (TrioEchu & { payes: number; inscrits: number })[]).filter(
      (t) => t.payes < 3,
    );
  } catch {
    // Vue absente (script 54 pas joué) : rien à faire, surtout pas d'annulation.
    return [];
  }
}

/**
 * Le trio n'a pas tenu : tout tombe.
 *
 * Décision de Cindy — « le trio se fait à trois ou pas du tout ». On annule
 * TOUTES les inscriptions du code, et ce qui avait déjà été encaissé devient
 * un avoir : personne ne perd d'argent, mais personne ne garde le tarif de
 * groupe à deux.
 *
 * Renvoie les adresses à prévenir, pour que l'appelant mette les e-mails en
 * file (cette fonction n'envoie rien).
 */
export async function annulerTrio(code: string): Promise<string[]> {
  const db = crmAdmin();
  const prevenir: string[] = [];

  try {
    const { data } = await db
      .from('inscriptions')
      .select('id, nom, email, paiement_statut, paiement_montant')
      .eq('code_promo', code);

    for (const i of ((data ?? []) as {
      id: string;
      nom: string;
      email: string;
      paiement_statut: string | null;
      paiement_montant: number | null;
    }[])) {
      if (i.paiement_statut === 'annule') continue;

      // Ce qui a été versé revient à l'élève, sous forme d'avoir : on ne
      // garde pas l'argent d'une offre qu'on n'a pas honorée.
      const verse = Number(i.paiement_montant) || 0;
      if (i.paiement_statut === 'paye' && verse > 0) {
        await db.from('avoirs_eleve').insert([
          {
            email: i.email,
            montant: verse,
            origine: 'remboursement',
            declenche_par: i.id,
            code,
            expire_le: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
            note: 'Trio incomplet au bout de 48 h : la somme versée est rendue en avoir.',
          },
        ]);
      }

      await db
        .from('inscriptions')
        .update({ paiement_statut: 'annule', annulee_le: new Date().toISOString() })
        .eq('id', i.id);

      if (i.email) prevenir.push(i.email);
    }

    // Le code ne doit plus servir, même si quelqu'un l'a noté quelque part.
    await db.from('codes_promo').update({ actif: false, updated_at: new Date().toISOString() }).eq('code', code);
  } catch (err) {
    console.error('⚠️ Annulation du trio impossible :', err);
  }

  return prevenir;
}
