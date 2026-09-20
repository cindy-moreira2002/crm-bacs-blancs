/**
 * Les messages des offres : l'avoir gagné, les codes d'ambassadeur, et le
 * pack qui va périmer.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Trois trous que ce fichier ferme, et qui coûtaient tous de l'argent à
 * quelqu'un :
 *
 *  1. **L'avoir muet.** Le parrain était crédité en base, personne ne le lui
 *     disait : il repayait plein tarif sans savoir qu'il avait 10 €.
 *  2. **L'ambassadeur promis.** Le site écrit « l'élève reçoit par email 3
 *     codes −10 € » après sa première matinée. Rien ne les fabriquait.
 *  3. **Le pack oublié.** Des matinées payées qui périment au bout d'un an
 *     sans avoir servi.
 *
 * Comme partout ici : on MET EN FILE, on n'envoie pas.
 */
import { crmAdmin } from '@/lib/authProf';
import { URL_ESPACE_ELEVE, URL_INSCRIPTION } from './config';
import { enfiler, type TacheEmail } from './file';

/** Combien de codes l'ambassadeur reçoit, et ce que chacun vaut. */
export const AMBASSADEUR_CODES = 3;
export const AMBASSADEUR_REMISE = 10;
/** Ce que l'ambassadeur gagne pour chaque ami inscrit. */
export const AMBASSADEUR_AVOIR = 5;
/** À combien de jours de l'échéance on prévient d'un pack non consommé. */
const PACK_ALERTE_JOURS = 45;

function prenom(nom: string | null | undefined): string {
  return String(nom ?? '').trim().split(/\s+/)[0] || 'toi';
}

function jourLisible(v: string): string {
  return new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Prévient l'élève qu'il vient de gagner un avoir.
 *
 * Appelé juste après la création de l'avoir, avec le total dont il dispose —
 * un message qui annonce « +10 € » sans dire « tu en as 25 au total » laisse
 * la famille faire l'addition elle-même, et se tromper.
 */
export async function apresAvoirCredite(
  beneficiaire: string,
  montant: number,
  filleul?: { nom?: string | null; inscription_id?: string | null },
): Promise<number> {
  const email = String(beneficiaire ?? '').trim().toLowerCase();
  if (!email || !(montant > 0)) return 0;

  try {
    const db = crmAdmin();
    // Le total disponible : c'est ce chiffre-là qui l'intéresse.
    const { data: avoirs } = await db
      .from('avoirs_eleve')
      .select('montant, email, expire_le')
      .is('consomme_par', null);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const total = ((avoirs ?? []) as { montant: number; email: string; expire_le: string | null }[])
      .filter((a) => a.email.trim().toLowerCase() === email)
      .filter((a) => !a.expire_le || a.expire_le >= aujourdhui)
      .reduce((s, a) => s + (Number(a.montant) || 0), 0);

    // Le prénom du bénéficiaire, pris sur une de ses inscriptions.
    const { data: lui } = await db
      .from('inscriptions')
      .select('nom, email')
      .ilike('email', email)
      .limit(1);
    const nom = ((lui ?? []) as { nom: string }[])[0]?.nom ?? null;

    return enfiler([
      {
        type: 'avoir_credite',
        categorie: 'transactional',
        destinataire_email: email,
        destinataire_nom: nom,
        destinataire_role: 'eleve',
        inscription_id: filleul?.inscription_id ?? null,
        // Un avoir par filleul : la clé porte l'inscription qui l'a déclenché,
        // sinon un deuxième parrainage ne produirait aucun message.
        cle_idempotence: `avoir:${email}:${filleul?.inscription_id ?? Date.now()}`,
        planifie_le: new Date().toISOString(),
        variables: {
          first_name: prenom(nom),
          credit_amount: String(montant),
          credit_total: String(total),
          inscription_url: URL_INSCRIPTION,
          ...(filleul?.nom ? { filleul_name: prenom(filleul.nom) } : {}),
        },
        declenche_par: 'promos',
      },
    ]);
  } catch (err) {
    console.error('⚠️ Message d’avoir non mis en file :', err);
    return 0;
  }
}

/** « LEA » + un suffixe court et lisible : LEAA7, LEAK2… */
function codeAmbassadeur(nom: string, rang: number): string {
  const base = String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 8);
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let suffixe = '';
  for (let i = 0; i < 3; i++) {
    suffixe += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${base || 'AMI'}${rang}${suffixe}`;
}

/**
 * Une passe sur les élèves qui viennent de passer leur première matinée :
 * on fabrique leurs trois codes et on les leur envoie.
 *
 * Condition : l'inscription est RÉGLÉE et sa date est passée. Offrir des codes
 * à quelqu'un qui n'a pas encore composé, ou qui n'a pas payé, reviendrait à
 * distribuer des réductions sans contrepartie.
 */
export async function traiterAmbassadeurs(maintenant = new Date()): Promise<{
  eleves: number;
  codes: number;
  messages: number;
}> {
  const db = crmAdmin();
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  let eleves = 0;
  let codes = 0;
  const taches: TacheEmail[] = [];

  try {
    const { data, error } = await db
      .from('inscriptions')
      .select('id, nom, email, date_epreuve, paiement_statut, session_id')
      .in('paiement_statut', ['paye', 'offert'])
      .lt('date_epreuve', aujourdhui)
      .limit(500);
    if (error || !data) return { eleves: 0, codes: 0, messages: 0 };

    // Une seule dotation par élève, jamais par inscription : un élève qui a
    // fait trois matinées ne reçoit pas neuf codes.
    const parEleve = new Map<string, { id: string; nom: string; email: string; session_id: string | null }>();
    for (const i of (data as {
      id: string;
      nom: string;
      email: string;
      session_id: string | null;
    }[])) {
      const cle = String(i.email ?? '').trim().toLowerCase();
      if (cle && !parEleve.has(cle)) parEleve.set(cle, i);
    }

    // Qui en a déjà ? Une seule requête pour tout le monde.
    const { data: dejaDotes } = await db
      .from('codes_promo')
      .select('proprietaire_email')
      .eq('categorie', 'ambassadeur');
    const dotes = new Set(
      ((dejaDotes ?? []) as { proprietaire_email: string | null }[])
        .map((c) => String(c.proprietaire_email ?? '').trim().toLowerCase())
        .filter(Boolean),
    );

    for (const [email, eleve] of parEleve) {
      if (dotes.has(email)) continue;

      const mesCodes: string[] = [];
      for (let rang = 1; rang <= AMBASSADEUR_CODES; rang++) {
        const code = codeAmbassadeur(eleve.nom, rang);
        const { error: e } = await db.from('codes_promo').insert([
          {
            code,
            libelle: `Code ambassadeur de ${prenom(eleve.nom)}`,
            type: 'remise',
            remise: AMBASSADEUR_REMISE,
            matinees_incluses: 1,
            usages_par_eleve: 1,
            usages_max: 1,
            avoir_pour_proprietaire: AMBASSADEUR_AVOIR,
            proprietaire_email: email,
            categorie: 'ambassadeur',
            actif: true,
            note: 'Créé automatiquement après la première matinée.',
          },
        ]);
        if (!e) {
          mesCodes.push(code);
          codes += 1;
        }
      }

      if (mesCodes.length === AMBASSADEUR_CODES) {
        eleves += 1;
        taches.push({
          type: 'ambassadeur_codes',
          categorie: 'transactional',
          destinataire_email: email,
          destinataire_nom: eleve.nom,
          destinataire_role: 'eleve',
          inscription_id: eleve.id,
          session_id: eleve.session_id,
          cle_idempotence: `ambassadeur:${email}`,
          planifie_le: maintenant.toISOString(),
          variables: {
            first_name: prenom(eleve.nom),
            code_1: mesCodes[0],
            code_2: mesCodes[1],
            code_3: mesCodes[2],
            student_space_url: URL_ESPACE_ELEVE,
          },
          declenche_par: 'promos',
        });
      }
    }
  } catch (err) {
    console.error('⚠️ Dotation ambassadeur impossible :', err);
    return { eleves, codes, messages: 0 };
  }

  const messages = taches.length ? await enfiler(taches) : 0;
  return { eleves, codes, messages };
}

/**
 * Les packs qui expirent bientôt avec des matinées non consommées.
 *
 * Un seul message par pack (la clé d'idempotence le tient), envoyé à 45 jours
 * de l'échéance : assez tôt pour qu'une date reste disponible.
 */
export async function traiterPacksQuiExpirent(maintenant = new Date()): Promise<number> {
  try {
    const { data, error } = await crmAdmin()
      .from('v_packs_eleve')
      .select('id, email, nom, code, libelle, matinees_restantes, expire_le, paiement_statut')
      .gt('matinees_restantes', 0)
      .eq('paiement_statut', 'paye');
    if (error || !data) return 0;

    const limite = new Date(maintenant.getTime() + PACK_ALERTE_JOURS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const aujourdhui = maintenant.toISOString().slice(0, 10);

    const taches: TacheEmail[] = (data as {
      id: string;
      email: string;
      nom: string | null;
      libelle: string | null;
      code: string;
      matinees_restantes: number;
      expire_le: string;
    }[])
      .filter((p) => p.expire_le <= limite && p.expire_le >= aujourdhui)
      .map((p) => ({
        type: 'pack_bientot_expire' as const,
        categorie: 'transactional' as const,
        destinataire_email: p.email,
        destinataire_nom: p.nom,
        destinataire_role: 'eleve' as const,
        cle_idempotence: `pack_expire:${p.id}`,
        planifie_le: maintenant.toISOString(),
        variables: {
          first_name: prenom(p.nom),
          pack_label: p.libelle ?? p.code,
          pack_restantes: String(p.matinees_restantes),
          pack_expire: jourLisible(p.expire_le),
          inscription_url: URL_INSCRIPTION,
        },
        declenche_par: 'promos',
      }));

    return taches.length ? await enfiler(taches) : 0;
  } catch (err) {
    console.error('⚠️ Alerte packs impossible :', err);
    return 0;
  }
}
