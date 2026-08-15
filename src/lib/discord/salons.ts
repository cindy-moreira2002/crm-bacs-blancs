/**
 * Salles Discord d'un bac blanc — préparation, verrouillage, suppression.
 *
 * ⚠️ SERVEUR UNIQUEMENT : parle à Discord avec le token du bot.
 *
 * Discord reste la mémoire de ce qui existe : le nom de la catégorie est
 * calculé à partir de la matière et de la date (`nomCategorieSession`), donc
 * une catégorie créée à la main reste invisible pour ce module — il ne touche
 * que ce qu'il sait avoir créé.
 *
 * En revanche, **quelle salle appartient à quel élève** est écrit en base, sur
 * l'inscription (`discord_salon_id`). Le rapprochement par le nom du salon ne
 * suffisait pas : deux homonymes, un accent, un nom corrigé après coup, et on
 * ne savait plus dire quel élève avait perdu sa salle. Cette colonne est aussi
 * ce que lisent l'espace élève et l'e-mail « Lien de visioconférence » : les
 * trois ne peuvent donc pas se contredire.
 *
 * Une salle par élève, vocale et privée :
 *   - @everyone : ni voir, ni se connecter ;
 *   - Équipe Matinées : voir + se connecter (surveillance) ;
 *   - l'élève : voir + se connecter, à condition d'avoir relié son compte
 *     Discord (`discord_user_id`). Sans compte relié, la salle existe et le
 *     lien s'affiche, mais elle lui reste fermée — d'où l'avertissement en fin
 *     de préparation, qui est le vrai indicateur à regarder avant l'épreuve.
 */
import { crmAdmin } from '@/lib/authProf';
import { discord, idDuBot, type SalonDiscord } from '@/lib/discord/api';
import {
  CIBLE_OVERWRITE,
  GUILD_ID,
  PERM,
  ROLE_PROF_ID,
  ROLE_STAFF_ID,
  SALONS_TEXTE_SESSION,
  TYPE_SALON,
  discordManquant,
  lienCategorie,
  lienSalon,
  nomCategorieSession,
  nomSalonEleve,
} from '@/lib/discord/config';
import { ouvrirSalonA } from '@/lib/discord/oauth';

// --- Formes -----------------------------------------------------------

export type SalleEleve = {
  id: string;
  nom: string;
  /** Le salon interdit-il l'entrée à tout le monde ? */
  verrouille: boolean;
};

/**
 * Un élève, sa salle, et surtout : son lien est-il arrivé jusqu'à lui ?
 *
 * `lien_depose` ne dit pas « une salle existe sur Discord » mais « cette salle
 * est inscrite sur SON inscription ». C'est la seule formulation utile : c'est
 * exactement ce que lisent son espace et son e-mail. Une salle qui existe sur
 * Discord sans être rattachée ne sert à personne.
 */
export type EleveSalle = {
  inscription_id: string;
  eleve: string;
  /** Le salon attribué à cet élève, d'après la base. */
  salon_id: string | null;
  salon_nom: string | null;
  /** L'adresse à ouvrir. Nulle tant qu'aucune salle n'est attribuée. */
  lien: string | null;
  /** Vrai quand l'élève voit ce lien dans son espace et le recevra par e-mail. */
  lien_depose: boolean;
  /** La salle attribuée existe-t-elle encore sur Discord ? */
  salle_existe: boolean;
  verrouille: boolean;
  /** L'élève a-t-il relié son compte Discord ? Sinon sa salle lui reste fermée. */
  compte_relie: boolean;
  /** L'autorisation est-elle écrite sur SA salle ? */
  acces_pose: boolean;
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
  /** Le lien du professeur : le bloc de l'épreuve, d'où il surveille. */
  categorie_lien: string | null;
  salons_texte: string[];
  salles: SalleEleve[];
  /** Élèves inscrits sans salle : ce que « Préparer les salles » va créer. */
  manquantes: number;
  /** Le détail élève par élève — qui a son lien, qui ne l'a pas. */
  eleves: EleveSalle[];
  /** Combien d'élèves ont bien leur lien déposé. */
  liens_deposes: number;
  /** Combien ont relié leur compte Discord — donc pourront réellement entrer. */
  comptes_relies: number;
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

/** Ce qu'on accorde à qui a le droit d'être dans une salle : voir, entrer, parler. */
const OUVRIR = String(PERM.VIEW_CHANNEL | PERM.CONNECT | PERM.SPEAK);

/**
 * Refus posé sur @everyone + accès pour l'équipe. Le socle de toute salle.
 *
 * `botId` est indispensable, et c'est le piège qui a coûté le plus cher.
 * La catégorie refuse « voir » et « se connecter » à @everyone ; le bot, qui
 * n'a ni le rôle Équipe ni le rôle Prof, n'est QUE @everyone — il perd donc ces
 * deux permissions *à l'intérieur de sa propre catégorie*. Or Discord interdit
 * d'accorder une permission qu'on ne détient pas à cet endroit : la création de
 * chaque salle vocale échoue alors en « 403 Missing Permissions », tandis que
 * la catégorie et les salons textuels passent — eux ne demandent rien de vocal.
 * S'accorder explicitement l'accès referme la boucle.
 *
 * `eleveUserId` est l'occupant légitime de la salle, quand il a relié son
 * compte : sans cette ligne, l'élève voit son lien, clique, et tombe sur une
 * salle qui ne lui est pas ouverte. Un élève qui relie son compte APRÈS la
 * création n'est pas oublié pour autant — la route de liaison pose alors la
 * même permission, et « Préparer les salles » rattrape le cas inverse.
 */
function permissionsPrivees(avecProfs: boolean, botId: string, eleveUserId?: string | null) {
  return [
    {
      id: GUILD_ID,
      type: CIBLE_OVERWRITE.ROLE,
      deny: String(PERM.VIEW_CHANNEL | PERM.CONNECT),
    },
    { id: botId, type: CIBLE_OVERWRITE.MEMBRE, allow: OUVRIR },
    ...(ROLE_STAFF_ID
      ? [{ id: ROLE_STAFF_ID, type: CIBLE_OVERWRITE.ROLE, allow: OUVRIR }]
      : []),
    ...(avecProfs && ROLE_PROF_ID
      ? [{ id: ROLE_PROF_ID, type: CIBLE_OVERWRITE.ROLE, allow: OUVRIR }]
      : []),
    ...(eleveUserId
      ? [{ id: eleveUserId, type: CIBLE_OVERWRITE.MEMBRE, allow: OUVRIR }]
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

/** Une inscription vue d'ici : qui, sur quelle session, avec quelle salle. */
export type InscriptionSalle = {
  id: string;
  nom: string;
  session_id: string | null;
  discord_salon_id: string | null;
  discord_salon_nom: string | null;
  /** Le compte Discord relié par l'élève. Sans lui, sa salle reste fermée. */
  discord_user_id: string | null;
  discord_acces_pose_le: string | null;
};

const CHAMPS_INSCRIPTION_SALLE =
  'id, nom, session_id, discord_salon_id, discord_salon_nom, discord_user_id, discord_acces_pose_le';

async function sessionsEtEleves(): Promise<{
  sessions: SessionCrm[];
  eleves: Map<string, InscriptionSalle[]>;
}> {
  const db = crmAdmin();

  const [{ data: sessions }, inscrits] = await Promise.all([
    db
      .from('sessions_bacs_blancs')
      .select('id, matiere, date_epreuve, heure_debut')
      .order('date_epreuve', { ascending: true }),
    // Replis tant que les scripts 45 et 46 n'ont pas été passés : l'écran doit
    // continuer à fonctionner et à dire « aucun lien déposé » plutôt que de
    // tomber en panne. Les deux scripts sont indépendants, d'où deux paliers.
    db
      .from('inscriptions')
      .select(CHAMPS_INSCRIPTION_SALLE)
      .then(async (r) => {
        if (!r.error) return r;
        if (/discord_user_id|discord_acces_pose_le/.test(r.error.message ?? '')) {
          const sansCompte = await db
            .from('inscriptions')
            .select('id, nom, session_id, discord_salon_id, discord_salon_nom');
          if (!sansCompte.error) return sansCompte;
        }
        if (/discord_salon/.test(r.error.message ?? '')) {
          return db.from('inscriptions').select('id, nom, session_id');
        }
        return r;
      }),
  ]);

  const eleves = new Map<string, InscriptionSalle[]>();
  for (const brut of (inscrits.data ?? []) as Partial<InscriptionSalle>[]) {
    if (!brut.session_id) continue;
    const liste = eleves.get(brut.session_id) ?? [];
    liste.push({
      id: String(brut.id),
      nom: brut.nom ?? '',
      session_id: brut.session_id,
      discord_salon_id: brut.discord_salon_id ?? null,
      discord_salon_nom: brut.discord_salon_nom ?? null,
      discord_user_id: brut.discord_user_id ?? null,
      discord_acces_pose_le: brut.discord_acces_pose_le ?? null,
    });
    eleves.set(brut.session_id, liste);
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
  inscrits: InscriptionSalle[],
  categorie: SalonDiscord | null,
  dedans: SalonDiscord[],
): SessionDiscord {
  const vocaux = dedans.filter((c) => c.type === TYPE_SALON.VOCAL);
  const vocauxParId = new Map(vocaux.map((c) => [c.id, c]));

  // On raisonne élève par élève, jamais sur des ensembles de noms : la question
  // à laquelle cet écran doit répondre est « qui n'a pas son lien ? », et un
  // décompte global ne la répond pas.
  const eleves: EleveSalle[] = inscrits.map((i) => {
    const salle = i.discord_salon_id ? vocauxParId.get(i.discord_salon_id) : undefined;
    const salleExiste = Boolean(salle);
    return {
      inscription_id: i.id,
      eleve: (i.nom ?? '').trim() || '—',
      salon_id: i.discord_salon_id,
      salon_nom: salle?.name ?? i.discord_salon_nom,
      // Le lien n'est proposé que si la salle existe encore : une salle
      // supprimée sur Discord laisserait sinon un lien mort dans l'espace élève.
      lien: salleExiste ? lienSalon(i.discord_salon_id) : null,
      lien_depose: Boolean(i.discord_salon_id) && salleExiste,
      salle_existe: salleExiste,
      verrouille: salle ? estVerrouille(salle) : false,
      compte_relie: Boolean(i.discord_user_id),
      acces_pose: Boolean(i.discord_acces_pose_le),
    };
  });

  const liensDeposes = eleves.filter((e) => e.lien_depose).length;
  const comptesRelies = eleves.filter((e) => e.compte_relie).length;

  return {
    session_id: s.id,
    matiere: s.matiere,
    date_epreuve: s.date_epreuve,
    heure_debut: s.heure_debut,
    jours: joursAvant(s.date_epreuve),
    passe: joursAvant(s.date_epreuve) < 0,
    nb_eleves: inscrits.length,
    categorie_nom: nomCategorieSession(s.matiere, s.date_epreuve),
    categorie_id: categorie?.id ?? null,
    categorie_lien: categorie ? lienCategorie(categorie.id) : null,
    salons_texte: dedans.filter((c) => c.type === TYPE_SALON.TEXTE).map((c) => c.name),
    salles: vocaux.map((c) => ({ id: c.id, nom: c.name, verrouille: estVerrouille(c) })),
    // « Manquantes » = élèves sans lien utilisable, pas salons absents : c'est
    // ce que « Préparer les salles » aura à faire au prochain passage.
    manquantes: categorie ? eleves.length - liensDeposes : inscrits.length,
    eleves,
    liens_deposes: liensDeposes,
    comptes_relies: comptesRelies,
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

  const inscrits = eleves.get(sessionId) ?? [];
  if (!inscrits.length) {
    return { ok: false, message: 'Aucun élève inscrit sur ce bac blanc : rien à créer.', details: [] };
  }

  const motif = `Bac blanc ${session.matiere} du ${session.date_epreuve}`;
  const details: string[] = [];

  // Sans son propre identifiant, le bot ne peut pas se garder l'accès à la
  // catégorie qu'il va rendre privée — et plus rien de vocal ne s'y créera.
  const { id: botId, erreur: erreurBot } = await idDuBot();
  if (!botId) {
    return { ok: false, message: erreurBot ?? 'Bot Discord non identifié.', details: [] };
  }

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
        permission_overwrites: permissionsPrivees(true, botId),
      },
    });
    if (!creation.ok || !creation.corps) {
      return { ok: false, message: creation.erreur ?? 'Création de la catégorie refusée.', details };
    }
    categorie = creation.corps;
    details.push(`Catégorie « ${nomCategorie} » créée.`);
  } else if (!categorie.permission_overwrites?.some((o) => o.id === botId)) {
    // Catégorie née avant que le bot pense à se garder l'accès : on le lui
    // rend ici, sinon chaque salle continuerait d'échouer en 403 sans que rien
    // n'explique pourquoi la préparation, elle, « réussit ».
    const reparation = await discord(`/channels/${categorie.id}/permissions/${botId}`, {
      methode: 'PUT',
      corps: { type: CIBLE_OVERWRITE.MEMBRE, allow: OUVRIR, deny: '0' },
      motifAudit: 'Accès du bot à la catégorie qu’il administre',
    });
    if (!reparation.ok) {
      return {
        ok: false,
        message: `Le bot ne peut pas se rendre l’accès à « ${nomCategorie} » : ${reparation.erreur}`,
        details,
      };
    }
    details.push('Accès du bot rétabli sur la catégorie.');
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

  // La catégorie est notée sur la session : c'est le lien qu'on donne au prof.
  await noterCategorie(sessionId, categorie.id);

  const vocaux = dedans.filter((c) => c.type === TYPE_SALON.VOCAL);
  const parNom = new Map(vocaux.map((c) => [c.name, c]));
  const dejaPris = new Set(
    inscrits.map((i) => i.discord_salon_id).filter((id): id is string => Boolean(id)),
  );

  let creees = 0;
  let adoptees = 0;
  let posees = 0;
  let acces = 0;
  let sansCompte = 0;

  for (let i = 0; i < inscrits.length; i++) {
    const eleve = inscrits[i];

    // Déjà rattaché à une salle qui existe : on ne la recrée pas — c'est ce qui
    // rend l'action rejouable sans jamais déplacer un élève de salle. Mais on
    // vérifie quand même la porte : un élève qui a relié son compte après la
    // création n'est autorisé nulle part tant que personne ne l'a écrit.
    if (eleve.discord_salon_id && vocaux.some((c) => c.id === eleve.discord_salon_id)) {
      const r = await assurerAcces(eleve, eleve.discord_salon_id, false);
      if (r === 'pose') acces += 1;
      if (r === 'sans-compte') sansCompte += 1;
      continue;
    }

    const nom = nomSalonEleve(eleve.nom, String(i + 1));

    // Une salle porte déjà ce nom et n'appartient à personne : on l'adopte
    // plutôt que d'en créer une deuxième. C'est le cas des salles créées avant
    // que le rattachement existe.
    const existante = parNom.get(nom);
    let salonId: string | null = null;
    let venaitDetreCreee = false;

    if (existante && !dejaPris.has(existante.id)) {
      salonId = existante.id;
      adoptees += 1;
    } else {
      const r = await discord<SalonDiscord>(`/guilds/${GUILD_ID}/channels`, {
        methode: 'POST',
        motifAudit: motif,
        corps: {
          name: nom,
          type: TYPE_SALON.VOCAL,
          parent_id: categorie.id,
          user_limit: 2, // l'élève et le coach : personne d'autre ne peut entrer
          permission_overwrites: permissionsPrivees(true, botId, eleve.discord_user_id),
        },
      });
      if (!r.ok || !r.corps) {
        details.push(`Salle « ${nom} » : ${r.erreur ?? 'création refusée'}`);
        continue;
      }
      salonId = r.corps.id;
      creees += 1;
      venaitDetreCreee = true;
    }

    dejaPris.add(salonId);

    // Sans cette écriture, la salle existerait sur Discord sans que l'élève en
    // sache rien : ni son espace ni son e-mail n'y auraient accès.
    const pose = await noterSalonEleve(eleve.id, salonId, nom);
    if (pose) posees += 1;
    else details.push(`Salle « ${nom} » créée, mais le lien n’a pas pu être déposé pour ${eleve.nom}.`);

    // Une salle qu'on vient de créer porte déjà l'autorisation de son élève :
    // inutile de la réécrire, il reste seulement à en garder la date. Une salle
    // adoptée, elle, n'a jamais rien reçu.
    const r = await assurerAcces(eleve, salonId, venaitDetreCreee);
    if (r === 'pose') acces += 1;
    if (r === 'sans-compte') sansCompte += 1;
  }

  if (creees) details.push(`${creees} salle${creees > 1 ? 's' : ''} créée${creees > 1 ? 's' : ''}.`);
  if (adoptees) {
    details.push(`${adoptees} salle${adoptees > 1 ? 's' : ''} existante${adoptees > 1 ? 's' : ''} rattachée${adoptees > 1 ? 's' : ''} à son élève.`);
  }
  details.push(`${posees} lien${posees > 1 ? 's' : ''} déposé${posees > 1 ? 's' : ''} dans l’espace élève.`);
  if (acces) {
    details.push(`${acces} élève${acces > 1 ? 's' : ''} autorisé${acces > 1 ? 's' : ''} sur sa salle.`);
  }
  // Le point qui décide si la matinée se passe bien : un élève sans compte
  // relié a son lien, mais la porte reste fermée. Mieux vaut le voir la veille
  // que le matin même.
  if (sansCompte) {
    details.push(
      `⚠️ ${sansCompte} élève${sansCompte > 1 ? 's n’ont' : ' n’a'} pas encore relié son compte Discord : ${sansCompte > 1 ? 'ils verront leur salle sans pouvoir y entrer' : 'il verra sa salle sans pouvoir y entrer'}.`,
    );
  }

  return { ok: true, message: `Salles prêtes pour ${session.matiere}.`, details };
}

/**
 * Ouvre la salle à son élève, et garde la date de l'écriture.
 *
 * Trois issues, et elles comptent toutes les trois :
 *   · `pose`        — l'élève peut entrer ;
 *   · `sans-compte` — il n'a pas relié son compte Discord ; sa salle existe,
 *                     son lien s'affiche, mais elle lui restera fermée ;
 *   · `deja`        — c'était déjà fait, ou l'autorisation est née avec la salle.
 */
async function assurerAcces(
  eleve: InscriptionSalle,
  salonId: string,
  neeAvecLautorisation: boolean,
): Promise<'pose' | 'sans-compte' | 'deja' | 'echec'> {
  if (!eleve.discord_user_id) return 'sans-compte';
  if (eleve.discord_acces_pose_le && !neeAvecLautorisation) return 'deja';

  if (!neeAvecLautorisation) {
    const r = await ouvrirSalonA(salonId, eleve.discord_user_id);
    if (!r.ok) {
      console.error(`⚠️ Accès non posé pour ${eleve.nom} :`, r.erreur);
      return 'echec';
    }
  }

  const { error } = await crmAdmin()
    .from('inscriptions')
    .update({ discord_acces_pose_le: new Date().toISOString() })
    .eq('id', eleve.id);
  // La colonne manque (script 46) : l'autorisation Discord, elle, est bien
  // posée. On ne fait pas échouer la préparation pour une date non écrite.
  if (error) console.error('⚠️ Date d’accès non écrite :', error.message);
  return 'pose';
}

/**
 * Rattache une salle à une inscription.
 *
 * Renvoie `false` au lieu de lever : une écriture refusée (script 45 pas encore
 * passé, par exemple) ne doit pas annuler des salles déjà créées sur Discord.
 * L'écran affichera simplement « lien non déposé », ce qui est la vérité.
 */
async function noterSalonEleve(
  inscriptionId: string,
  salonId: string,
  salonNom: string,
): Promise<boolean> {
  const { error } = await crmAdmin()
    .from('inscriptions')
    .update({
      discord_salon_id: salonId,
      discord_salon_nom: salonNom,
      discord_salon_pose_le: new Date().toISOString(),
    })
    .eq('id', inscriptionId);
  if (error) console.error('⚠️ Lien Discord non déposé :', error.message);
  return !error;
}

/** Note la catégorie sur la session — le lien remis au professeur. */
async function noterCategorie(sessionId: string, categorieId: string): Promise<void> {
  const { error } = await crmAdmin()
    .from('sessions_bacs_blancs')
    .update({ discord_categorie_id: categorieId })
    .eq('id', sessionId);
  if (error) console.error('⚠️ Catégorie Discord non notée :', error.message);
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
