/**
 * Les tarifs — ce que paie vraiment une famille.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role du CRM).
 *
 * Source de vérité : la page « Les Tarifs » de matineesdubac.fr, transcrite
 * dans `codes_promo` par le script SQL 53. Ce fichier ne réinvente aucune
 * règle — il applique celles qui sont écrites en base, et tranche quand
 * plusieurs pourraient s'appliquer.
 *
 * Les quatre règles du site, dans l'ordre où elles comptent :
 *
 *  1. **La première matinée est à 49 €**, pour tout nouvel élève, SANS code.
 *     « Que vous veniez par vous-même ou avec le lien de votre professeur. »
 *     Un code de prof ne remise donc rien : il sert à payer l'affiliation.
 *  2. **Une seule réduction à la fois** : on garde toujours la plus
 *     avantageuse pour la famille. Jamais deux.
 *  3. **Un avoir n'est pas une réduction** : c'est de l'argent déjà dû à
 *     l'élève (parrainage, ambassadeur). Il se déduit APRÈS la réduction,
 *     comme un bon d'achat.
 *  4. **Un code inconnu est refusé** à l'écran. Avant, il était ignoré en
 *     silence et la famille croyait avoir une remise qu'elle n'avait pas.
 */
import { crmAdmin } from '@/lib/authProf';
import { chargerReglages } from '@/lib/emails/reglages';

export type TypeCode = 'prix_fixe' | 'remise' | 'lot' | 'affiliation';

export type CodePromo = {
  code: string;
  libelle: string;
  type: TypeCode;
  prix_unitaire: number | null;
  remise: number | null;
  matinees_incluses: number;
  prix_lot: number | null;
  min_participants: number;
  meme_session: boolean;
  premiere_matinee: boolean;
  usages_par_eleve: number;
  usages_max: number | null;
  avoir_pour_proprietaire: number;
  proprietaire_email: string | null;
  professeur_id: string | null;
  categorie: 'public' | 'prof' | 'ambassadeur' | 'groupe';
  actif: boolean;
  valide_du: string | null;
  valide_au: string | null;
  /** Codes de groupe : la matinée à laquelle le code est attaché. */
  session_id?: string | null;
  /** Codes de groupe : l'inscription qui a fait naître le code. */
  genere_par?: string | null;
  /** Codes de groupe : l'heure limite (48 h après la première inscription). */
  expire_a?: string | null;
  /** Le code modèle dont celui-ci est une déclinaison (« TRIO39 »). */
  modele?: string | null;
};

/** Ce qu'il reste à consommer sur un pack prépayé. */
export type PackEnCours = {
  id: string;
  code: string;
  libelle: string | null;
  matinees_total: number;
  matinees_restantes: number;
  expire_le: string;
  paiement_statut: string;
};

const CHAMPS_CODE =
  'code, libelle, type, prix_unitaire, remise, matinees_incluses, prix_lot, ' +
  'min_participants, meme_session, premiere_matinee, usages_par_eleve, usages_max, ' +
  'avoir_pour_proprietaire, proprietaire_email, professeur_id, categorie, actif, ' +
  'valide_du, valide_au, session_id, genere_par, expire_a, modele';

/** Le détail du prix, tel qu'il s'affiche à la famille et s'écrit en base. */
export type Tarif = {
  /** Le tarif public affiché barré (59 €). */
  prix_public: number;
  /** Ce qui a été retiré, et au titre de quoi. */
  remise: number;
  motif: string | null;
  /** Le code retenu, s'il y en a un. */
  code: string | null;
  /** Avoir de l'élève consommé sur cette inscription. */
  avoir_utilise: number;
  /** Ce que la famille doit vraiment virer. */
  prix_du: number;
  /** Ce que le code rapporte à quelqu'un d'autre (le parrain). */
  avoir_a_crediter: number;
  /** Le pack prépayé dont cette matinée est décomptée, s'il y en a un. */
  pack_id: string | null;
  /** Le pack que cette inscription achète (DUO89, FIDELITE3, FIDELITE5). */
  pack_a_creer: { code: string; matinees: number; prix: number } | null;
  /** Le premier du trio : il faut lui fabriquer son code à partager. */
  trio_a_generer: boolean;
  /** `refus` bloque l'inscription ; les autres la laissent passer. */
  etat:
    | 'plein_tarif'
    | 'premiere_matinee'
    | 'code_applique'
    | 'code_sans_effet'
    | 'pack'
    | 'lot_achete'
    | 'refus';
  /** Message à montrer, quand il y a quelque chose à dire. */
  message: string | null;
};

export function normaliserPromo(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 40);
}

/** Alias historique : le formulaire et l'affiliation partagent la même forme. */
export const normaliserCodePromo = normaliserPromo;

function nomComparable(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** La remise de bienvenue, en euros. 59 € → 49 € : c'est ce qu'annonce le site. */
export const REMISE_PREMIERE_MATINEE = 10;

/** Le tarif public, lu dans les réglages (jamais écrit en dur ici). */
export async function prixPublic(): Promise<number> {
  const r = await chargerReglages();
  const n = Number(r.paiement_montant_defaut);
  return Number.isFinite(n) && n > 0 ? n : 59;
}

/**
 * Le code du répertoire, ou `null` s'il n'existe pas, est désactivé, ou est
 * hors de sa fenêtre de validité. Un code hors période est traité comme un
 * code inexistant : la famille n'a pas à apprendre qu'il a existé.
 */
export async function lireCodePromo(saisi: unknown): Promise<CodePromo | null> {
  const code = normaliserPromo(saisi);
  if (code.length < 4) return null;

  try {
    const db = crmAdmin();
    let reponse = await db.from('codes_promo').select(CHAMPS_CODE).eq('code', code).maybeSingle();
    // Repli tant que le script 54 n'est pas passé : les codes publics
    // continuent de marcher, seuls les codes de groupe n'existent pas encore.
    if (reponse.error && /(session_id|genere_par|expire_a|modele)/.test(reponse.error.message ?? '')) {
      reponse = await db
        .from('codes_promo')
        .select(CHAMPS_CODE.replace(', session_id, genere_par, expire_a, modele', ''))
        .eq('code', code)
        .maybeSingle();
    }
    if (reponse.error || !reponse.data) return null;

    const ligne = reponse.data as unknown as CodePromo;
    if (!ligne.actif) return null;

    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (ligne.valide_du && aujourdhui < ligne.valide_du) return null;
    if (ligne.valide_au && aujourdhui > ligne.valide_au) return null;
    // Un code de groupe meurt à l'heure dite : 48 h après la première
    // inscription. Passé ce délai il n'existe plus, pour personne.
    if (ligne.expire_a && new Date(ligne.expire_a).getTime() < Date.now()) return null;

    return ligne;
  } catch (err) {
    // Répertoire illisible (script 53 pas encore joué, panne réseau) : on ne
    // bloque pas une inscription pour ça, elle passe au tarif plein.
    console.error('[tarifs] répertoire des codes illisible :', err);
    return null;
  }
}

/**
 * Cet élève a-t-il déjà passé — ou réservé — une matinée ?
 *
 * Le repérage se fait sur deux clés, parce qu'aucune ne suffit seule :
 *  - l'adresse de l'élève, la plus fiable, mais on peut en créer une autre ;
 *  - nom + adresse du parent, qui identifie le foyer tout en laissant à
 *    chaque enfant d'une fratrie sa propre première matinée.
 *
 * Une inscription annulée ne compte pas : la place a été rendue, la
 * bienvenue aussi.
 */
export async function dejaInscrit(
  emailEleve: string,
  nomEleve: string,
  emailParent: string | null,
): Promise<number> {
  const email = String(emailEleve ?? '').trim().toLowerCase();
  const parent = String(emailParent ?? '').trim().toLowerCase();
  const nom = nomComparable(nomEleve);

  try {
    const { data, error } = await crmAdmin()
      .from('inscriptions')
      .select('nom, email, email_parent, paiement_statut')
      .limit(1000);
    if (error || !data) return 0;

    return (data as {
      nom: string | null;
      email: string | null;
      email_parent: string | null;
      paiement_statut: string | null;
    }[]).filter((i) => {
      if (i.paiement_statut === 'annule') return false;
      const memeEmail = email !== '' && (i.email ?? '').trim().toLowerCase() === email;
      const memeFoyer =
        parent !== '' &&
        nom !== '' &&
        (i.email_parent ?? '').trim().toLowerCase() === parent &&
        nomComparable(i.nom) === nom;
      return memeEmail || memeFoyer;
    }).length;
  } catch (err) {
    console.error('[tarifs] comptage des inscriptions impossible :', err);
    return 0;
  }
}

/** Les avoirs non consommés et non périmés de cet élève, en euros. */
export async function avoirsDisponibles(email: string): Promise<number> {
  const cible = String(email ?? '').trim().toLowerCase();
  if (!cible) return 0;

  try {
    const { data, error } = await crmAdmin()
      .from('avoirs_eleve')
      .select('montant, expire_le, email')
      .is('consomme_par', null);
    if (error || !data) return 0;

    const aujourdhui = new Date().toISOString().slice(0, 10);
    return (data as { montant: number; expire_le: string | null; email: string }[])
      .filter((a) => a.email.trim().toLowerCase() === cible)
      .filter((a) => !a.expire_le || a.expire_le >= aujourdhui)
      .reduce((s, a) => s + (Number(a.montant) || 0), 0);
  } catch (err) {
    console.error('[tarifs] lecture des avoirs impossible :', err);
    return 0;
  }
}

function arrondi(v: number): number {
  return Math.max(0, Math.round(v * 100) / 100);
}

/**
 * Le pack prépayé encore utilisable de cet élève, s'il en a un.
 *
 * Un pack payé donne droit à des matinées déjà réglées : l'inscription
 * suivante ne coûte rien, on décompte simplement une séance. Un pack en
 * attente de paiement ne donne rien — sinon il suffirait de cliquer sur
 * « FIDELITE5 » pour avoir cinq matinées gratuites.
 */
export async function packEnCours(email: string): Promise<PackEnCours | null> {
  const cible = String(email ?? '').trim().toLowerCase();
  if (!cible) return null;

  try {
    const { data, error } = await crmAdmin()
      .from('v_packs_eleve')
      .select('id, code, libelle, matinees_total, matinees_restantes, expire_le, paiement_statut, email')
      .gt('matinees_restantes', 0);
    if (error || !data) return null;

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const miens = (data as (PackEnCours & { email: string })[])
      .filter((p) => p.email.trim().toLowerCase() === cible)
      .filter((p) => p.paiement_statut === 'paye')
      .filter((p) => p.expire_le >= aujourdhui);

    // Le plus ancien d'abord : on consomme ce qui périme le plus tôt.
    miens.sort((a, b) => a.expire_le.localeCompare(b.expire_le));
    return miens[0] ?? null;
  } catch {
    // Vue absente (script 54 pas encore joué) : aucun pack, tarif normal.
    return null;
  }
}

/**
 * Combien de fois ce code de groupe a déjà été utilisé.
 * L'inscription qui l'a fait naître compte : un trio, c'est trois personnes
 * en tout, donc deux camarades après l'initiateur.
 */
export async function usagesDuCode(code: string): Promise<number> {
  try {
    const { data, error } = await crmAdmin()
      .from('inscriptions')
      .select('id, paiement_statut')
      .eq('code_promo', code);
    if (error || !data) return 0;
    return (data as { paiement_statut: string | null }[]).filter(
      (i) => i.paiement_statut !== 'annule',
    ).length;
  } catch {
    return 0;
  }
}

/**
 * Le prix de CETTE inscription.
 *
 * On liste les prix possibles, on garde le plus bas — c'est la règle du site,
 * « une seule réduction à la fois, toujours la plus avantageuse » — puis on
 * déduit l'avoir de l'élève, qui n'est pas une réduction mais de l'argent
 * qu'on lui doit déjà.
 */
export async function calculerTarif(eleve: {
  email: string;
  nom: string;
  emailParent: string | null;
  code?: unknown;
  /** La matinée visée — un code de groupe ne vaut que pour la sienne. */
  sessionId?: string | null;
}): Promise<Tarif> {
  const plein = await prixPublic();
  const codeSaisi = normaliserPromo(eleve.code);

  const [passees, avoir, pack] = await Promise.all([
    dejaInscrit(eleve.email, eleve.nom, eleve.emailParent),
    avoirsDisponibles(eleve.email),
    packEnCours(eleve.email),
  ]);
  const premiereFois = passees === 0;

  // Un pack déjà payé passe avant tout : la matinée est réglée d'avance,
  // il n'y a rien à encaisser et aucune réduction à chercher.
  if (pack && !codeSaisi) {
    return {
      prix_public: plein,
      remise: plein,
      motif: `${pack.libelle ?? pack.code} — matinée déjà payée`,
      code: pack.code,
      avoir_utilise: 0,
      prix_du: 0,
      avoir_a_crediter: 0,
      pack_id: pack.id,
      pack_a_creer: null,
      trio_a_generer: false,
      etat: 'pack',
      message: `Il te restera ${pack.matinees_restantes - 1} matinée(s) sur ton pack après celle-ci.`,
    };
  }

  // Candidat 1 : la bienvenue. Automatique, sans code, pour tout nouvel élève.
  let meilleur = premiereFois ? arrondi(plein - REMISE_PREMIERE_MATINEE) : plein;
  let motif: string | null = premiereFois ? 'Première matinée' : null;
  let etat: Tarif['etat'] = premiereFois ? 'premiere_matinee' : 'plein_tarif';
  let codeRetenu: string | null = null;
  let avoirACrediter = 0;
  let message: string | null = null;
  let packACreer: Tarif['pack_a_creer'] = null;
  let trioAGenerer = false;

  if (codeSaisi) {
    const promo = await lireCodePromo(codeSaisi);

    if (!promo) {
      return refus(plein, codeSaisi,
        'Ce code n\u2019existe pas, n\u2019est plus valable ou a expiré. Vérifie-le, ou laisse le champ vide.');
    }

    // --- Un lot : DUO89, FIDELITE3, FIDELITE5 -------------------------
    // La famille paie le pack entier maintenant et s'inscrit à UNE matinée.
    // Les autres restent en réserve, à poser quand elle voudra.
    if (promo.type === 'lot') {
      const prixLot = Number(promo.prix_lot) || 0;
      return {
        prix_public: plein,
        remise: 0,
        motif: promo.libelle,
        code: promo.code,
        avoir_utilise: 0,
        prix_du: prixLot,
        avoir_a_crediter: 0,
        pack_id: null,
        pack_a_creer: {
          code: promo.code,
          matinees: promo.matinees_incluses,
          prix: prixLot,
        },
        trio_a_generer: false,
        etat: 'lot_achete',
        message: `Tu règles ${prixLot} € pour ${promo.matinees_incluses} matinées. Celle-ci en consomme une : il t\u2019en restera ${promo.matinees_incluses - 1}, à réserver quand tu veux dans l\u2019année.`,
      };
    }

    // --- Un code de groupe déjà né : LEA39 ----------------------------
    if (promo.categorie === 'groupe') {
      if (promo.session_id && eleve.sessionId && promo.session_id !== eleve.sessionId) {
        return refus(plein, promo.code,
          'Ce code ne vaut que pour la matinée de la personne qui te l\u2019a donné. Choisis la même date et la même matière.');
      }
      const dejaUtilise = await usagesDuCode(promo.code);
      const maximum = promo.usages_max ?? 3;
      if (dejaUtilise >= maximum) {
        return refus(plein, promo.code,
          'Code promo expiré : le tarif de groupe est complet, vous êtes déjà trois.');
      }
      meilleur = arrondi(Number(promo.prix_unitaire) || plein);
      motif = promo.libelle;
      etat = 'code_applique';
      codeRetenu = promo.code;
      message = `Tarif de groupe. Les trois inscriptions doivent être réglées avant ${quand(promo.expire_a)}, sinon l\u2019offre tombe pour tout le monde.`;
    }

    // --- Le gabarit TRIO39 : c'est le premier qui se lance ------------
    else if (promo.usages_max === 0 && promo.min_participants > 1) {
      meilleur = arrondi(Number(promo.prix_unitaire) || plein);
      motif = promo.libelle;
      etat = 'code_applique';
      codeRetenu = promo.code;
      trioAGenerer = true;
      message =
        'Tu reçois ton code à partager : tes deux camarades ont 48 h pour s\u2019inscrire et régler. Passé ce délai, les inscriptions du trio sont annulées.';
    }

    // --- Un code de prof : ne remise rien -----------------------------
    else if (promo.type === 'affiliation') {
      codeRetenu = promo.code;
      if (!premiereFois) {
        message = 'Le code de ton professeur est bien pris en compte — il ne change pas le prix.';
        etat = 'code_sans_effet';
      }
    }

    // --- Un prix fixe ou une remise ordinaire -------------------------
    else {
      const reserveAuxNouveaux = promo.premiere_matinee && !premiereFois;
      if (reserveAuxNouveaux) {
        codeRetenu = promo.code;
        etat = 'code_sans_effet';
        message = `« ${promo.libelle} » est réservé à une première matinée. Le tarif appliqué est le meilleur auquel tu as droit.`;
      } else {
        // Le code est valablement utilisé : le parrain est dû, même si le
        // prix ne bouge pas. Avec PARRAIN10 le filleul paie 49 €, soit le
        // prix de bienvenue, et toute la valeur du code est justement les
        // 10 € qui reviennent à celui qui a parrainé.
        avoirACrediter = Number(promo.avoir_pour_proprietaire) || 0;

        const propose =
          promo.type === 'prix_fixe'
            ? Number(promo.prix_unitaire)
            : arrondi(plein - (Number(promo.remise) || 0));

        if (Number.isFinite(propose) && propose < meilleur) {
          meilleur = arrondi(propose);
          motif = promo.libelle;
          etat = 'code_applique';
          codeRetenu = promo.code;
        } else {
          codeRetenu = promo.code;
          etat = 'code_sans_effet';
          message =
            motif === 'Première matinée'
              ? 'Ta première matinée est déjà au meilleur prix : le code n\u2019ajoute rien.'
              : 'Ce code ne donne pas mieux que le tarif déjà appliqué.';
        }
      }
    }
  }

  const avoirUtilise = arrondi(Math.min(avoir, meilleur));
  return {
    prix_public: plein,
    remise: arrondi(plein - meilleur),
    motif,
    code: codeRetenu,
    avoir_utilise: avoirUtilise,
    prix_du: arrondi(meilleur - avoirUtilise),
    avoir_a_crediter: avoirACrediter,
    pack_id: null,
    pack_a_creer: packACreer,
    trio_a_generer: trioAGenerer,
    etat,
    message,
  };
}

/** Un refus : l'inscription ne part pas, la famille corrige son code. */
function refus(plein: number, code: string, message: string): Tarif {
  return {
    prix_public: plein,
    remise: 0,
    motif: null,
    code,
    avoir_utilise: 0,
    prix_du: plein,
    avoir_a_crediter: 0,
    pack_id: null,
    pack_a_creer: null,
    trio_a_generer: false,
    etat: 'refus',
    message,
  };
}

/** « mardi 22 à 14 h 30 » — une heure limite qu'on peut lire à voix haute. */
function quand(iso: string | null | undefined): string {
  if (!iso) return 'la fin du délai';
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Consomme les avoirs d'un élève au profit d'une inscription, du plus ancien
 * au plus récent. Appelé APRÈS l'insertion : tant que l'inscription n'existe
 * pas, il n'y a rien à quoi rattacher l'avoir.
 *
 * Jamais bloquant : un avoir non consommé reste disponible, ce qui est le bon
 * sens de l'erreur — on ne fait pas disparaître de l'argent dû.
 */
export async function consommerAvoirs(
  email: string,
  inscriptionId: string,
  montant: number,
): Promise<number> {
  if (!(montant > 0) || !inscriptionId) return 0;
  const cible = String(email ?? '').trim().toLowerCase();

  try {
    const db = crmAdmin();
    const { data } = await db
      .from('avoirs_eleve')
      .select('id, montant, email, expire_le')
      .is('consomme_par', null)
      .order('created_at', { ascending: true });

    const aujourdhui = new Date().toISOString().slice(0, 10);
    let reste = montant;
    let consomme = 0;

    for (const a of ((data ?? []) as { id: number; montant: number; email: string; expire_le: string | null }[])) {
      if (reste <= 0) break;
      if (a.email.trim().toLowerCase() !== cible) continue;
      if (a.expire_le && a.expire_le < aujourdhui) continue;

      await db
        .from('avoirs_eleve')
        .update({ consomme_par: inscriptionId, consomme_le: new Date().toISOString() })
        .eq('id', a.id);
      reste -= Number(a.montant) || 0;
      consomme += Number(a.montant) || 0;
    }
    return consomme;
  } catch (err) {
    console.error('[tarifs] consommation des avoirs impossible :', err);
    return 0;
  }
}

/**
 * Crédite le parrain quand son filleul s'inscrit avec son code.
 *
 * L'avoir n'existe que si le code désigne quelqu'un : les codes ambassadeur
 * portent l'adresse de leur propriétaire. PARRAIN10 est un code partagé — il
 * ne dit pas QUI a parrainé, donc il ne crédite personne tant que le filleul
 * n'a pas indiqué l'adresse de son parrain.
 */
export async function crediterParrain(
  code: string,
  inscriptionFilleul: string,
  montant: number,
  emailParrain?: string | null,
): Promise<boolean> {
  if (!(montant > 0)) return false;

  try {
    const db = crmAdmin();
    const promo = await lireCodePromo(code);
    const beneficiaire = (promo?.proprietaire_email ?? emailParrain ?? '').trim().toLowerCase();
    if (!beneficiaire) return false;

    const { error } = await db.from('avoirs_eleve').insert([
      {
        email: beneficiaire,
        montant,
        origine: promo?.categorie === 'ambassadeur' ? 'ambassadeur' : 'parrainage',
        declenche_par: inscriptionFilleul,
        code: promo?.code ?? null,
        // Un avoir de parrainage vit un an, comme les packs.
        expire_le: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      },
    ]);
    return !error;
  } catch (err) {
    console.error('[tarifs] crédit du parrain impossible :', err);
    return false;
  }
}

/** Le prix dû, jamais négatif. Gardé pour les appels existants. */
export function prixApresRemise(montantPlein: number, remise: number): number {
  return arrondi((Number(montantPlein) || 0) - (Number(remise) || 0));
}

/**
 * Qui touche l'avoir d'un code ? Le propriétaire déclaré du code (cas des
 * codes ambassadeur, nominatifs), sinon l'adresse saisie par le filleul (cas
 * de PARRAIN10, qui est un code partagé et ne désigne personne).
 *
 * `null` = personne n'est identifiable : on ne crédite pas au hasard.
 */
export async function beneficiaireAvoir(
  code: string,
  emailParrainSaisi: string | null,
): Promise<string | null> {
  const promo = await lireCodePromo(code);
  const candidat = (promo?.proprietaire_email ?? emailParrainSaisi ?? '').trim().toLowerCase();
  return candidat.includes('@') ? candidat : null;
}
