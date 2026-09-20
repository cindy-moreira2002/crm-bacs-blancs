/**
 * La veille — ce qui décide d'allumer un téléphone.
 *
 * ⚠️ SERVEUR UNIQUEMENT. Appelée par le cron des e-mails (toutes les 5 min).
 *
 * Pourquoi ce fichier plutôt qu'un `notifier()` semé dans dix endroits du
 * code : une notification ne doit pas dépendre du chemin par lequel une
 * inscription est arrivée (formulaire, console, reprise manuelle, rattrapage
 * du planificateur). On compare donc l'état du site à l'état de la dernière
 * visite, et on ne notifie que sur la DIFFÉRENCE, en un seul endroit.
 *
 * Deux conséquences voulues :
 *  - **on ne prévient jamais deux fois pour la même chose** : le repère est
 *    stocké en base (`direction_veille`), pas en mémoire — un redémarrage de
 *    la fonction serverless ne renvoie pas les notifications de la veille ;
 *  - **on ne prévient que si ça MONTE**. Valider trois e-mails fait tomber le
 *    compteur : c'est une bonne nouvelle, elle n'a pas besoin de sonner.
 *
 * Silence de nuit : rien ne part entre 22 h et 7 h (heure de Paris). Le repère
 * est quand même avancé — au matin, on est prévenue de ce qui reste à faire,
 * pas de chaque message arrivé pendant la nuit.
 */
import { crmAdmin } from '@/lib/authProf';
import { chargerCompteurs, type CompteursDirection } from '@/lib/direction/compteurs';
import { notifierDirection } from '@/lib/direction/push';

const TABLE = 'direction_veille';
const CLE = 'compteurs';

const HEURE_REVEIL = 7;
const HEURE_COUCHER = 22;

/** L'heure qu'il est à Paris, quelle que soit l'heure du serveur (UTC). */
function heureParis(maintenant = new Date()): number {
  const h = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    hour12: false,
  }).format(maintenant);
  return Number(h);
}

export function heureSilencieuse(maintenant = new Date()): boolean {
  const h = heureParis(maintenant);
  return h < HEURE_REVEIL || h >= HEURE_COUCHER;
}

type Repere = Partial<CompteursDirection>;

async function lireRepere(): Promise<Repere> {
  try {
    const { data, error } = await crmAdmin()
      .from(TABLE)
      .select('valeur')
      .eq('cle', CLE)
      .maybeSingle();
    if (error) throw error;
    return (data?.valeur as Repere) ?? {};
  } catch {
    return {};
  }
}

async function ecrireRepere(valeur: CompteursDirection): Promise<void> {
  try {
    await crmAdmin()
      .from(TABLE)
      .upsert({ cle: CLE, valeur, mis_a_jour_le: new Date().toISOString() }, { onConflict: 'cle' });
  } catch (err) {
    console.error('⚠️ veille : repère non enregistré', err);
  }
}

const pluriel = (n: number, singulier: string, plur: string) =>
  `${n} ${n > 1 ? plur : singulier}`;

export type RapportVeille = {
  compteurs: CompteursDirection;
  notifications: string[];
  silence: boolean;
};

/**
 * Compare, notifie, puis pose le nouveau repère.
 *
 * Ne lève jamais : le cron des e-mails doit continuer son travail même si les
 * notifications sont en panne.
 */
export async function veiller(): Promise<RapportVeille> {
  const compteurs = await chargerCompteurs();
  const avant = await lireRepere();
  const notifications: string[] = [];
  const silence = heureSilencieuse();

  // Premier passage (aucun repère) : on enregistre l'état sans rien envoyer.
  // Sinon la toute première exécution notifierait tout l'historique du site.
  const premierPassage = Object.keys(avant).length === 0;

  // Seuls les compteurs (pas la date) se comparent : d'où le type restreint.
  type Chiffre = Exclude<keyof CompteursDirection, 'le'>;
  const monte = (cle: Chiffre) =>
    !premierPassage && compteurs[cle] > ((avant[cle] as number | undefined) ?? 0);

  if (monte('aValider')) {
    const n = compteurs.aValider;
    notifications.push(
      `${pluriel(n, 'e-mail attend', 'e-mails attendent')} ton feu vert`,
    );
    if (!silence) {
      await notifierDirection({
        titre: '📬 À valider',
        corps: `${pluriel(n, 'message est prêt', 'messages sont prêts')} à partir. Rien ne s’envoie sans toi.`,
        url: '/direction/a-valider',
        tag: 'emails-a-valider',
      });
    }
  }

  if (monte('paiementsEnAttente')) {
    notifications.push('nouvelle inscription à régler');
    if (!silence) {
      await notifierDirection({
        titre: '💶 Nouvelle inscription',
        corps: `${pluriel(compteurs.paiementsEnAttente, 'inscription attend', 'inscriptions attendent')} son règlement.`,
        url: '/direction/paiements',
        tag: 'paiements',
      });
    }
  }

  if (monte('correctionsBloquees')) {
    notifications.push('correction bloquée');
    if (!silence) {
      await notifierDirection({
        titre: '🎛️ Correction bloquée',
        corps: `${pluriel(compteurs.correctionsBloquees, 'copie est en échec', 'copies sont en échec')} dans le pipeline.`,
        url: '/direction/correction',
        tag: 'correction',
      });
    }
  }

  if (monte('dossiersARelire')) {
    notifications.push('dossier à relire');
    if (!silence) {
      await notifierDirection({
        titre: '📝 Dossier à relire',
        corps: `${pluriel(compteurs.dossiersARelire, 'copie corrigée attend', 'copies corrigées attendent')} une relecture humaine.`,
        url: '/direction/correction',
        tag: 'relecture',
      });
    }
  }

  // Le jour J, une main levée n'attend pas cinq minutes de plus : elle sonne
  // même hors des heures calmes, parce qu'un élève est devant sa copie.
  if (monte('mainsLevees')) {
    notifications.push('main levée pendant un bac blanc');
    await notifierDirection({
      titre: '✋ Un élève lève la main',
      corps: `${pluriel(compteurs.mainsLevees, 'élève attend', 'élèves attendent')} de l’aide.`,
      url: '/direction',
      tag: 'mains-levees',
    });
  }

  await ecrireRepere(compteurs);
  return { compteurs, notifications, silence };
}
