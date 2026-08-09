/**
 * Salles Discord d'un bac blanc — préparation, verrouillage, suppression.
 *
 * ⚠️ SERVEUR UNIQUEMENT : parle à Discord avec le token du bot.
 *
 * Aucune table en base. C'est volontaire : le nom de la catégorie est calculé
 * à partir de la matière et de la date de la session (`nomCategorieSession`),
 * donc Discord lui-même sert de mémoire. Rien à migrer, rien à désynchroniser,
 * et une catégorie créée à la main reste invisible pour ce module — il ne
 * touche que ce qu'il sait avoir créé.
 *
 * Une salle par élève, vocale et privée :
 *   - @everyone : ni voir, ni se connecter ;
 *   - Équipe Matinées : voir + se connecter (surveillance) ;
 *   - l'élève : ses droits sont posés plus tard, quand il relie son compte
 *     Discord. Ici on crée la salle et on la ferme.
 */
import { crmAdmin } from '@/lib/authProf';
import { discord, type SalonDiscord } from '@/lib/discord/api';
import {
  CIBLE_OVERWRITE,
  GUILD_ID,
  PERM,
  ROLE_PROF_ID,
  ROLE_STAFF_ID,
  SALONS_TEXTE_SESSION,
  TYPE_SALON,
  discordManquant,
  nomCategorieSession,
  nomSalonEleve,
} from '@/lib/discord/config';

// --- Formes -----------------------------------------------------------

export type SalleEleve = {
  id: string;
  nom: string;
  /** Le salon interdit-il l'entrée à tout le monde ? */
  verrouille: boolean;
};

export type SessionDiscord = {
  session_id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  jours: number;
  passe: boolean;
  nb_eleves: number;
  /** Nom exact de la catégorie attendue sur Discord. */
  categorie_nom: string;
  /** Renseignée dès que la catégorie existe sur le serveur. */
  categorie_id: string | null;
  salons_texte: string[];
  salles: SalleEleve[];
  /** Élèves inscrits sans salle : ce que « Préparer les salles » va créer. */
  manquantes: number;
};

export type EtatSalons = {
  genere_le: string;
  configure: boolean;
  manquants: string[];
  /** Message d'erreur si Discord n'a pas pu être lu. */
  erreur: string | null;
  serveur: string | null;
  sessions: SessionDiscord[];
  /** Catégories créées par nous dont la session n'existe plus / est passée. */
  categories_orphelines: { id: string; nom: string; salons: number }[];
};

// --- Outils -----------------------------------------------------------

const aujourdhui = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function joursAvant(dateISO: string): number {
  const cible = new Date(dateISO + 'T12:00:00');
  cible.setHours(0, 0, 0, 0);
  return Math.round((cible.getTime() - aujourdhui().getTime()) / 86_400_000);
}

/** Refus posé sur @everyone + accès pour l'équipe. Le socle de toute salle. */
function permissionsPrivees(avecProfs: boolean) {
  const ouvrir = String(PERM.VIEW_CHANNEL | PERM.CONNECT | PERM.SPEAK);
  return [
    {
      id: GUILD_ID,
      type: CIBLE_OVERWRITE.ROLE,
      deny: String(PERM.VIEW_CHANNEL | PERM.CONNECT),
    },
    ...(ROLE_STAFF_ID
      ? [{ id: ROLE_STAFF_ID, type: CIBLE_OVERWRITE.ROLE, allow: ouvrir }]
      : []),
    ...(avecProfs && ROLE_PROF_ID
      ? [{ id: ROLE_PROF_ID, type: CIBLE_OVERWRITE.ROLE, allow: ouvrir }]
      : []),
  ];
}

/** Un salon est « verrouillé » quand @everyone n'a plus le droit de se connecter. */
function estVerrouille(salon: SalonDiscord): boolean {
  const refus = salon.permission_overwrites?.find((o) => o.id === GUILD_ID);
  if (!refus) return false;
  return Boolean(BigInt(refus.deny) & PERM.CONNECT);
}

// --- Lecture ----------------------------------------------------------

type SessionCrm = {
  id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
};

async function sessionsEtEleves(): Promise<{ sessions: SessionCrm[]; eleves: Map<string, string[]> }> {
  const db = crmAdmin();
  const [{ data: sessions }, { data: inscrits }] = await Promise.all([
    db
      .from('sessions_bacs_blancs')
      .select('id, matiere, date_epreuve, heure_debut')
      .order('date_epreuve', { ascending: true }),
    db.from('inscriptions').select('session_id, nom'),
  ]);

  const eleves = new Map<string, string[]>();
  for (const i of (inscrits ?? []) as { session_id: string | null; nom: string }[]) {
    if (!i.session_id) continue;
    const liste = eleves.get(i.session_id) ?? [];
    liste.push(i.nom);
    eleves.set(i.session_id, liste);
  }

  return { sessions: (sessions ?? []) as SessionCrm[], eleves };
}

/**
 * L'état complet : ce que le CRM prévoit, confronté à ce qui existe sur
 * Discord. Ne crée rien.
 */
export async function chargerEtatSalons(): Promise<EtatSalons> {
  const manquants = discordManquant();
  const base: EtatSalons = {
    genere_le: new Date().toISOString(),
    configure: manquants.length === 0,
    manquants,
    erreur: null,
    serveur: null,
    sessions: [],
    categories_orphelines: [],
  };

  const { sessions, eleves } = await sessionsEtEleves();

  // Sans configuration, on montre quand même le programme des épreuves : cela
  // dit à quoi ressemblera l'écran une fois Discord relié.
  if (!base.configure) {
    base.sessions = sessions
      .filter((s) => joursAvant(s.date_epreuve) >= -1)
      .map((s) => vue(s, eleves.get(s.id) ?? [], null, []));
    return base;
  }

  const [serveur, salons] = await Promise.all([
    discord<{ name: string }>(`/guilds/${GUILD_ID}`),
    discord<SalonDiscord[]>(`/guilds/${GUILD_ID}/channels`),
  ]);

  base.serveur = serveur.ok ? (serveur.corps?.name ?? null) : null;

  if (!salons.ok || !Array.isArray(salons.corps)) {
    base.erreur = salons.erreur ?? 'Discord n’a pas renvoyé la liste des salons.';
    base.sessions = sessions
      .filter((s) => joursAvant(s.date_epreuve) >= -1)
      .map((s) => vue(s, eleves.get(s.id) ?? [], null, []));
    return base;
  }

  const tous = salons.corps;
  const categories = tous.filter((c) => c.type === TYPE_SALON.CATEGORIE);

  // Une catégorie de bac blanc porte toujours le nom calculé par le code :
  // c'est ce qui la distingue des catégories permanentes (ÉQUIPE, ACCUEIL…).
  const attendues = new Map<string, SessionCrm>();
  for (const s of sessions) attendues.set(nomCategorieSession(s.matiere, s.date_epreuve), s);

  base.sessions = sessions
    .filter((s) => joursAvant(s.date_epreuve) >= -1)
    .map((s) => {
      const nom = nomCategorieSession(s.matiere, s.date_epreuve);
      const categorie = categories.find((c) => c.name.toUpperCase() === nom.toUpperCase()) ?? null;
      const dedans = categorie ? tous.filter((c) => c.parent_id === categorie.id) : [];
      return vue(s, eleves.get(s.id) ?? [], categorie, dedans);
    });

  base.categories_orphelines = categories
    .filter((c) => {
      const session = attendues.get(c.name.toUpperCase()) ?? attendues.get(c.name);
      if (!session) {
        // Catégorie inconnue du CRM : elle n'est à nous que si elle suit notre
        // nommage (« BAC … — … — MATIN »). Sinon c'est une catégorie manuelle.
        return /^(BAC|BREVET) .+ — .+ — MATIN$/i.test(c.name);
      }
      return joursAvant(session.date_epreuve) < -1;
    })
    .map((c) => ({
      id: c.id,
      nom: c.name,
      salons: tous.filter((x) => x.parent_id === c.id).length,
    }));

  return base;
}

function vue(
  s: SessionCrm,
  nomsEleves: string[],
  categorie: SalonDiscord | null,
  dedans: SalonDiscord[],
): SessionDiscord {
  const vocaux = dedans.filter((c) => c.type === TYPE_SALON.VOCAL);
  const attendus = new Set(nomsEleves.map((n, i) => nomSalonEleve(n, String(i + 1))));
  // Un salon existant compte pour un élève dès que son nom correspond au
  // motif attendu — le suffixe garantit l'unicité, on compare donc l'ensemble.
  const existants = new Set(vocaux.map((c) => c.name));
  let manquantes = 0;
  for (const attendu of attendus) if (!existants.has(attendu)) manquantes += 1;

  return {
    session_id: s.id,
    matiere: s.matiere,
    date_epreuve: s.date_epreuve,
    heure_debut: s.heure_debut,
    jours: joursAvant(s.date_epreuve),
    passe: joursAvant(s.date_epreuve) < 0,
    nb_eleves: nomsEleves.length,
    categorie_nom: nomCategorieSession(s.matiere, s.date_epreuve),
    categorie_id: categorie?.id ?? null,
    salons_texte: dedans.filter((c) => c.type === TYPE_SALON.TEXTE).map((c) => c.name),
    salles: vocaux.map((c) => ({ id: c.id, nom: c.name, verrouille: estVerrouille(c) })),
    manquantes: categorie ? manquantes : nomsEleves.length,
  };
}

// --- Actions ----------------------------------------------------------

export type ResultatAction = { ok: boolean; message: string; details: string[] };

/**
 * Prépare (ou complète) les salles d'une session : la catégorie privée, les
 * salons textuels, puis une salle vocale par élève inscrit qui n'en a pas.
 * L'action est rejouable sans risque : elle ne recrée jamais l'existant.
 */
export async function preparerSalles(sessionId: string): Promise<ResultatAction> {
  if (discordManquant().length) {
    return { ok: false, message: 'Discord n’est pas configuré.', details: discordManquant() };
  }

  const { sessions, eleves } = await sessionsEtEleves();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return { ok: false, message: 'Session introuvable.', details: [] };

  const nomsEleves = eleves.get(sessionId) ?? [];
  if (!nomsEleves.length) {
    return { ok: false, message: 'Aucun élève inscrit sur ce bac blanc : rien à créer.', details: [] };
  }

  const motif = `Bac blanc ${session.matiere} du ${session.date_epreuve}`;
  const details: string[] = [];

  const salons = await discord<SalonDiscord[]>(`/guilds/${GUILD_ID}/channels`);
  if (!salons.ok || !Array.isArray(salons.corps)) {
    return { ok: false, message: salons.erreur ?? 'Lecture des salons impossible.', details: [] };
  }

  const nomCategorie = nomCategorieSession(session.matiere, session.date_epreuve);
  let categorie =
    salons.corps.find(
      (c) => c.type === TYPE_SALON.CATEGORIE && c.name.toUpperCase() === nomCategorie.toUpperCase(),
    ) ?? null;

  if (!categorie) {
    const creation = await discord<SalonDiscord>(`/guilds/${GUILD_ID}/channels`, {
      methode: 'POST',
      motifAudit: motif,
      corps: {
        name: nomCategorie,
        type: TYPE_SALON.CATEGORIE,
        permission_overwrites: permissionsPrivees(true),
      },
    });
    if (!creation.ok || !creation.corps) {
      return { ok: false, message: creation.erreur ?? 'Création de la catégorie refusée.', details };
    }
    categorie = creation.corps;
    details.push(`Catégorie « ${nomCategorie} » créée.`);
  }

  const dedans = salons.corps.filter((c) => c.parent_id === categorie!.id);

  for (const nom of SALONS_TEXTE_SESSION) {
    if (dedans.some((c) => c.name === nom)) continue;
    const r = await discord<SalonDiscord>(`/guilds/${GUILD_ID}/channels`, {
      methode: 'POST',
      motifAudit: motif,
      corps: { name: nom, type: TYPE_SALON.TEXTE, parent_id: categorie.id },
    });
    details.push(r.ok ? `Salon « ${nom} » créé.` : `Salon « ${nom} » : ${r.erreur}`);
  }

  const existants = new Set(dedans.filter((c) => c.type === TYPE_SALON.VOCAL).map((c) => c.name));
  let creees = 0;
  for (let i = 0; i < nomsEleves.length; i++) {
    const nom = nomSalonEleve(nomsEleves[i], String(i + 1));
    if (existants.has(nom)) continue;

    const r = await discord<SalonDiscord>(`/guilds/${GUILD_ID}/channels`, {
      methode: 'POST',
      motifAudit: motif,
      corps: {
        name: nom,
        type: TYPE_SALON.VOCAL,
        parent_id: categorie.id,
        user_limit: 2, // l'élève et le coach : personne d'autre ne peut entrer
        permission_overwrites: permissionsPrivees(true),
      },
    });
    if (r.ok) creees += 1;
    else details.push(`Salle « ${nom} » : ${r.erreur}`);
  }

  details.push(`${creees} salle${creees > 1 ? 's' : ''} d’élève créée${creees > 1 ? 's' : ''}.`);
  return { ok: true, message: `Salles prêtes pour ${session.matiere}.`, details };
}

/**
 * Ferme toutes les salles vocales d'une session : plus personne n'entre, mais
 * rien n'est supprimé. C'est ce qu'on fait à la fin de l'épreuve.
 */
export async function verrouillerSalles(categorieId: string): Promise<ResultatAction> {
  if (discordManquant().length) {
    return { ok: false, message: 'Discord n’est pas configuré.', details: discordManquant() };
  }

  const salons = await discord<SalonDiscord[]>(`/guilds/${GUILD_ID}/channels`);
  if (!salons.ok || !Array.isArray(salons.corps)) {
    return { ok: false, message: salons.erreur ?? 'Lecture des salons impossible.', details: [] };
  }

  const vocaux = salons.corps.filter((c) => c.parent_id === categorieId && c.type === TYPE_SALON.VOCAL);
  const details: string[] = [];
  let fermes = 0;

  for (const salon of vocaux) {
    // On repose le refus sur @everyone : les autorisations individuelles
    // posées pour les élèves ne suffisent plus à entrer.
    const r = await discord(`/channels/${salon.id}/permissions/${GUILD_ID}`, {
      methode: 'PUT',
      motifAudit: 'Fin du bac blanc — fermeture des salles',
      corps: {
        type: CIBLE_OVERWRITE.ROLE,
        deny: String(PERM.VIEW_CHANNEL | PERM.CONNECT),
        allow: '0',
      },
    });
    if (r.ok) fermes += 1;
    else details.push(`« ${salon.name} » : ${r.erreur}`);
  }

  return {
    ok: true,
    message: `${fermes} salle${fermes > 1 ? 's' : ''} fermée${fermes > 1 ? 's' : ''}.`,
    details,
  };
}

/** Supprime la catégorie d'un bac blanc et tout ce qu'elle contient. */
export async function supprimerCategorie(categorieId: string): Promise<ResultatAction> {
  if (discordManquant().length) {
    return { ok: false, message: 'Discord n’est pas configuré.', details: discordManquant() };
  }

  const salons = await discord<SalonDiscord[]>(`/guilds/${GUILD_ID}/channels`);
  if (!salons.ok || !Array.isArray(salons.corps)) {
    return { ok: false, message: salons.erreur ?? 'Lecture des salons impossible.', details: [] };
  }

  const categorie = salons.corps.find((c) => c.id === categorieId);
  if (!categorie || categorie.type !== TYPE_SALON.CATEGORIE) {
    return { ok: false, message: 'Cette catégorie n’existe plus sur Discord.', details: [] };
  }

  const details: string[] = [];
  const enfants = salons.corps.filter((c) => c.parent_id === categorieId);
  for (const salon of enfants) {
    const r = await discord(`/channels/${salon.id}`, {
      methode: 'DELETE',
      motifAudit: 'Ménage après bac blanc',
    });
    if (!r.ok) details.push(`« ${salon.name} » : ${r.erreur}`);
  }

  const r = await discord(`/channels/${categorieId}`, {
    methode: 'DELETE',
    motifAudit: 'Ménage après bac blanc',
  });
  if (!r.ok) return { ok: false, message: r.erreur ?? 'Suppression refusée.', details };

  return {
    ok: true,
    message: `« ${categorie.name} » supprimée (${enfants.length} salon${enfants.length > 1 ? 's' : ''}).`,
    details,
  };
}
