/**
 * Les mains levées — un élève bloqué appelle son prof.
 *
 * ⚠️ SERVEUR UNIQUEMENT (clé service_role).
 *
 * Pendant une épreuve, chaque élève est seul dans sa salle vocale et le prof
 * circule de l'une à l'autre. Un élève qui bloque n'avait donc aucun moyen de
 * se signaler : parler dans sa salle ne sert à rien si le prof est ailleurs.
 *
 * Ici, lever la main écrit une ligne. La console du prof relit ces lignes
 * toutes les dix secondes et affiche, en haut et en rouge, qui attend et
 * depuis combien de temps. Deux portes d'entrée, une seule table :
 *   · le bouton « ✋ Appeler le prof » de l'espace élève ;
 *   · le même bouton, posé dans la salle Discord de l'élève.
 *
 * Règle tenue en base autant qu'ici : un élève n'a jamais deux appels ouverts
 * (index unique partiel, script 51). Lever la main deux fois ne fait pas deux
 * lignes rouges — la deuxième est simplement ignorée.
 */
import { crmAdmin } from '@/lib/authProf';

export type Appel = {
  id: string;
  inscription_id: string;
  session_id: string | null;
  motif: 'aide' | 'technique';
  source: 'espace' | 'discord';
  cree_le: string;
  traite_le: string | null;
  annule_le: string | null;
};

export type AppelOuvert = Appel & {
  /** Nom de l'élève, pour l'afficher sans refaire une requête côté console. */
  eleve_nom: string;
  /** Sa salle Discord : le prof clique et y entre directement. */
  salon_url: string | null;
};

/** Une table absente (script 51 pas encore passé) ne doit rien casser. */
function tableAbsente(message: string | undefined): boolean {
  return /appels_aide/.test(message ?? '') || /PGRST205/.test(message ?? '');
}

export type ResultatAppel =
  | { ok: true; deja: boolean }
  | { ok: false; erreur: string };

/**
 * Lève la main pour une inscription.
 *
 * Ne lève jamais d'exception : appelée depuis une route élève et depuis un
 * bouton Discord, qui doivent tous deux répondre quelque chose de lisible.
 */
export async function leverLaMain(
  inscriptionId: string,
  options: { motif?: 'aide' | 'technique'; source?: 'espace' | 'discord' } = {},
): Promise<ResultatAppel> {
  const db = crmAdmin();

  const { data: inscription, error: lecture } = await db
    .from('inscriptions')
    .select('id, session_id')
    .eq('id', inscriptionId)
    .maybeSingle();

  if (lecture) return { ok: false, erreur: lecture.message };
  if (!inscription) return { ok: false, erreur: 'Inscription introuvable.' };

  const { error } = await db.from('appels_aide').insert({
    inscription_id: inscriptionId,
    session_id: (inscription as { session_id: string | null }).session_id,
    motif: options.motif ?? 'aide',
    source: options.source ?? 'espace',
  });

  if (!error) return { ok: true, deja: false };

  // 23505 = l'index unique partiel a parlé : cet élève a déjà la main levée.
  // Ce n'est pas une erreur pour lui, c'est exactement ce qu'il voulait.
  if (error.code === '23505') return { ok: true, deja: true };
  if (tableAbsente(error.message)) {
    return { ok: false, erreur: 'Les appels ne sont pas encore activés (script SQL 51 à passer).' };
  }
  return { ok: false, erreur: error.message };
}

/** L'élève rebaisse la main lui-même : l'appel est annulé, pas « traité ». */
export async function baisserLaMain(inscriptionId: string): Promise<ResultatAppel> {
  const { error } = await crmAdmin()
    .from('appels_aide')
    .update({ annule_le: new Date().toISOString() })
    .eq('inscription_id', inscriptionId)
    .is('traite_le', null)
    .is('annule_le', null);

  if (error && !tableAbsente(error.message)) return { ok: false, erreur: error.message };
  return { ok: true, deja: false };
}

/** Le prof a répondu : l'appel est clos, avec la trace de qui a répondu. */
export async function traiterAppel(appelId: string, profId: string): Promise<ResultatAppel> {
  const { error } = await crmAdmin()
    .from('appels_aide')
    .update({ traite_le: new Date().toISOString(), traite_par: profId })
    .eq('id', appelId)
    .is('traite_le', null)
    .is('annule_le', null);

  if (error && !tableAbsente(error.message)) return { ok: false, erreur: error.message };
  return { ok: true, deja: false };
}

/** L'appel ouvert d'un élève, ou null. Sert à l'espace élève (état du bouton). */
export async function appelOuvertDeLEleve(inscriptionId: string): Promise<Appel | null> {
  const { data, error } = await crmAdmin()
    .from('appels_aide')
    .select('id, inscription_id, session_id, motif, source, cree_le, traite_le, annule_le')
    .eq('inscription_id', inscriptionId)
    .is('traite_le', null)
    .is('annule_le', null)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as Appel;
}

/**
 * Les appels ouverts d'une session, du plus ancien au plus récent — celui qui
 * attend depuis le plus longtemps passe devant.
 *
 * Renvoie une liste vide si la table n'existe pas encore : la console du prof
 * doit s'ouvrir même avant que le script 51 soit passé.
 */
export async function appelsOuvertsSession(sessionId: string): Promise<AppelOuvert[]> {
  const db = crmAdmin();

  const { data, error } = await db
    .from('appels_aide')
    .select('id, inscription_id, session_id, motif, source, cree_le, traite_le, annule_le')
    .eq('session_id', sessionId)
    .is('traite_le', null)
    .is('annule_le', null)
    .order('cree_le', { ascending: true });

  if (error || !data?.length) return [];

  const ids = data.map((a) => (a as { inscription_id: string }).inscription_id);
  const { data: eleves } = await db
    .from('inscriptions')
    .select('id, nom, discord_salon_id')
    .in('id', ids);

  const { lienSalon } = await import('@/lib/discord/config');
  const parId = new Map(
    (eleves ?? []).map((e) => {
      const row = e as { id: string; nom: string; discord_salon_id?: string | null };
      return [row.id, row];
    }),
  );

  return (data as unknown as Appel[]).map((a) => {
    const eleve = parId.get(a.inscription_id);
    return {
      ...a,
      eleve_nom: eleve?.nom ?? 'Élève',
      salon_url: lienSalon(eleve?.discord_salon_id),
    };
  });
}

/** Depuis combien de temps la main est levée — « 3 min », « à l'instant ». */
export function depuis(iso: string, maintenant = Date.now()): string {
  const minutes = Math.floor((maintenant - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes === 1) return 'depuis 1 min';
  if (minutes < 60) return `depuis ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  return `depuis ${heures} h ${String(minutes % 60).padStart(2, '0')}`;
}
