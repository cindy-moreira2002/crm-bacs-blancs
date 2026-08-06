/**
 * Gardes d'accès partagés — une seule définition de « qui a le droit ».
 *
 * ⚠️ SERVEUR UNIQUEMENT (lit les cookies de session).
 *
 * Pourquoi ce module : jusqu'ici chaque page /admin réimplémentait son propre
 * contrôle, et les pages internes (/crm, /ecoles-partenaires) n'en avaient
 * aucun — elles n'étaient « protégées » que parce que le proxy les cache sur le
 * domaine public. Une URL Vercel suffisait à tout lire. Le contrôle doit vivre
 * au même endroit que la donnée, pas dans le routage.
 *
 * Deux niveaux :
 *  - `admin`  : l'administratrice seule (CRM de prospection, consoles /admin) ;
 *  - `prof`   : tout professeur connecté (listes de copies, inscriptions).
 *
 * Tout échoue en refus : si les variables d'environnement manquent, personne
 * n'entre. Mieux vaut une page cassée qu'une base ouverte.
 */
import { NextResponse } from 'next/server';
import { authManquant, profConnecte, type Professeur } from '@/lib/authProf';

/** Ce que voit une page serveur. Le `redirect` reste à la charge de la page. */
export type Garde =
  | { etat: 'ok'; prof: Professeur }
  | { etat: 'config'; manquants: string[] }
  | { etat: 'anonyme' }
  | { etat: 'refuse' };

async function garde(niveau: 'admin' | 'prof'): Promise<Garde> {
  const manquants = authManquant();
  if (manquants.length) return { etat: 'config', manquants };

  const prof = await profConnecte();
  if (!prof) return { etat: 'anonyme' };

  // Un compte suspendu n'ouvre plus rien, même avec un cookie encore valide.
  // Volontairement `=== 'suspendu'` et non `!== 'actif'` : une colonne vide ou
  // absente ne doit pas enfermer dehors un compte légitime — seule une
  // suspension explicite ferme la porte.
  if (prof.statut_compte === 'suspendu') return { etat: 'refuse' };

  if (niveau === 'admin' && prof.role !== 'admin') return { etat: 'refuse' };
  return { etat: 'ok', prof };
}

/** Page réservée à l'administratrice. */
export function gardeAdminPage(): Promise<Garde> {
  return garde('admin');
}

/** Page réservée à un professeur connecté (l'admin passe aussi). */
export function gardeProfPage(): Promise<Garde> {
  return garde('prof');
}

/**
 * Version route API : renvoie la réponse de refus à retourner tel quel, ou
 * `null` si l'accès est accordé.
 *
 *   const refus = await gardeApiAdmin();
 *   if (refus) return refus;
 */
async function gardeApi(niveau: 'admin' | 'prof'): Promise<NextResponse | null> {
  const g = await garde(niveau);
  if (g.etat === 'ok') return null;
  if (g.etat === 'config') {
    return NextResponse.json(
      { error: 'Service non configuré' },
      { status: 503 },
    );
  }
  // On ne distingue pas « pas connecté » de « pas le droit » côté réponse :
  // inutile de confirmer à un inconnu que la ressource existe.
  return NextResponse.json({ error: 'Accès refusé' }, { status: 401 });
}

export function gardeApiAdmin(): Promise<NextResponse | null> {
  return gardeApi('admin');
}

export function gardeApiProf(): Promise<NextResponse | null> {
  return gardeApi('prof');
}

/**
 * Comme `gardeApiProf`, mais rend aussi le professeur — indispensable dès que
 * la route doit restreindre les LIGNES et pas seulement l'accès : « ce prof-ci
 * ne voit que ses copies » se décide avec son identité, pas avec un booléen.
 *
 * L'union discriminée fait le travail côté types : après `if (g.refus) return
 * g.refus;`, `g.prof` est garanti non nul.
 */
export type GardeApiDetail =
  | { refus: NextResponse; prof: null }
  | { refus: null; prof: Professeur };

export async function gardeApiProfDetail(): Promise<GardeApiDetail> {
  const g = await garde('prof');
  if (g.etat === 'ok') return { refus: null, prof: g.prof };
  const refus =
    g.etat === 'config'
      ? NextResponse.json({ error: 'Service non configuré' }, { status: 503 })
      : NextResponse.json({ error: 'Accès refusé' }, { status: 401 });
  return { refus, prof: null };
}

/**
 * Version action serveur : lève si l'accès est refusé.
 *
 * Indispensable en plus du garde de page : une action serveur est un point
 * d'entrée POST à part entière, identifiée par un hash présent dans le bundle
 * client. Protéger la page qui l'affiche ne protège pas l'action.
 */
export async function exigerAdminAction(): Promise<Professeur> {
  const g = await garde('admin');
  if (g.etat !== 'ok') throw new Error('Accès refusé');
  return g.prof;
}
