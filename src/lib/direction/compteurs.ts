/**
 * Les chiffres de la Direction, en cinq COUNT.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Ce module existe pour une raison précise : `chargerResumeDirection()` lit
 * des centaines de lignes dans deux bases pour construire la vue d'ensemble.
 * C'est parfait pour afficher un écran — impossible à répéter toutes les dix
 * secondes sur un téléphone sans faire exploser l'egress Supabase.
 *
 * Ici, on ne demande donc jamais de lignes : `head: true` + `count: 'exact'`
 * ne rapatrie qu'un nombre. C'est ce que lit le flux temps réel
 * (/api/direction/compteurs) et c'est ce qui décide d'envoyer une notification
 * (lib/direction/veille.ts).
 *
 * Robustesse : chaque bloc est isolé dans son `try`. Une base injoignable rend
 * son compteur à 0 — jamais une erreur qui viderait tout le tableau de bord.
 */
import { emailsDb } from '@/lib/emails/client';
import { chargerReglages, validationManuelle } from '@/lib/emails/reglages';
import { pipelineDb, pipelineManquant, STATUTS_ECHEC } from '@/lib/pipeline';

export type CompteursDirection = {
  /** Messages prêts à partir qui attendent le feu vert humain. */
  aValider: number;
  /** Copies en échec dans le pipeline de correction. */
  correctionsBloquees: number;
  /** Dossiers corrigés que le moteur a signalés pour relecture humaine. */
  dossiersARelire: number;
  /** Inscriptions non annulées dont le virement n'est pas arrivé. */
  paiementsEnAttente: number;
  /** Élèves qui ont levé la main pendant un bac blanc en cours. */
  mainsLevees: number;
  /** Instant du calcul (ISO) — sert à dater la dernière mise à jour à l'écran. */
  le: string;
};

export const COMPTEURS_VIDES: CompteursDirection = {
  aValider: 0,
  correctionsBloquees: 0,
  dossiersARelire: 0,
  paiementsEnAttente: 0,
  mainsLevees: 0,
  le: new Date(0).toISOString(),
};

/** Deux jeux de compteurs sont-ils identiques ? (la date ne compte pas) */
export function memesCompteurs(a: CompteursDirection, b: CompteursDirection): boolean {
  return (
    a.aValider === b.aValider &&
    a.correctionsBloquees === b.correctionsBloquees &&
    a.dossiersARelire === b.dossiersARelire &&
    a.paiementsEnAttente === b.paiementsEnAttente &&
    a.mainsLevees === b.mainsLevees
  );
}

async function compterAValider(): Promise<number> {
  try {
    const reglages = await chargerReglages();
    // Sans le mode « je relis avant que ça parte », rien n'attend personne :
    // les messages partent tout seuls, le compteur n'a pas de sens.
    if (!validationManuelle(reglages)) return 0;

    const { count, error } = await emailsDb()
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .in('statut', ['pending', 'scheduled'])
      .lte('planifie_le', new Date().toISOString());
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function compterCorrectionsBloquees(): Promise<number> {
  if (pipelineManquant().length) return 0;
  try {
    const { count, error } = await pipelineDb()
      .from('corrections')
      .select('id', { count: 'exact', head: true })
      .in('status', STATUTS_ECHEC);
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * `corrected_review` : le moteur a corrigé la copie ET signalé qu'un humain
 * doit la relire avant qu'elle parte. C'est la file de relecture, pas une
 * panne — d'où un compteur à part de `correctionsBloquees`.
 */
async function compterDossiersARelire(): Promise<number> {
  if (pipelineManquant().length) return 0;
  try {
    const { count, error } = await pipelineDb()
      .from('corrections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'corrected_review');
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function compterPaiementsEnAttente(): Promise<number> {
  try {
    const { count, error } = await emailsDb()
      .from('inscriptions')
      .select('id', { count: 'exact', head: true })
      .is('annulee_le', null)
      .eq('paiement_statut', 'en_attente');
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function compterMainsLevees(): Promise<number> {
  try {
    // Six heures : une main levée le mois dernier et jamais marquée traitée
    // n'est pas une urgence d'aujourd'hui. Un bac blanc dure une matinée.
    const depuis = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { count, error } = await emailsDb()
      .from('appels_aide')
      .select('id', { count: 'exact', head: true })
      .is('traite_le', null)
      .gte('created_at', depuis);
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Les cinq chiffres, en parallèle. Aucun ne peut faire tomber les autres. */
export async function chargerCompteurs(): Promise<CompteursDirection> {
  const [aValider, correctionsBloquees, dossiersARelire, paiementsEnAttente, mainsLevees] =
    await Promise.all([
      compterAValider(),
      compterCorrectionsBloquees(),
      compterDossiersARelire(),
      compterPaiementsEnAttente(),
      compterMainsLevees(),
    ]);
  return {
    aValider,
    correctionsBloquees,
    dossiersARelire,
    paiementsEnAttente,
    mainsLevees,
    le: new Date().toISOString(),
  };
}
