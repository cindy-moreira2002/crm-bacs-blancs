/**
 * Porte d'entrée du dépôt de copies (écran « Correction automatique »).
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Pourquoi cette porte existe : chaque dépôt déclenche trois appels payants à
 * l'API Anthropic (transcription → correction → dossier) et écrit un PDF dans
 * le Storage. Sans contrôle, l'adresse de la page suffit à dépenser sur le
 * compte — et une URL finit toujours par circuler. Le secret d'une URL n'est
 * pas une sécurité ; celle-ci en est une.
 *
 * Deux façons d'entrer, dans cet ordre :
 *   1. être un prof connecté (cookie de session `mdb_prof`, compte actif) ;
 *   2. avoir saisi le code d'accès partagé `DEPOT_ACCESS_CODE` — pour les profs
 *      invités qui n'ont pas encore de compte. Le code pose un second cookie
 *      signé, valable 12 h.
 *
 * Le code partagé est volontairement le maillon faible : il circule comme
 * l'URL. Il ferme la porte aux robots et aux curieux, pas à quelqu'un à qui on
 * l'a donné. Le vrai contrôle reste le compte prof.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  OPTIONS_COOKIE,
  authManquant,
  decoderCookieSigne,
  encoderCookieSigne,
  profCourant,
  secretSessionPresent,
} from './authProf';
import { pipelineDb, pipelineManquant } from './pipeline';

export const COOKIE_DEPOT = 'mdb_depot';
const DUREE_CODE_S = 60 * 60 * 12; // 12 h : une matinée de corrections, pas plus.

const codeAttendu = process.env.DEPOT_ACCESS_CODE ?? '';

/** Plafonds de dépôts. Bornent la dépense quoi qu'il arrive (option C). */
const MAX_PAR_JOUR = Number(process.env.DEPOT_MAX_PAR_JOUR ?? 80);
const MAX_PAR_HEURE = Number(process.env.DEPOT_MAX_PAR_HEURE ?? 50);

export type Acces =
  | {
      autorise: true;
      via: 'prof' | 'code';
      profId: string | null;
      nom: string | null;
      email: string | null;
    }
  | { autorise: false };

/** Le code partagé est-il configuré ? (sinon, seule la connexion prof ouvre) */
export function codeDepotConfigure(): boolean {
  return Boolean(codeAttendu) && secretSessionPresent();
}

/**
 * Qui est en train de déposer ? Ne fait aucune écriture : appelable depuis un
 * composant serveur comme depuis une route.
 */
export async function accesDepot(): Promise<Acces> {
  // 1. Prof connecté — le chemin normal.
  if (!authManquant().length) {
    const { prof } = await profCourant();
    if (prof && prof.statut_compte === 'actif') {
      return {
        autorise: true,
        via: 'prof',
        profId: prof.id,
        nom: `${prof.prenom} ${prof.nom}`,
        email: prof.email,
      };
    }
  }

  // 2. Code partagé déjà saisi dans ce navigateur.
  if (codeDepotConfigure()) {
    const jar = await cookies();
    const jeton = decoderCookieSigne(jar.get(COOKIE_DEPOT)?.value);
    if (jeton?.depot === true) {
      return { autorise: true, via: 'code', profId: null, nom: null, email: null };
    }
  }

  return { autorise: false };
}

/**
 * Vérifie le code saisi. Comparaison à temps constant sur les empreintes :
 * les deux côtés font toujours 32 octets, donc la longueur du vrai code ne
 * fuit pas non plus.
 */
export function verifierCodeDepot(saisi: string): boolean {
  if (!codeDepotConfigure()) return false;
  const a = createHash('sha256').update(String(saisi ?? '').trim()).digest();
  const b = createHash('sha256').update(codeAttendu.trim()).digest();
  return timingSafeEqual(a, b);
}

export async function ouvrirAccesCode() {
  const jar = await cookies();
  jar.set(
    COOKIE_DEPOT,
    encoderCookieSigne({ depot: true, exp: Math.floor(Date.now() / 1000) + DUREE_CODE_S }),
    { ...OPTIONS_COOKIE, maxAge: DUREE_CODE_S },
  );
}

export async function fermerAccesCode() {
  const jar = await cookies();
  jar.delete(COOKIE_DEPOT);
}

// --- Plafonds de dépôts ------------------------------------------------

export type Quota = {
  ok: boolean;
  message?: string;
  jour: number;
  heure: number;
  maxJour: number;
  maxHeure: number;
};

/**
 * Compte les copies déjà déposées et refuse au-delà des plafonds.
 *
 * On compte TOUTES les lignes `corrections`, pas seulement celles d'un prof :
 * ce garde-fou protège la facture, pas l'équité entre profs. Il vaut aussi
 * contre une boucle accidentelle dans notre propre code.
 *
 * En cas d'erreur de comptage on refuse (fail-closed) : mieux vaut un dépôt
 * reporté d'une minute qu'un plafond silencieusement désactivé.
 */
export async function verifierQuotaDepot(): Promise<Quota> {
  const base = { jour: 0, heure: 0, maxJour: MAX_PAR_JOUR, maxHeure: MAX_PAR_HEURE };
  if (pipelineManquant().length) return { ...base, ok: true };

  const maintenant = Date.now();
  const debutJour = new Date(maintenant - 24 * 60 * 60 * 1000).toISOString();
  const debutHeure = new Date(maintenant - 60 * 60 * 1000).toISOString();

  try {
    const db = pipelineDb();
    const [j, h] = await Promise.all([
      db.from('corrections').select('id', { count: 'exact', head: true }).gte('created_at', debutJour),
      db.from('corrections').select('id', { count: 'exact', head: true }).gte('created_at', debutHeure),
    ]);
    if (j.error || h.error) throw j.error ?? h.error;

    const jour = j.count ?? 0;
    const heure = h.count ?? 0;

    if (heure >= MAX_PAR_HEURE) {
      return {
        ...base, jour, heure, ok: false,
        message: `Plafond horaire atteint (${MAX_PAR_HEURE} copies/heure). Réessaie dans un moment, ou augmente DEPOT_MAX_PAR_HEURE.`,
      };
    }
    if (jour >= MAX_PAR_JOUR) {
      return {
        ...base, jour, heure, ok: false,
        message: `Plafond journalier atteint (${MAX_PAR_JOUR} copies/24 h). Réessaie demain, ou augmente DEPOT_MAX_PAR_JOUR.`,
      };
    }
    return { ...base, jour, heure, ok: true };
  } catch (err) {
    console.error('❌ verifierQuotaDepot', err);
    return {
      ...base, ok: false,
      message: "Impossible de vérifier le plafond de dépôts pour l'instant. Réessaie dans une minute.",
    };
  }
}

// --- Garde pour les routes /api ---------------------------------------

/**
 * À appeler en tête de chaque route du pipeline :
 *   const refus = await refuserSiPasAutorise();
 *   if (refus) return refus;
 */
export async function refuserSiPasAutorise(): Promise<NextResponse | null> {
  const acces = await accesDepot();
  if (acces.autorise) return null;
  return NextResponse.json(
    { error: 'Accès réservé aux professeurs. Connecte-toi ou saisis le code d’accès.' },
    { status: 401 },
  );
}
