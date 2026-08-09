/**
 * Contrôle de la configuration Discord.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * Pourquoi ce module existe : les secrets Discord sont marqués « Sensitive »
 * dans Vercel, donc illisibles hors de la fonction serveur — impossible de
 * tester la configuration depuis un poste de travail. Le seul endroit d'où
 * l'on peut dire honnêtement « ça marche » est le serveur lui-même. C'est ici.
 *
 * Chaque contrôle est indépendant et explique quoi faire s'il échoue : la page
 * d'administration doit permettre de corriger sans revenir demander.
 *
 * Le dernier contrôle crée réellement un salon vocal privé puis le supprime.
 * C'est le seul moyen de prouver que la chaîne complète fonctionne — créer,
 * poser les serrures, supprimer — plutôt que de la supposer.
 */
import {
  CLIENT_ID,
  GUILD_ID,
  PERM,
  PERMISSIONS_REQUISES,
  ROLE_PROF_ID,
  ROLE_STAFF_ID,
  SALON_TEST,
  TYPE_SALON,
  CIBLE_OVERWRITE,
  discordManquant,
} from './config';
import {
  discord,
  verifierSecretApplication,
  type MembreDiscord,
  type RoleDiscord,
  type SalonDiscord,
} from './api';

export type EtatControle = 'ok' | 'echec' | 'alerte' | 'ignore';

export type Controle = {
  cle: string;
  libelle: string;
  etat: EtatControle;
  detail: string;
  /** Quoi faire pour corriger — vide si le contrôle passe. */
  remede?: string;
};

export type RapportVerification = {
  configure: boolean;
  manquants: string[];
  controles: Controle[];
  /** Vrai si aucun contrôle n'est en échec. */
  pret: boolean;
  /** Nom du serveur Discord tel que Discord le renvoie. */
  serveur: string | null;
  verifieLe: string;
};

const sansAccent = (s: string) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/**
 * Lance tous les contrôles. `avecEcriture = false` saute le salon de test :
 * utile pour un rafraîchissement fréquent qui ne doit rien créer.
 */
export async function verifierDiscord(avecEcriture = true): Promise<RapportVerification> {
  const controles: Controle[] = [];
  const manquants = discordManquant();
  const verifieLe = new Date().toISOString();

  const ajouter = (c: Controle) => controles.push(c);
  const rapport = (serveur: string | null): RapportVerification => ({
    configure: manquants.length === 0,
    manquants,
    controles,
    pret: controles.every((c) => c.etat !== 'echec'),
    serveur,
    verifieLe,
  });

  // --- 1. Les six variables ------------------------------------------
  if (manquants.length) {
    ajouter({
      cle: 'variables',
      libelle: 'Variables d’environnement',
      etat: 'echec',
      detail: `Manquantes : ${manquants.join(', ')}.`,
      remede:
        'Vercel → Settings → Environment Variables. Cocher Production ET Preview, puis redéployer.',
    });
    return rapport(null);
  }
  ajouter({
    cle: 'variables',
    libelle: 'Variables d’environnement',
    etat: 'ok',
    detail: 'Les six variables Discord sont présentes.',
  });

  // --- 2. Le token du bot --------------------------------------------
  const moi = await discord<{ id: string; username: string }>('/users/@me');
  if (!moi.ok || !moi.corps) {
    ajouter({
      cle: 'token',
      libelle: 'Token du bot',
      etat: 'echec',
      detail: moi.erreur ?? 'Discord n’a pas répondu.',
      remede:
        'Portail développeur → Bot → « Reset Token », puis remplacer DISCORD_BOT_TOKEN dans Vercel et redéployer.',
    });
    return rapport(null);
  }
  const botId = moi.corps.id;
  ajouter({
    cle: 'token',
    libelle: 'Token du bot',
    etat: 'ok',
    detail: `Valide — bot « ${moi.corps.username} ».`,
  });

  // --- 3. L'identifiant du client correspond-il au bot ? --------------
  ajouter(
    botId === CLIENT_ID
      ? {
          cle: 'client_id',
          libelle: 'Identifiant du client',
          etat: 'ok',
          detail: 'Correspond bien à l’application du bot.',
        }
      : {
          cle: 'client_id',
          libelle: 'Identifiant du client',
          etat: 'echec',
          detail: 'DISCORD_CLIENT_ID ne correspond pas à l’identifiant du bot.',
          remede:
            'Ce sont deux applications différentes. Portail développeur → General Information → copier « Application ID » de l’application qui porte CE bot.',
        },
  );

  // --- 4. La clé secrète ---------------------------------------------
  const secret = await verifierSecretApplication();
  ajouter(
    secret.ok
      ? {
          cle: 'client_secret',
          libelle: 'Clé secrète du client',
          etat: 'ok',
          detail: 'Acceptée par Discord — la connexion des comptes fonctionnera.',
        }
      : {
          cle: 'client_secret',
          libelle: 'Clé secrète du client',
          etat: 'echec',
          detail: secret.erreur ?? 'Refusée par Discord.',
          remede:
            'Portail développeur → OAuth2 → « Réinitialiser la clé secrète », puis remplacer DISCORD_CLIENT_SECRET dans Vercel et redéployer.',
        },
  );

  // --- 5. Le bot est-il sur le serveur ? ------------------------------
  const guilde = await discord<{ id: string; name: string }>(`/guilds/${GUILD_ID}`);
  if (!guilde.ok || !guilde.corps) {
    ajouter({
      cle: 'serveur',
      libelle: 'Serveur Discord',
      etat: 'echec',
      detail:
        guilde.statut === 404
          ? 'Serveur introuvable : DISCORD_GUILD_ID est erroné, ou le bot n’a jamais été invité.'
          : (guilde.erreur ?? 'Discord n’a pas répondu.'),
      remede:
        'Vérifier DISCORD_GUILD_ID (clic droit sur le serveur → « Copier l’identifiant du serveur »), puis réinviter le bot avec l’URL d’invitation.',
    });
    return rapport(null);
  }
  const serveur = guilde.corps.name;
  ajouter({
    cle: 'serveur',
    libelle: 'Serveur Discord',
    etat: 'ok',
    detail: `Le bot est membre de « ${serveur} ».`,
  });

  // --- 6. Permissions et hiérarchie ----------------------------------
  const [roles, membre] = await Promise.all([
    discord<RoleDiscord[]>(`/guilds/${GUILD_ID}/roles`),
    discord<MembreDiscord>(`/guilds/${GUILD_ID}/members/${botId}`),
  ]);

  let positionBot = 0;

  if (!roles.ok || !Array.isArray(roles.corps) || !membre.ok || !membre.corps) {
    ajouter({
      cle: 'permissions',
      libelle: 'Permissions du bot',
      etat: 'echec',
      detail: roles.erreur ?? membre.erreur ?? 'Lecture des rôles impossible.',
      remede: 'Vérifier que le bot est toujours présent sur le serveur.',
    });
  } else {
    const tousRoles = roles.corps;
    const sesRoles = tousRoles.filter((r) => membre.corps!.roles.includes(r.id));
    const everyone = tousRoles.find((r) => r.id === GUILD_ID);
    positionBot = sesRoles.reduce((max, r) => Math.max(max, r.position), 0);

    let permissions = BigInt(everyone?.permissions ?? '0');
    for (const r of sesRoles) permissions |= BigInt(r.permissions);

    const absentes = PERMISSIONS_REQUISES.filter((p) => !(permissions & p.bit));
    ajouter(
      absentes.length === 0
        ? {
            cle: 'permissions',
            libelle: 'Permissions du bot',
            etat: 'ok',
            detail: 'Les six permissions nécessaires sont accordées.',
          }
        : {
            cle: 'permissions',
            libelle: 'Permissions du bot',
            etat: 'echec',
            detail: `Manquantes : ${absentes.map((p) => p.nom).join(', ')}.`,
            remede:
              'Réinviter le bot avec l’URL d’invitation (elle contient les bonnes permissions), ou les ajouter à son rôle dans Paramètres du serveur → Rôles.',
          },
    );

    if (permissions & PERM.ADMINISTRATOR) {
      ajouter({
        cle: 'administrateur',
        libelle: 'Permission Administrateur',
        etat: 'alerte',
        detail: 'Le bot possède la permission Administrateur.',
        remede:
          'Elle n’est pas nécessaire : six permissions suffisent. La retirer réduit les dégâts possibles en cas de fuite du token.',
      });
    }

    // Rôle « Équipe Matinées »
    const staff = tousRoles.find((r) => r.id === ROLE_STAFF_ID);
    ajouter(
      staff
        ? {
            cle: 'role_staff',
            libelle: 'Rôle Équipe Matinées',
            etat: 'ok',
            detail: `Trouvé : « ${staff.name} ».`,
          }
        : {
            cle: 'role_staff',
            libelle: 'Rôle Équipe Matinées',
            etat: 'echec',
            detail: 'DISCORD_ROLE_STAFF_ID ne correspond à aucun rôle du serveur.',
            remede:
              'Paramètres du serveur → Rôles → clic droit sur « Équipe Matinées » → « Copier l’identifiant du rôle ».',
          },
    );

    // Rôle « Prof » + hiérarchie : le bot doit être AU-DESSUS pour l'attribuer.
    const prof = tousRoles.find((r) => r.id === ROLE_PROF_ID);
    if (!prof) {
      ajouter({
        cle: 'role_prof',
        libelle: 'Rôle Prof',
        etat: 'echec',
        detail: 'DISCORD_ROLE_PROF_ID ne correspond à aucun rôle du serveur.',
        remede:
          'Paramètres du serveur → Rôles → clic droit sur « Prof » → « Copier l’identifiant du rôle ».',
      });
    } else if (prof.position >= positionBot) {
      ajouter({
        cle: 'role_prof',
        libelle: 'Rôle Prof',
        etat: 'echec',
        detail: `Le rôle « ${prof.name} » est au-dessus du rôle du bot dans la hiérarchie : le bot ne pourra pas l’attribuer aux professeurs.`,
        remede:
          'Paramètres du serveur → Rôles → faire glisser le rôle du bot AU-DESSUS de « Prof ».',
      });
    } else {
      ajouter({
        cle: 'role_prof',
        libelle: 'Rôle Prof',
        etat: 'ok',
        detail: `Trouvé « ${prof.name} », et le bot est assez haut pour l’attribuer.`,
      });
    }
  }

  // --- 7. Les salons permanents --------------------------------------
  const salons = await discord<SalonDiscord[]>(`/guilds/${GUILD_ID}/channels`);
  if (!salons.ok || !Array.isArray(salons.corps)) {
    ajouter({
      cle: 'salons',
      libelle: 'Salons permanents',
      etat: 'alerte',
      detail: salons.erreur ?? 'Lecture des salons impossible.',
    });
  } else {
    const categories = salons.corps.filter((c) => c.type === TYPE_SALON.CATEGORIE);
    const equipe = categories.find((c) => sansAccent(c.name).includes('EQUIPE'));
    const accueil = categories.find((c) => sansAccent(c.name).includes('ACCUEIL'));

    if (!equipe) {
      ajouter({
        cle: 'categorie_equipe',
        libelle: 'Zone ÉQUIPE',
        etat: 'alerte',
        detail: 'Aucune catégorie « ÉQUIPE » sur le serveur.',
        remede:
          'Discord → clic droit dans la liste des salons → « Créer une catégorie » → nom ÉQUIPE → activer « Catégorie privée » → cocher Prof et Équipe Matinées.',
      });
    } else {
      const refus = equipe.permission_overwrites?.find((o) => o.id === GUILD_ID);
      const cachee = refus ? Boolean(BigInt(refus.deny) & PERM.VIEW_CHANNEL) : false;
      const dedans = salons.corps.filter((c) => c.parent_id === equipe.id);
      ajouter(
        cachee
          ? {
              cle: 'categorie_equipe',
              libelle: 'Zone ÉQUIPE',
              etat: 'ok',
              detail: `Privée et invisible pour les élèves — ${dedans.length} salon(s) : ${dedans.map((c) => c.name).join(', ') || 'aucun'}.`,
            }
          : {
              cle: 'categorie_equipe',
              libelle: 'Zone ÉQUIPE',
              etat: 'echec',
              detail: 'La catégorie ÉQUIPE existe mais elle est VISIBLE par tout le monde, élèves compris.',
              remede:
                'Clic droit sur la catégorie → « Modifier la catégorie » → Permissions → retirer « Voir les salons » à @everyone.',
            },
      );
    }

    ajouter(
      accueil
        ? { cle: 'categorie_accueil', libelle: 'Zone ACCUEIL', etat: 'ok', detail: 'Présente.' }
        : {
            cle: 'categorie_accueil',
            libelle: 'Zone ACCUEIL',
            etat: 'alerte',
            detail: 'Aucune catégorie « ACCUEIL ».',
            remede: 'Facultatif, mais c’est la seule chose qu’un élève voit en dehors de sa salle.',
          },
    );

    // Un salon de test oublié par une vérification précédente.
    const orphelin = salons.corps.find((c) => c.name === SALON_TEST);
    if (orphelin) {
      ajouter({
        cle: 'salon_test_orphelin',
        libelle: 'Salon de test résiduel',
        etat: 'alerte',
        detail: `Un salon « ${SALON_TEST} » traîne encore sur le serveur.`,
        remede: 'Relancer la vérification complète le supprimera, ou le retirer à la main dans Discord.',
      });
    }
  }

  // --- 8. Épreuve de vérité : créer, verrouiller, supprimer ----------
  if (!avecEcriture) {
    ajouter({
      cle: 'creation',
      libelle: 'Création d’un salon de test',
      etat: 'ignore',
      detail: 'Non exécutée (vérification en lecture seule).',
    });
    return rapport(serveur);
  }

  const creation = await discord<SalonDiscord>(`/guilds/${GUILD_ID}/channels`, {
    methode: 'POST',
    motifAudit: 'Vérification technique des Matinées du Bac',
    corps: {
      name: SALON_TEST,
      type: TYPE_SALON.VOCAL,
      permission_overwrites: [
        {
          id: GUILD_ID,
          type: CIBLE_OVERWRITE.ROLE,
          deny: String(PERM.VIEW_CHANNEL | PERM.CONNECT),
        },
        ...(ROLE_STAFF_ID
          ? [
              {
                id: ROLE_STAFF_ID,
                type: CIBLE_OVERWRITE.ROLE,
                allow: String(PERM.VIEW_CHANNEL | PERM.CONNECT),
              },
            ]
          : []),
      ],
    },
  });

  if (!creation.ok || !creation.corps) {
    ajouter({
      cle: 'creation',
      libelle: 'Création d’un salon de test',
      etat: 'echec',
      detail: creation.erreur ?? 'Refusée par Discord.',
      remede:
        'Vérifier « Gérer les salons » et « Gérer les rôles », et que le rôle du bot est assez haut dans la hiérarchie.',
    });
    return rapport(serveur);
  }

  const salonTest = creation.corps;
  const refusEveryone = salonTest.permission_overwrites?.find((o) => o.id === GUILD_ID);
  const bienPrive =
    refusEveryone !== undefined &&
    Boolean(BigInt(refusEveryone.deny) & PERM.VIEW_CHANNEL) &&
    Boolean(BigInt(refusEveryone.deny) & PERM.CONNECT);
  const autorisationStaff = salonTest.permission_overwrites?.find((o) => o.id === ROLE_STAFF_ID);

  ajouter({
    cle: 'creation',
    libelle: 'Création d’un salon de test',
    etat: 'ok',
    detail: 'Un salon vocal a bien été créé.',
  });

  ajouter(
    bienPrive
      ? {
          cle: 'confidentialite',
          libelle: 'Confidentialité du salon',
          etat: 'ok',
          detail: 'Invisible et injoignable pour tous — c’est ce qui isole les élèves entre eux.',
        }
      : {
          cle: 'confidentialite',
          libelle: 'Confidentialité du salon',
          etat: 'echec',
          detail: 'Le salon a été créé mais les refus posés sur @everyone ne sont pas appliqués.',
          remede: 'Vérifier la permission « Gérer les rôles » du bot.',
        },
  );

  ajouter(
    autorisationStaff && BigInt(autorisationStaff.allow) & PERM.CONNECT
      ? {
          cle: 'autorisation',
          libelle: 'Autorisation individuelle',
          etat: 'ok',
          detail: 'Le bot sait accorder « voir + rejoindre » à une personne précise.',
        }
      : {
          cle: 'autorisation',
          libelle: 'Autorisation individuelle',
          etat: 'echec',
          detail: 'Le bot n’a pas pu accorder l’accès au rôle Équipe Matinées.',
          remede:
            'Il manque probablement « Se connecter » au bot : Discord refuse d’accorder une permission qu’il ne possède pas.',
        },
  );

  const suppression = await discord(`/channels/${salonTest.id}`, {
    methode: 'DELETE',
    motifAudit: 'Fin de la vérification technique',
  });
  ajouter(
    suppression.ok
      ? {
          cle: 'suppression',
          libelle: 'Suppression du salon de test',
          etat: 'ok',
          detail: 'Supprimé — rien ne reste sur le serveur.',
        }
      : {
          cle: 'suppression',
          libelle: 'Suppression du salon de test',
          etat: 'echec',
          detail: suppression.erreur ?? 'Refusée par Discord.',
          remede: `Supprimer « ${SALON_TEST} » à la main dans Discord, et vérifier « Gérer les salons ».`,
        },
  );

  return rapport(serveur);
}
