/**
 * Le compte à rebours des 48 heures du tarif de groupe.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Règle de Cindy, 20 septembre 2026 : le trio se fait à trois ou pas du tout.
 * Les trois inscriptions doivent être RÉGLÉES dans les 48 heures qui suivent
 * la première. Sinon, toutes sont annulées et les sommes versées sont rendues
 * en avoir.
 *
 * Cette passe est appelée par `synchroniserTout()`, donc toutes les 5 minutes
 * par pg_cron. Elle fait deux choses, dans cet ordre :
 *
 *  1. **Rappeler** l'initiateur quand il reste moins de 12 heures et que le
 *     compte n'y est pas — un code oublié dans une boîte mail, c'est une
 *     inscription annulée pour rien ;
 *  2. **Annuler** les trios dont l'heure est passée, et prévenir tout le
 *     monde.
 *
 * Comme partout ici, on MET EN FILE, on n'envoie pas : la validation manuelle
 * et le quota Brevo restent maîtres de ce qui part vraiment.
 */
import { crmAdmin } from '@/lib/authProf';
import { annulerTrio, triosEchus } from '@/lib/offres';
import { URL_ESPACE_ELEVE, URL_INSCRIPTION } from './config';
import { enfiler, type TacheEmail } from './file';

/** À partir de quand on rappelle l'initiateur, en heures avant l'échéance. */
const RAPPEL_HEURES_AVANT = 12;

type LigneTrio = {
  code: string;
  session_id: string | null;
  genere_par: string | null;
  expire_a: string | null;
  email_initiateur: string | null;
  nom_initiateur: string | null;
  inscrits: number;
  payes: number;
  delai_depasse: boolean;
  actif: boolean;
};

function prenom(nom: string | null | undefined): string {
  return String(nom ?? '').trim().split(/\s+/)[0] || 'toi';
}

/** « mardi 22 septembre à 14:30 » — lisible à voix haute. */
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
 * Une passe complète sur les trios.
 *
 * Renvoie ce qui a été fait, pour que la page Direction puisse l'afficher et
 * que les journaux disent quelque chose d'utile.
 */
export async function traiterTrios(maintenant = new Date()): Promise<{
  rappels: number;
  annules: number;
  messages: number;
}> {
  let rappels = 0;
  let annules = 0;
  let messages = 0;

  let trios: LigneTrio[] = [];
  try {
    const { data, error } = await crmAdmin()
      .from('v_trios')
      .select(
        'code, session_id, genere_par, expire_a, email_initiateur, nom_initiateur, inscrits, payes, delai_depasse, actif',
      )
      .eq('actif', true);
    if (error || !data) return { rappels, annules, messages };
    trios = data as LigneTrio[];
  } catch {
    // Vue absente (script 54 pas joué) : surtout ne rien annuler.
    return { rappels, annules, messages };
  }

  const taches: TacheEmail[] = [];

  for (const t of trios) {
    // --- Le trio est complet : plus rien à surveiller -------------------
    if (t.payes >= 3) continue;

    const echeance = t.expire_a ? new Date(t.expire_a).getTime() : 0;
    const restantMs = echeance - maintenant.getTime();

    // --- Il reste peu de temps : on rappelle l'initiateur ---------------
    if (restantMs > 0 && restantMs <= RAPPEL_HEURES_AVANT * 3_600_000 && t.email_initiateur) {
      taches.push({
        type: 'trio_rappel',
        categorie: 'transactional',
        destinataire_email: t.email_initiateur,
        destinataire_nom: t.nom_initiateur,
        destinataire_role: 'eleve',
        inscription_id: t.genere_par,
        session_id: t.session_id,
        // Un seul rappel par trio, quoi qu'il arrive : la clé ne porte ni
        // l'heure ni le nombre de manquants, sinon le message repartirait à
        // chaque passage du cron.
        cle_idempotence: `trio_rappel:${t.code}`,
        planifie_le: maintenant.toISOString(),
        variables: {
          first_name: prenom(t.nom_initiateur),
          trio_code: t.code,
          trio_deadline: quand(t.expire_a),
          trio_manquants: String(Math.max(0, 3 - t.payes)),
          student_space_url: URL_ESPACE_ELEVE,
        },
        declenche_par: 'trios',
      });
      rappels += 1;
    }
  }

  // --- L'heure est passée : le trio tombe -------------------------------
  //
  // On relit la liste des échus plutôt que de se fier au champ `delai_depasse`
  // calculé plus haut : entre les deux, quelqu'un a pu payer.
  for (const echu of await triosEchus()) {
    // Qui prévenir, et de combien ? On lit AVANT d'annuler : après,
    // `paiement_montant` est toujours là mais le statut ne dit plus rien.
    const { data } = await crmAdmin()
      .from('inscriptions')
      .select('id, nom, email, matiere, paiement_statut, paiement_montant, session_id')
      .eq('code_promo', echu.code);

    const membres = ((data ?? []) as {
      id: string;
      nom: string;
      email: string;
      matiere: string | null;
      paiement_statut: string | null;
      paiement_montant: number | null;
    }[]).filter((i) => i.paiement_statut !== 'annule');

    await annulerTrio(echu.code);
    annules += 1;

    for (const m of membres) {
      if (!m.email) continue;
      const rendu = m.paiement_statut === 'paye' ? Number(m.paiement_montant) || 0 : 0;
      taches.push({
        type: 'trio_expire',
        categorie: 'transactional',
        destinataire_email: m.email,
        destinataire_nom: m.nom,
        destinataire_role: 'eleve',
        inscription_id: m.id,
        session_id: echu.session_id,
        cle_idempotence: `trio_expire:${echu.code}:${m.id}`,
        planifie_le: maintenant.toISOString(),
        variables: {
          first_name: prenom(m.nom),
          trio_code: echu.code,
          subject_name: m.matiere ?? 'ta matière',
          inscription_url: URL_INSCRIPTION,
          ...(rendu > 0 ? { credit_amount: String(rendu) } : {}),
        },
        declenche_par: 'trios',
      });
    }
  }

  if (taches.length) messages = await enfiler(taches);
  return { rappels, annules, messages };
}

/**
 * Le premier du trio vient de s'inscrire : on lui envoie SON code par écrit.
 *
 * L'écran le lui a déjà montré, mais il doit pouvoir le retrouver pour le
 * transférer. Un code vu une fois puis perdu, c'est un trio qui tombe.
 */
export async function apresTrioCree(
  inscription: { id: string; email: string; nom: string; matiere: string | null; session_id: string | null },
  trio: { code: string; expire_a: string },
): Promise<number> {
  return enfiler([
    {
      type: 'trio_code_partage',
      categorie: 'transactional',
      destinataire_email: inscription.email,
      destinataire_nom: inscription.nom,
      destinataire_role: 'eleve',
      inscription_id: inscription.id,
      session_id: inscription.session_id,
      cle_idempotence: `trio_code:${trio.code}`,
      planifie_le: new Date().toISOString(),
      variables: {
        first_name: prenom(inscription.nom),
        trio_code: trio.code,
        trio_deadline: quand(trio.expire_a),
        subject_name: inscription.matiere ?? 'ta matière',
        student_space_url: URL_ESPACE_ELEVE,
      },
      declenche_par: 'trios',
    },
  ]);
}

/**
 * La famille vient d'acheter un pack : on lui écrit ce qu'il lui reste.
 *
 * Sans ce message, personne ne sait qu'il a deux matinées d'avance — et on
 * retrouve des packs payés jamais consommés.
 */
export async function apresPackAchete(
  inscription: { id: string; email: string; nom: string; session_id: string | null },
  pack: { libelle: string; total: number; restantes: number; expire_le: string },
): Promise<number> {
  return enfiler([
    {
      type: 'pack_achete',
      categorie: 'transactional',
      destinataire_email: inscription.email,
      destinataire_nom: inscription.nom,
      destinataire_role: 'eleve',
      inscription_id: inscription.id,
      session_id: inscription.session_id,
      cle_idempotence: `pack:${inscription.id}`,
      planifie_le: new Date().toISOString(),
      variables: {
        first_name: prenom(inscription.nom),
        pack_label: pack.libelle,
        pack_total: String(pack.total),
        pack_restantes: String(pack.restantes),
        pack_expire: new Date(pack.expire_le).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        inscription_url: URL_INSCRIPTION,
      },
      declenche_par: 'packs',
    },
  ]);
}
