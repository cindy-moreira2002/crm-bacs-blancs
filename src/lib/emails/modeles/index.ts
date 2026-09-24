/**
 * Les modèles d'e-mails — TOUS les textes envoyés par le site sont ici.
 *
 * Pourquoi des modèles en code plutôt que des modèles Brevo :
 *  - ils sont versionnés (on voit qui a changé quel mot, et quand) ;
 *  - ils sont testables hors ligne, sans compte Brevo ni envoi réel ;
 *  - une variable obligatoire manquante BLOQUE l'envoi au lieu d'expédier
 *    « Bonjour undefined » ou un bouton cassé ;
 *  - pour changer un texte, il n'y a qu'un seul fichier à ouvrir : celui-ci.
 *
 * Chaque modèle déclare les variables dont il a besoin (`requises`). Le
 * moteur vérifie avant d'envoyer : s'il en manque une, le message part en
 * statut « bloqué » et l'administration affiche laquelle.
 */
import type { CategorieEmail, RoleDestinataire, TypeEmail } from '../config';
import { appliquerVariables } from '../textes';
import { SUPPORT_EMAIL } from '../config';
import {
  Contenu,
  PageOptions,
  echapper,
  rendreHtml,
  rendreTexte,
} from './mise-en-page';

export type Variables = Record<string, string>;

/** Accès aux variables depuis un modèle. */
export type Aide = {
  /** Valeur échappée, à insérer dans du HTML. */
  t: (cle: string) => string;
  /** Valeur brute : objets d'e-mail et adresses de boutons. */
  r: (cle: string) => string;
  /** La variable est-elle présente et non vide ? */
  a: (cle: string) => boolean;
};

export type Modele = {
  type: TypeEmail;
  categorie: CategorieEmail;
  role: RoleDestinataire;
  /** Sans ces variables, on n'envoie pas. */
  requises: string[];
  sujet: (h: Aide) => string;
  contenu: (h: Aide) => Contenu;
};

function aide(v: Variables): Aide {
  return {
    t: (c) => echapper(v[c] ?? ''),
    r: (c) => v[c] ?? '',
    a: (c) => Boolean((v[c] ?? '').trim()),
  };
}

// --- Briques de texte réutilisées ------------------------------------

const MATERIEL = [
  'Un ordinateur avec caméra et micro, et une connexion stable',
  'De quoi écrire : feuilles, stylos, brouillon',
  'Ton téléphone si tu utilises la copie numérique',
  'Une pièce au calme, comme le jour J',
];

function ficheSession(h: Aide): Contenu['blocs'][number] {
  const lignes: [string, string][] = [
    ['Matière', h.t('subject_name')],
    ['Date', h.t('session_date')],
    ['Début', h.t('start_time')],
  ];
  if (h.a('connection_time')) lignes.push(['Connexion conseillée', h.t('connection_time')]);
  if (h.a('teacher_name')) lignes.push(['Professeur', h.t('teacher_name')]);
  return { type: 'fiche', lignes };
}

const CONSIGNE_LIEN =
  'Ce lien est <strong>personnel</strong> : il ouvre ton salon, rien que le tien. Ne le partage avec personne.';

// --- A. Inscription ---------------------------------------------------

const preinscription_recue: Modele = {
  type: 'preinscription_recue',
  categorie: 'transactional',
  role: 'prospect',
  requises: ['first_name', 'inscription_url'],
  sujet: (h) =>
    h.a('subject_name')
      ? `Ta demande pour le bac blanc de ${h.r('subject_name')} est bien arrivée`
      : 'Ta demande est bien arrivée',
  contenu: (h) => ({
    titre: 'On a bien reçu ta demande 👋',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: h.a('subject_name')
          ? `Ta demande pour le bac blanc de <strong>${h.t('subject_name')}</strong> est enregistrée. Rien n'est encore réservé : il te reste une étape.`
          : 'Ta demande est enregistrée. Rien n’est encore réservé : il te reste une étape.',
      },
      ...(h.a('session_date')
        ? [{ type: 'fiche' as const, lignes: [['Date envisagée', h.t('session_date')]] as [string, string][] }]
        : []),
      {
        type: 'liste',
        items: [
          'Tu finalises ton inscription en 2 minutes avec le bouton ci-dessous',
          'Tu reçois la confirmation, puis le lien de ton salon visio',
          'Le jour J, tu composes depuis chez toi et un professeur t’accompagne',
        ],
      },
    ],
    bouton: { libelle: 'Finaliser mon inscription', url: h.r('inscription_url') },
    apres: [
      {
        type: 'petit',
        texte: 'Tu n’es engagé·e à rien tant que l’inscription n’est pas finalisée.',
      },
    ],
  }),
};

/**
 * Le cadre de virement, identique dans la confirmation et dans le message
 * d'expiration : titulaire, IBAN, BIC, montant et surtout la référence à
 * recopier — sans elle, un virement arrive sans qu'on sache de quel élève il
 * s'agit. Rien ne s'affiche tant que l'IBAN n'est pas renseigné dans
 * /direction/emails : mieux vaut dire qu'on l'envoie que montrer un cadre vide.
 */
function cadreVirement(h: Aide): Contenu['blocs'] {
  if (!h.a('payment_iban')) {
    return [
      {
        type: 'paragraphe',
        texte:
          'Les coordonnées bancaires arrivent dans un message séparé, dans les minutes qui viennent.',
      },
    ];
  }
  const lignes: [string, string][] = [];
  if (h.a('payment_holder')) lignes.push(['Titulaire', h.t('payment_holder')]);
  lignes.push(['IBAN', `<span style="font-family:monospace">${h.t('payment_iban')}</span>`]);
  if (h.a('payment_bic')) lignes.push(['BIC', h.t('payment_bic')]);
  if (h.a('amount')) lignes.push(['Montant', `${h.t('amount')} €`]);
  lignes.push(['Référence à indiquer', `<strong>${h.t('payment_reference')}</strong>`]);
  const blocs: Contenu['blocs'] = [{ type: 'fiche', lignes }];
  if (h.a('payment_instructions')) {
    blocs.push({ type: 'petit', texte: h.t('payment_instructions') });
  }
  return blocs;
}

/**
 * L'encadré du salon d'appel — une salle vocale Discord, attribuée à cet
 * élève et à lui seul. Il n'existe pas encore le jour de l'inscription : la
 * salle est créée quand le bac blanc se prépare. Plutôt qu'un bouton mort, on
 * dit alors quand il arrivera et où le retrouver.
 */
function cadreSalon(h: Aide): Contenu['blocs'][number] {
  if (h.a('video_room_url')) {
    return {
      type: 'encadre',
      ton: 'neutre',
      titre: '🎧 Ton salon d’appel (Discord)',
      lignes: [
        `<a href="${h.r('video_room_url')}" style="font-weight:700">Rejoindre mon salon →</a>`,
        'C’est là que ton professeur te retrouve le jour de l’épreuve. Une salle vocale, rien qu’à toi.',
        CONSIGNE_LIEN,
        'Tu retrouveras toujours ce lien dans ton espace élève — inutile de garder cet e-mail.',
      ],
    };
  }
  return {
    type: 'encadre',
    ton: 'neutre',
    titre: '🎧 Ton salon d’appel (Discord)',
    lignes: [
      'Ta salle vocale personnelle sera créée quelques jours avant l’épreuve.',
      'Tu recevras son lien par e-mail, et il apparaîtra <strong>dans ton espace élève</strong> : c’est là qu’il faudra aller le chercher le jour J.',
    ],
  };
}

/**
 * L'encadré de l'espace élève. C'est la chose la plus importante du message :
 * tout le reste (salon, sujet, copie, correction) s'y retrouve, donc un élève
 * qui ne retient qu'une adresse doit retenir celle-là.
 */
function cadreEspaceEleve(h: Aide): Contenu['blocs'][number] {
  return {
    type: 'encadre',
    ton: 'succes',
    titre: '🏠 Ton espace élève — tout est là',
    lignes: [
      `<a href="${h.r('student_space_url')}" style="font-weight:700">Ouvrir mon espace élève →</a>`,
      'Tu y retrouves, à tout moment :',
      '• <strong>le sujet de l’épreuve</strong>, qui s’ouvre 10 minutes avant le début',
      '• <strong>le lien de ton salon d’appel</strong>',
      '• <strong>ta copie</strong> et de quoi la rendre',
      '• <strong>ton dossier de correction</strong> une fois l’épreuve corrigée',
      '• tes anciens bacs blancs et l’évolution de tes notes',
      'Tu te connectes avec ton adresse e-mail : un code à 6 caractères t’est envoyé, il n’y a pas de mot de passe à retenir.',
    ],
  };
}

/** Le bloc rouge : ce que la famille perd si elle ne règle pas. */
function alertePaiement(h: Aide): Contenu['blocs'][number] {
  const minutes = h.a('payment_deadline_minutes') ? h.t('payment_deadline_minutes') : '10';
  return {
    type: 'encadre',
    ton: 'alerte',
    titre: '⚠️ Paiement en attente — la place n’est pas encore réservée',
    lignes: [
      '<strong>Tant que vous n’aurez pas payé et validé le paiement, votre inscription ne sera pas enregistrée.</strong>',
      `Vous avez <strong>${minutes} minutes</strong> pour effectuer le virement. Passé ce délai, l’inscription est annulée et la place est rendue à un autre élève.`,
    ],
  };
}

const inscription_confirmee: Modele = {
  type: 'inscription_confirmee',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'student_space_url'],
  sujet: (h) =>
    h.r('payment_status') === 'paye' || h.r('payment_status') === 'offert'
      ? `Inscription confirmée — bac blanc de ${h.r('subject_name')}`
      : `⚠️ Inscription en attente de paiement — bac blanc de ${h.r('subject_name')}`,
  contenu: (h) => {
    const regle = h.r('payment_status') === 'paye' || h.r('payment_status') === 'offert';
    return {
      titre: regle ? 'Inscription confirmée 🎉' : 'Inscription confirmée — en attente de paiement',
      blocs: [
        // Le bloc rouge passe AVANT tout le reste : c'est la seule chose à
        // faire dans l'heure, et un lecteur pressé ne lit que le haut.
        ...(regle ? [] : [alertePaiement(h)]),
        { type: 'paragraphe' as const, texte: `Bonjour ${h.t('first_name')},` },
        {
          type: 'paragraphe' as const,
          texte: `L'inscription au <strong>bac blanc de ${h.t('subject_name')}</strong> est bien enregistrée.`,
        },
        h.a('session_date')
          ? ficheSession(h)
          : {
              type: 'encadre' as const,
              ton: 'attention' as const,
              lignes: ['La date exacte sera confirmée très bientôt — tu recevras un e-mail dès qu’elle est fixée.'],
            },
        ...(regle
          ? ([
              {
                type: 'encadre' as const,
                ton: 'succes' as const,
                titre: `Paiement : ${h.t('payment_status_label')}`,
                lignes: ['Tout est réglé, il n’y a rien à faire de ce côté.'],
              },
            ] as Contenu['blocs'])
          : ([
              { type: 'paragraphe' as const, texte: '<strong>Comment régler — par virement :</strong>' },
              ...cadreVirement(h),
            ] as Contenu['blocs'])),
        // Deux endroits distincts, deux encadrés distincts : le salon d'appel
        // n'est PAS l'espace élève, et les confondre fait tourner en rond le
        // matin de l'épreuve.
        cadreSalon(h),
        cadreEspaceEleve(h),
        {
          type: 'paragraphe' as const,
          texte: 'Comment se passe la matinée :',
        },
        {
          type: 'liste' as const,
          items: [
            'Tu composes <strong>depuis chez toi</strong>, dans les conditions de l’examen',
            'Le sujet s’ouvre dans ton espace élève, <strong>10 minutes avant le début</strong>',
            'Ton professeur te rejoint dans ton salon d’appel et reste joignable pendant l’épreuve',
            'Après l’épreuve, tu déposes ta copie et tu reçois un <strong>dossier de correction complet</strong>',
          ],
        },
      ],
      bouton: { libelle: 'Ouvrir mon espace élève', url: h.r('student_space_url') },
      apres: [
        {
          type: 'petit',
          texte: 'Tes parents reçoivent ce message en copie.',
        },
        ...(regle
          ? ([
              {
                type: 'petit' as const,
                texte: 'Prochaine étape : les informations pratiques, quelques jours avant l’épreuve.',
              },
            ] as Contenu['blocs'])
          : []),
      ],
    };
  },
};

/**
 * Le délai est passé sans règlement. Adressé au PARENT et à lui seul : c'est
 * lui qui paie, et annoncer l'annulation à l'élève seul ne servirait à rien.
 */
const inscription_expiree: Modele = {
  type: 'inscription_expiree',
  categorie: 'transactional',
  role: 'parent',
  requises: ['student_name', 'subject_name', 'inscription_url'],
  sujet: (h) => `Inscription annulée faute de règlement — ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Inscription annulée — le règlement n’est pas arrivé',
    blocs: [
      {
        type: 'encadre',
        ton: 'alerte',
        titre: '⚠️ La place n’a pas été retenue',
        lignes: [
          `Une inscription au bac blanc de <strong>${h.t('subject_name')}</strong> a été enregistrée pour <strong>${h.t('student_name')}</strong>, mais le règlement n’a pas été effectué dans le délai imparti.`,
          '<strong>L’inscription a donc été annulée.</strong>',
        ],
      },
      { type: 'paragraphe', texte: 'Bonjour,' },
      {
        type: 'paragraphe',
        texte:
          'Rien n’est perdu : la place peut être reprise dès maintenant, dans la limite des places encore disponibles. Il suffit de refaire l’inscription et de procéder au règlement.',
      },
      ...(h.a('session_date')
        ? ([
            {
              type: 'fiche' as const,
              lignes: [
                ['Élève', h.t('student_name')],
                ['Matière', h.t('subject_name')],
                ['Date envisagée', h.t('session_date')],
              ] as [string, string][],
            },
          ] as Contenu['blocs'])
        : []),
      { type: 'paragraphe', texte: '<strong>Pour régler par virement :</strong>' },
      ...cadreVirement(h),
      {
        type: 'petit',
        texte:
          'Si le virement a déjà été effectué, ce message s’est croisé avec lui : répondez simplement à cet e-mail et nous rétablissons l’inscription.',
      },
    ],
    bouton: { libelle: 'Reprendre l’inscription', url: h.r('inscription_url') },
  }),
};

const paiement_confirme: Modele = {
  type: 'paiement_confirme',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'student_space_url'],
  sujet: (h) => `Paiement reçu — bac blanc de ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Paiement bien reçu ✅',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      { type: 'paragraphe', texte: 'Le règlement est enregistré. Merci !' },
      {
        type: 'fiche',
        lignes: [
          ['Matière', h.t('subject_name')],
          ...(h.a('session_date') ? ([['Session', h.t('session_date')]] as [string, string][]) : []),
          ...(h.a('amount') ? ([['Montant', `${h.t('amount')} €`]] as [string, string][]) : []),
          ...(h.a('payment_reference')
            ? ([['Référence', h.t('payment_reference')]] as [string, string][])
            : []),
          ['Référence d’inscription', h.t('inscription_ref')],
        ],
      },
      {
        type: 'paragraphe',
        texte: 'Ta place est définitivement réservée. La suite arrive par e-mail : informations pratiques, puis lien de ton salon visio.',
      },
    ],
    bouton: { libelle: 'Voir mon espace élève', url: h.r('student_space_url') },
  }),
};

const paiement_attente: Modele = {
  type: 'paiement_attente',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'student_space_url'],
  sujet: (h) => `Il manque une étape pour ton bac blanc de ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Ton inscription n’est pas encore finalisée',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Ton inscription au <strong>bac blanc de ${h.t('subject_name')}</strong> est bien enregistrée, mais le règlement n'est pas encore arrivé. Tant qu'il manque, ta place n'est pas garantie.`,
      },
      ...(h.a('session_date')
        ? [{ type: 'fiche' as const, lignes: [['Session concernée', h.t('session_date')]] as [string, string][] }]
        : []),
      {
        type: 'encadre',
        titre: 'Comment régler',
        ton: 'attention',
        lignes: [
          h.a('payment_instructions')
            ? h.t('payment_instructions')
            : `Réponds simplement à cet e-mail et on t'envoie les informations de virement.`,
          h.a('amount') ? `Montant : <strong>${h.t('amount')} €</strong>` : '',
          // La référence est ce qui permet de reconnaître le virement tout
          // seul à l'arrivée : elle mérite d'être bien visible.
          h.a('payment_reference')
            ? `Référence à indiquer dans le virement : <strong>${h.t('payment_reference')}</strong>`
            : '',
        ].filter(Boolean),
      },
      {
        type: 'paragraphe',
        texte: 'Un souci, un imprévu, une question ? Réponds à ce message, on trouve une solution.',
      },
    ],
    bouton: { libelle: 'Voir mon inscription', url: h.r('student_space_url') },
  }),
};

/**
 * Facture — déclenchée par le classeur de suivi financier, jamais par le
 * planificateur. Le PDF vit dans Drive : on envoie son lien plutôt qu'une
 * pièce jointe, ce qui évite les blocages de messagerie et garde la facture
 * accessible même des mois plus tard.
 */
const facture_disponible: Modele = {
  type: 'facture_disponible',
  categorie: 'transactional',
  role: 'parent',
  requises: ['invoice_number', 'invoice_url'],
  sujet: (h) => `Votre facture ${h.r('invoice_number')} — Les Matinées du Bac`,
  contenu: (h) => ({
    titre: 'Votre facture',
    blocs: [
      {
        type: 'paragraphe',
        texte: h.a('first_name') ? `Bonjour ${h.t('first_name')},` : 'Bonjour,',
      },
      {
        type: 'paragraphe',
        texte:
          'Merci pour votre confiance. Vous trouverez ci-dessous votre facture, ' +
          'à conserver.',
      },
      {
        type: 'fiche',
        lignes: [
          ['Numéro de facture', h.t('invoice_number')],
          ...(h.a('invoice_date') ? ([['Date', h.t('invoice_date')]] as [string, string][]) : []),
          ...(h.a('amount') ? ([['Montant', `${h.t('amount')} €`]] as [string, string][]) : []),
        ] as [string, string][],
      },
    ],
    bouton: { libelle: 'Ouvrir ma facture', url: h.r('invoice_url') },
    apres: [
      {
        type: 'petit',
        texte: `Une question sur cette facture ? Répondez simplement à ce message ou écrivez-nous à ${echapper(SUPPORT_EMAIL)}.`,
      },
    ],
  }),
};

// --- B. Avant la session ---------------------------------------------

const infos_pratiques: Modele = {
  type: 'infos_pratiques',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'session_date', 'start_time', 'student_space_url'],
  sujet: (h) => `Ton bac blanc de ${h.r('subject_name')} approche — tout ce qu'il faut savoir`,
  contenu: (h) => ({
    titre: 'Tout est prêt de notre côté 📋',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Ton bac blanc de <strong>${h.t('subject_name')}</strong> arrive. Voici comment ça va se passer.`,
      },
      ficheSession(h),
      { type: 'paragraphe', texte: '<strong>À préparer</strong>' },
      { type: 'liste', items: MATERIEL },
      { type: 'paragraphe', texte: '<strong>Le jour J</strong>' },
      {
        type: 'liste',
        items: [
          h.a('connection_time')
            ? `Connecte-toi à <strong>${h.t('connection_time')}</strong>, le temps de vérifier son et image`
            : 'Connecte-toi une quinzaine de minutes avant le début',
          'Le sujet est donné au démarrage, dans les conditions de l’examen',
          'Le professeur passe dans ton salon et reste joignable pendant toute l’épreuve',
          'À la fin, tu déposes ta copie depuis ton espace élève',
        ],
      },
      {
        type: 'encadre',
        titre: 'La copie numérique',
        lignes: [
          'Tu peux composer sur papier puis photographier ta copie, ou écrire directement depuis ton téléphone : ton espace élève t’explique les deux, avec un test à faire avant le jour J.',
        ],
      },
    ],
    bouton: { libelle: 'Ouvrir mon espace élève', url: h.r('student_space_url') },
    apres: [
      {
        type: 'petit',
        texte: `Le lien de ton salon visio arrive dans un e-mail séparé, quelques jours avant. Une question d'ici là ? Écris-nous à ${echapper(SUPPORT_EMAIL)}.`,
      },
    ],
  }),
};

const lien_visio: Modele = {
  type: 'lien_visio',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'session_date', 'start_time', 'video_room_url', 'student_space_url'],
  sujet: (h) => `Ton lien de connexion — bac blanc de ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Voici ton salon personnel 🔗',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Voici le lien de connexion pour ton bac blanc de <strong>${h.t('subject_name')}</strong>.`,
      },
      ficheSession(h),
      { type: 'encadre', ton: 'attention', lignes: [CONSIGNE_LIEN] },
    ],
    bouton: { libelle: 'Rejoindre mon salon', url: h.r('video_room_url') },
    boutonSecondaire: { libelle: 'Mon espace élève', url: h.r('student_space_url'), secondaire: true },
    apres: [
      {
        type: 'paragraphe',
        texte: 'Le salon s’ouvre une heure avant le début de l’épreuve. Avant cette heure-là, le lien ne donne encore sur rien : c’est normal.',
      },
      {
        type: 'petit',
        texte: `Un problème de connexion le jour J ? Écris à ${echapper(SUPPORT_EMAIL)}, on répond vite.`,
      },
    ],
  }),
};

const rappel_veille: Modele = {
  type: 'rappel_veille',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'start_time', 'student_space_url'],
  sujet: (h) => `C'est demain — bac blanc de ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'C’est demain 📅',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Ton bac blanc de <strong>${h.t('subject_name')}</strong> a lieu demain à <strong>${h.t('start_time')}</strong>.`,
      },
      {
        type: 'liste',
        items: [
          h.a('connection_time')
            ? `Connexion à <strong>${h.t('connection_time')}</strong>`
            : 'Connecte-toi une quinzaine de minutes avant',
          'Feuilles, stylos, brouillon prêts ce soir',
          'Micro et caméra vérifiés',
          'Téléphone chargé si tu utilises la copie numérique',
        ],
      },
      // Le code n'apparaît que s'il existe : tant que les codes d'épreuve ne
      // sont pas en service, le message est exactement celui d'avant.
      ...(h.a('exam_code')
        ? [
            {
              type: 'encadre' as const,
              titre: `🔑 Ton code pour cette épreuve : ${h.t('exam_code')}`,
              lignes: [
                'Tu le tapes <strong>une seule fois</strong>, demain, en ouvrant ta copie sur l’ordinateur où tu vas écrire.',
                'Ensuite, plus rien ne te sera demandé de la journée : tu peux fermer l’application ou éteindre ton téléphone, ta copie t’attend.',
                'Il ne marche que sur un seul ordinateur — si tu dois en changer, préviens ton professeur.',
              ],
            },
          ]
        : []),
    ],
    bouton: h.a('video_room_url')
      ? { libelle: 'Mon salon visio', url: h.r('video_room_url') }
      : { libelle: 'Mon espace élève', url: h.r('student_space_url') },
    boutonSecondaire: h.a('video_room_url')
      ? { libelle: 'Mon espace élève', url: h.r('student_space_url'), secondaire: true }
      : undefined,
    apres: [{ type: 'petit', texte: 'Repose-toi bien. Tu vas y arriver.' }],
    signature: 'Bonne préparation,',
  }),
};

const dernier_rappel: Modele = {
  type: 'dernier_rappel',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'start_time', 'student_space_url'],
  sujet: (h) => `Ça commence bientôt — ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Ça commence bientôt ⏰',
    blocs: [
      {
        type: 'paragraphe',
        texte: `${h.t('first_name')}, ton bac blanc de <strong>${h.t('subject_name')}</strong> commence à <strong>${h.t('start_time')}</strong>.`,
      },
      {
        type: 'paragraphe',
        texte: h.a('connection_time')
          ? `Connecte-toi dès <strong>${h.t('connection_time')}</strong>.`
          : 'Connecte-toi quelques minutes avant l’heure.',
      },
    ],
    bouton: h.a('video_room_url')
      ? { libelle: 'Rejoindre mon salon', url: h.r('video_room_url') }
      : { libelle: 'Mon espace élève', url: h.r('student_space_url') },
    boutonSecondaire: h.a('video_room_url')
      ? { libelle: 'Mon espace élève', url: h.r('student_space_url'), secondaire: true }
      : undefined,
    apres: [
      {
        type: 'petit',
        texte: `Un souci technique ? Écris tout de suite à ${echapper(SUPPORT_EMAIL)} — on est là.`,
      },
    ],
    signature: 'Tu assures,',
  }),
};

const session_modifiee: Modele = {
  type: 'session_modifiee',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'new_value', 'student_space_url'],
  sujet: (h) => `Changement — bac blanc de ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Un changement sur ta session ⚠️',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Ton bac blanc de <strong>${h.t('subject_name')}</strong> a été modifié. Voici ce qui change :`,
      },
      {
        type: 'encadre',
        ton: 'attention',
        lignes: [
          h.a('old_value') ? `Avant : ${h.t('old_value')}` : '',
          `<strong>Maintenant : ${h.t('new_value')}</strong>`,
        ].filter(Boolean),
      },
      {
        type: 'paragraphe',
        texte: h.a('change_reason')
          ? h.t('change_reason')
          : 'Tout le reste est inchangé : ton salon, ton espace et le déroulé de l’épreuve.',
      },
      {
        type: 'paragraphe',
        texte: 'Si cette nouvelle date ne te convient pas, réponds à cet e-mail : on te propose une autre session.',
      },
    ],
    bouton: { libelle: 'Voir ma session', url: h.r('student_space_url') },
  }),
};

const session_annulee: Modele = {
  type: 'session_annulee',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'student_space_url'],
  sujet: (h) => `Annulation — bac blanc de ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Cette session est annulée',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Le bac blanc de <strong>${h.t('subject_name')}</strong>${h.a('session_date') ? ` du ${h.t('session_date')}` : ''} est annulé. On est désolés.`,
      },
      ...(h.a('change_reason') ? [{ type: 'paragraphe' as const, texte: h.t('change_reason') }] : []),
      {
        type: 'encadre',
        lignes: [
          'Tu n’as rien à faire : les rappels et le lien de connexion de cette session sont annulés eux aussi.',
          'Si tu avais réglé cette session, on te recontacte pour la reporter ou te rembourser.',
        ],
      },
      {
        type: 'paragraphe',
        texte: 'On te propose une nouvelle date très vite. Réponds à cet e-mail si tu veux en choisir une tout de suite.',
      },
    ],
    bouton: { libelle: 'Voir les autres dates', url: h.r('student_space_url') },
  }),
};

// --- C. Après la session ---------------------------------------------

const session_terminee: Modele = {
  type: 'session_terminee',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'student_space_url'],
  sujet: (h) => `Copie bien reçue — ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Ta copie est bien arrivée ✅',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Bravo pour ce bac blanc de <strong>${h.t('subject_name')}</strong> — ta copie nous est bien parvenue.`,
      },
      {
        type: 'paragraphe',
        texte: h.a('correction_delay')
          ? `Un professeur la corrige et tu recevras ton dossier de correction sous ${h.t('correction_delay')}.`
          : 'Un professeur la corrige. Tu reçois un e-mail dès que ton dossier de correction est disponible.',
      },
    ],
    bouton: { libelle: 'Mon espace élève', url: h.r('student_space_url') },
    signature: 'Repose-toi bien,',
  }),
};

const correction_disponible: Modele = {
  type: 'correction_disponible',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'correction_url'],
  sujet: (h) => `Ta correction de ${h.r('subject_name')} est disponible`,
  contenu: (h) => ({
    titre: 'Ta correction est prête 🎉',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Ton dossier de correction pour le bac blanc de <strong>${h.t('subject_name')}</strong>${h.a('session_date') ? ` du ${h.t('session_date')}` : ''} est disponible dans ton espace.`,
      },
      ...(h.a('grade')
        ? [
            {
              type: 'encadre' as const,
              ton: 'succes' as const,
              lignes: [`Ta note : <strong>${h.t('grade')}</strong>`],
            },
          ]
        : []),
      {
        type: 'paragraphe',
        texte: 'Tu y trouveras :',
      },
      {
        type: 'liste',
        items: [
          'ta copie annotée, remarque par remarque',
          'ce qui rapporte des points et ce qui en fait perdre',
          'les conseils concrets pour la prochaine fois',
        ],
      },
      {
        type: 'paragraphe',
        texte: 'Prends le temps de la lire au calme : c’est là que se joue la progression.',
      },
    ],
    bouton: { libelle: 'Voir ma correction', url: h.r('correction_url') },
    apres: [
      {
        type: 'petit',
        texte: 'Le dossier reste accessible dans ton espace élève, à tout moment.',
      },
    ],
    signature: 'Bravo pour le travail fourni,',
  }),
};

const demande_avis: Modele = {
  type: 'demande_avis',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name'],
  sujet: () => 'Deux minutes pour nous dire ce que tu en as pensé ?',
  contenu: (h) => ({
    titre: 'Ton avis nous aide beaucoup 💬',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Tu as passé le bac blanc de <strong>${h.t('subject_name')}</strong> et reçu ta correction. Est-ce que ça t'a servi ?`,
      },
      {
        type: 'paragraphe',
        texte: 'Deux minutes de ton temps nous aident à améliorer les prochaines Matinées — et à mieux accompagner les élèves qui arrivent.',
      },
    ],
    bouton: h.a('survey_url')
      ? { libelle: 'Donner mon avis', url: h.r('survey_url') }
      : undefined,
    apres: [
      {
        type: 'paragraphe',
        texte: h.a('survey_url')
          ? 'Et si quelque chose n’a pas fonctionné, dis-le nous franchement en répondant à cet e-mail.'
          : 'Réponds simplement à cet e-mail : ce que tu as aimé, ce qui t’a manqué, ce qu’on devrait changer.',
      },
    ],
    signature: 'Merci beaucoup,',
  }),
};

// --- D. Relances commerciales ----------------------------------------

const relance_interet: Modele = {
  type: 'relance_interet',
  categorie: 'marketing',
  role: 'prospect',
  requises: ['first_name', 'inscription_url'],
  sujet: (h) =>
    h.a('subject_name')
      ? `Ta place en ${h.r('subject_name')} t'attend toujours`
      : 'Ta place t’attend toujours',
  contenu: (h) => ({
    titre: 'On garde ta place au chaud 🪑',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: h.a('subject_name')
          ? `Tu t'es intéressé·e au bac blanc de <strong>${h.t('subject_name')}</strong> sans finaliser ton inscription. Il reste des places.`
          : 'Tu t’es intéressé·e à nos bacs blancs sans finaliser ton inscription. Il reste des places.',
      },
      {
        type: 'liste',
        items: [
          'Une vraie épreuve, en visio, dans les conditions de l’examen',
          'Un professeur qui t’accompagne pendant toute la matinée',
          'Un dossier de correction personnalisé après l’épreuve',
        ],
      },
    ],
    bouton: { libelle: 'Choisir ma date', url: h.r('inscription_url') },
  }),
};

const fermeture_inscriptions: Modele = {
  type: 'fermeture_inscriptions',
  categorie: 'marketing',
  role: 'prospect',
  requises: ['first_name', 'subject_name', 'session_date', 'inscription_url'],
  sujet: (h) => `Dernières places — ${h.r('subject_name')} le ${h.r('session_date_court')}`,
  contenu: (h) => ({
    titre: 'Les inscriptions ferment bientôt ⏳',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Le bac blanc de <strong>${h.t('subject_name')}</strong> du <strong>${h.t('session_date')}</strong> approche, et les inscriptions ferment bientôt.`,
      },
      ...(h.a('places_restantes')
        ? [
            {
              type: 'encadre' as const,
              ton: 'attention' as const,
              lignes: [`Il reste <strong>${h.t('places_restantes')}</strong> places.`],
            },
          ]
        : []),
    ],
    bouton: { libelle: 'Réserver ma place', url: h.r('inscription_url') },
  }),
};

const nouvelle_session: Modele = {
  type: 'nouvelle_session',
  categorie: 'marketing',
  role: 'prospect',
  requises: ['first_name', 'subject_name', 'session_date', 'inscription_url'],
  sujet: (h) => `Nouvelle date : ${h.r('subject_name')} le ${h.r('session_date_court')}`,
  contenu: (h) => ({
    titre: 'Une nouvelle date vient d’ouvrir 📅',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `On ouvre une nouvelle Matinée : <strong>${h.t('subject_name')}</strong>, le <strong>${h.t('session_date')}</strong>${h.a('start_time') ? ` à ${h.t('start_time')}` : ''}.`,
      },
      {
        type: 'paragraphe',
        texte: 'Comme d’habitude : une épreuve en conditions réelles, un professeur avec toi toute la matinée, et un dossier de correction détaillé derrière.',
      },
    ],
    bouton: { libelle: 'Voir cette session', url: h.r('inscription_url') },
  }),
};

const retour_ancien_participant: Modele = {
  type: 'retour_ancien_participant',
  categorie: 'marketing',
  role: 'eleve',
  requises: ['first_name', 'inscription_url'],
  sujet: () => 'On remet ça ? Les prochaines Matinées du Bac',
  contenu: (h) => ({
    titre: 'Prêt·e pour la suite ? 💪',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: h.a('subject_name')
          ? `Tu as déjà passé un bac blanc de <strong>${h.t('subject_name')}</strong> avec nous. La suite du programme est ouverte.`
          : 'Tu as déjà passé un bac blanc avec nous. La suite du programme est ouverte.',
      },
      {
        type: 'paragraphe',
        texte: 'S’entraîner une fois, c’est bien. Recommencer régulièrement, c’est ce qui fait vraiment monter la note.',
      },
    ],
    bouton: { libelle: 'Voir les prochaines dates', url: h.r('inscription_url') },
  }),
};

// --- E. Professeurs ---------------------------------------------------

const prof_affectation: Modele = {
  type: 'prof_affectation',
  categorie: 'transactional',
  role: 'prof',
  requises: ['first_name', 'subject_name', 'session_date', 'teacher_space_url'],
  sujet: (h) => `Tu coaches le bac blanc de ${h.r('subject_name')} du ${h.r('session_date_court')}`,
  contenu: (h) => ({
    titre: 'C’est confirmé : cette session est la tienne 🎓',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Tu es bien affecté·e au bac blanc de <strong>${h.t('subject_name')}</strong>.`,
      },
      ficheSession(h),
      ...(h.a('student_count')
        ? [
            {
              type: 'paragraphe' as const,
              texte: `<strong>${h.t('student_count')}</strong> élève(s) sont inscrits à ce jour. La liste se met à jour dans ton espace.`,
            },
          ]
        : []),
      {
        type: 'paragraphe',
        texte: 'Tout est dans ton espace prof : la liste des élèves, les salons dans lesquels entrer, et le dépôt des copies après l’épreuve.',
      },
    ],
    bouton: { libelle: 'Ouvrir mon espace prof', url: h.r('teacher_space_url') },
  }),
};

const prof_infos_session: Modele = {
  type: 'prof_infos_session',
  categorie: 'transactional',
  role: 'prof',
  requises: ['first_name', 'subject_name', 'session_date', 'start_time', 'teacher_space_url'],
  sujet: (h) => `Déroulé de la session ${h.r('subject_name')} du ${h.r('session_date_court')}`,
  contenu: (h) => ({
    titre: 'Le déroulé de ta session 📋',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      { type: 'paragraphe', texte: 'Voici les informations pratiques pour la session que tu coaches.' },
      ficheSession(h),
      {
        type: 'liste',
        items: [
          h.a('connection_time')
            ? `Connecte-toi à <strong>${h.t('connection_time')}</strong> pour accueillir les élèves`
            : 'Connecte-toi une quinzaine de minutes avant le début',
          'Chaque élève a son propre salon : tu passes de l’un à l’autre depuis ton espace',
          'Tu restes joignable pendant toute l’épreuve',
          'À la fin, les copies remontent dans ton espace pour la correction',
        ],
      },
      {
        type: 'encadre',
        lignes: [
          'Les liens des salons de tes élèves sont dans ton espace prof, jamais dans cet e-mail : ils sont personnels et ne doivent pas circuler.',
        ],
      },
    ],
    bouton: { libelle: 'Voir ma session', url: h.r('teacher_space_url') },
  }),
};

const prof_rappel_veille: Modele = {
  type: 'prof_rappel_veille',
  categorie: 'transactional',
  role: 'prof',
  requises: ['first_name', 'subject_name', 'start_time', 'teacher_space_url'],
  sujet: (h) => `Rappel — session ${h.r('subject_name')} demain`,
  contenu: (h) => ({
    titre: 'Ta session, c’est bientôt ⏰',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Rappel : tu coaches le bac blanc de <strong>${h.t('subject_name')}</strong>${h.a('session_date') ? ` le ${h.t('session_date')}` : ''}, début à <strong>${h.t('start_time')}</strong>.`,
      },
      ...(h.a('student_count')
        ? [
            {
              type: 'paragraphe' as const,
              texte: `<strong>${h.t('student_count')}</strong> élève(s) t'attendent.`,
            },
          ]
        : []),
    ],
    bouton: { libelle: 'Ouvrir ma session', url: h.r('teacher_space_url') },
  }),
};

const prof_session_modifiee: Modele = {
  type: 'prof_session_modifiee',
  categorie: 'transactional',
  role: 'prof',
  requises: ['first_name', 'subject_name', 'new_value', 'teacher_space_url'],
  sujet: (h) => `Changement — session ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Une session que tu coaches a changé ⚠️',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `La session de <strong>${h.t('subject_name')}</strong> a été modifiée.`,
      },
      {
        type: 'encadre',
        ton: 'attention',
        lignes: [
          h.a('old_value') ? `Avant : ${h.t('old_value')}` : '',
          `<strong>Maintenant : ${h.t('new_value')}</strong>`,
        ].filter(Boolean),
      },
      {
        type: 'paragraphe',
        texte: 'Si ce créneau ne te convient plus, préviens-nous vite en répondant à cet e-mail.',
      },
    ],
    bouton: { libelle: 'Voir la session', url: h.r('teacher_space_url') },
  }),
};

const prof_session_annulee: Modele = {
  type: 'prof_session_annulee',
  categorie: 'transactional',
  role: 'prof',
  requises: ['first_name', 'subject_name', 'teacher_space_url'],
  sujet: (h) => `Annulation — session ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Session annulée',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `La session de <strong>${h.t('subject_name')}</strong>${h.a('session_date') ? ` du ${h.t('session_date')}` : ''} est annulée. Tu n'as rien à faire.`,
      },
      ...(h.a('change_reason') ? [{ type: 'paragraphe' as const, texte: h.t('change_reason') }] : []),
      {
        type: 'paragraphe',
        texte: 'On te propose une autre session dès que possible. Merci de ta disponibilité.',
      },
    ],
    bouton: { libelle: 'Mon espace prof', url: h.r('teacher_space_url') },
  }),
};

const prof_copies_disponibles: Modele = {
  type: 'prof_copies_disponibles',
  categorie: 'transactional',
  role: 'prof',
  requises: ['first_name', 'subject_name', 'teacher_space_url'],
  sujet: (h) => `Les copies de ${h.r('subject_name')} sont disponibles`,
  contenu: (h) => ({
    titre: 'Les copies sont arrivées 📝',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: h.a('copy_count')
          ? `<strong>${h.t('copy_count')}</strong> copie(s) de <strong>${h.t('subject_name')}</strong> t'attendent dans ton espace.`
          : `Les copies de <strong>${h.t('subject_name')}</strong> t'attendent dans ton espace.`,
      },
      ...(h.a('deadline_date')
        ? [
            {
              type: 'encadre' as const,
              lignes: [`Correction attendue pour le <strong>${h.t('deadline_date')}</strong>.`],
            },
          ]
        : []),
    ],
    bouton: { libelle: 'Corriger les copies', url: h.r('teacher_space_url') },
  }),
};

const prof_rappel_correction: Modele = {
  type: 'prof_rappel_correction',
  categorie: 'transactional',
  role: 'prof',
  requises: ['first_name', 'subject_name', 'teacher_space_url'],
  sujet: (h) => `Correction à terminer — ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Il reste des copies à corriger',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: h.a('copy_count')
          ? `Il reste <strong>${h.t('copy_count')}</strong> copie(s) de <strong>${h.t('subject_name')}</strong> à terminer.`
          : `Il reste des copies de <strong>${h.t('subject_name')}</strong> à terminer.`,
      },
      ...(h.a('deadline_date')
        ? [
            {
              type: 'encadre' as const,
              ton: 'attention' as const,
              lignes: [`Échéance : <strong>${h.t('deadline_date')}</strong>. Les élèves attendent leur dossier.`],
            },
          ]
        : []),
      {
        type: 'paragraphe',
        texte: 'Si tu es bloqué·e ou en retard, réponds à cet e-mail : on s’organise autrement, sans problème.',
      },
    ],
    bouton: { libelle: 'Reprendre la correction', url: h.r('teacher_space_url') },
  }),
};

const prof_mission_terminee: Modele = {
  type: 'prof_mission_terminee',
  categorie: 'transactional',
  role: 'prof',
  requises: ['first_name', 'subject_name', 'teacher_space_url'],
  sujet: (h) => `Mission terminée — ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Mission terminée, merci 🙏',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Toutes les copies de <strong>${h.t('subject_name')}</strong>${h.a('session_date') ? ` du ${h.t('session_date')}` : ''} sont corrigées et envoyées aux élèves.`,
      },
      ...(h.a('remuneration')
        ? [
            {
              type: 'encadre' as const,
              ton: 'succes' as const,
              lignes: [`Rémunération enregistrée : <strong>${h.t('remuneration')} €</strong>.`],
            },
          ]
        : []),
      { type: 'paragraphe', texte: 'Merci pour le travail fourni — les élèves le voient, et nous aussi.' },
    ],
    bouton: { libelle: 'Mon espace prof', url: h.r('teacher_space_url') },
  }),
};


// --- Tarif de groupe (trio à 39 €) ------------------------------------

/**
 * Le code du premier inscrit, envoyé par écrit.
 *
 * Il l'a déjà vu à l'écran, mais il doit pouvoir le retrouver et le
 * transférer à ses camarades : un code qui n'existe que sur une page fermée
 * depuis est un code perdu, et l'offre tombe au bout de 48 h.
 */
const trio_code_partage: Modele = {
  type: 'trio_code_partage',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'trio_code', 'trio_deadline', 'subject_name'],
  sujet: (h) => `Ton code ${h.r('trio_code')} — à donner à tes deux camarades`,
  contenu: (h) => ({
    titre: 'Ton code de groupe',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `Voici le code à donner à <strong>tes deux camarades</strong> pour qu'ils s'inscrivent au bac blanc de ${h.t('subject_name')} au tarif de groupe.`,
      },
      { type: 'encadre', ton: 'succes', titre: h.t('trio_code'), lignes: ['39 € par personne au lieu de 59 €.'] },
      {
        type: 'encadre',
        ton: 'attention',
        titre: 'À faire avant le ' + h.t('trio_deadline'),
        lignes: [
          'Les <strong>trois inscriptions</strong> doivent être <strong>réglées</strong> avant cette heure.',
          'Passé ce délai, les inscriptions du trio sont annulées — la tienne comprise — et les sommes versées sont rendues en avoir.',
          'Le code ne vaut que pour <strong>deux camarades</strong> et pour <strong>cette matinée</strong>.',
        ],
      },
    ],
    bouton: { libelle: 'Ouvrir mon espace élève', url: h.r('student_space_url') },
  }),
};

/** Le rappel, quand l'heure approche et que le compte n'y est pas. */
const trio_rappel: Modele = {
  type: 'trio_rappel',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'trio_code', 'trio_deadline', 'trio_manquants'],
  sujet: (h) => `Il manque ${h.r('trio_manquants')} inscription(s) pour ton tarif de groupe`,
  contenu: (h) => ({
    titre: 'Ton trio n’est pas encore complet',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'encadre',
        ton: 'attention',
        titre: `Échéance : ${h.t('trio_deadline')}`,
        lignes: [
          `Il manque encore <strong>${h.t('trio_manquants')} inscription(s) réglée(s)</strong> avec le code <strong>${h.t('trio_code')}</strong>.`,
          'Si le compte n’y est pas à l’heure dite, les inscriptions du trio sont annulées et les sommes versées rendues en avoir.',
        ],
      },
      { type: 'paragraphe', texte: 'Un message à tes camarades suffit peut-être — ils ont peut-être simplement oublié de régler.' },
    ],
    bouton: { libelle: 'Ouvrir mon espace élève', url: h.r('student_space_url') },
  }),
};

/**
 * L'offre est tombée. Adressé à TOUS les membres du trio, l'initiateur
 * comme ceux qui avaient déjà réglé : leur inscription est annulée aussi.
 */
const trio_expire: Modele = {
  type: 'trio_expire',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'trio_code', 'subject_name'],
  sujet: () => 'Ton tarif de groupe n’a pas pu être appliqué',
  contenu: (h) => ({
    titre: 'L’offre de groupe est tombée',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'encadre',
        ton: 'attention',
        titre: 'Le trio n’a pas été complété dans les 48 heures',
        lignes: [
          `Les trois inscriptions au code <strong>${h.t('trio_code')}</strong> n’ont pas toutes été réglées à temps.`,
          'Le tarif de groupe ne s’applique donc pas, et <strong>les inscriptions du trio sont annulées</strong>.',
        ],
      },
      h.a('credit_amount')
        ? {
            type: 'encadre',
            ton: 'succes',
            titre: `Tes ${h.t('credit_amount')} € te sont rendus`,
            lignes: ['Ils sont conservés en avoir et se déduiront automatiquement de ta prochaine inscription, pendant un an.'],
          }
        : { type: 'paragraphe', texte: 'Rien n’a été prélevé de ton côté.' },
      { type: 'paragraphe', texte: 'Deux possibilités, maintenant :' },
      {
        type: 'liste',
        items: [
          `T’inscrire seul au bac blanc de ${h.t('subject_name')}, au tarif normal`,
          'Recommencer à trois — cette fois en vous mettant d’accord avant, pour que les trois règlent dans les 48 heures',
        ],
      },
    ],
    bouton: { libelle: 'Me réinscrire', url: h.r('inscription_url') },
  }),
};

// --- Packs prépayés ---------------------------------------------------

/** Ce que la famille a acheté, et combien de matinées il lui reste. */
const pack_achete: Modele = {
  type: 'pack_achete',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'pack_label', 'pack_total', 'pack_restantes', 'pack_expire'],
  sujet: (h) => `${h.r('pack_label')} — ${h.r('pack_restantes')} matinée(s) en réserve`,
  contenu: (h) => ({
    titre: h.t('pack_label'),
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'encadre',
        ton: 'succes',
        titre: `${h.t('pack_total')} matinées prépayées`,
        lignes: [
          `Il t’en reste <strong>${h.t('pack_restantes')}</strong> à réserver, dans la matière que tu veux.`,
          `À utiliser avant le <strong>${h.t('pack_expire')}</strong>.`,
        ],
      },
      {
        type: 'paragraphe',
        texte: 'Tu n’as rien à repayer : inscris-toi normalement aux dates qui t’arrangent, le montant affiché sera de 0 €.',
      },
    ],
    bouton: { libelle: 'Réserver une matinée', url: h.r('inscription_url') },
  }),
};


/** Un pack payé qui périme sans avoir servi, c'est de l'argent perdu. */
const pack_bientot_expire: Modele = {
  type: 'pack_bientot_expire',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'pack_label', 'pack_restantes', 'pack_expire'],
  sujet: (h) => `Il te reste ${h.r('pack_restantes')} matinée(s) à utiliser`,
  contenu: (h) => ({
    titre: 'Tes matinées prépayées expirent bientôt',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'encadre',
        ton: 'attention',
        titre: `${h.t('pack_restantes')} matinée(s) encore disponible(s)`,
        lignes: [
          `Ton <strong>${h.t('pack_label')}</strong> arrive à échéance le <strong>${h.t('pack_expire')}</strong>.`,
          'Passé cette date, les matinées non utilisées sont perdues — elles sont déjà payées, autant en profiter.',
        ],
      },
      {
        type: 'paragraphe',
        texte: 'Choisis simplement une date et une matière : le montant affiché sera de 0 €.',
      },
    ],
    bouton: { libelle: 'Réserver une matinée', url: h.r('inscription_url') },
  }),
};

// --- Avoirs -----------------------------------------------------------

/**
 * Quelqu'un s'est inscrit avec le code de l'élève : il a gagné de l'argent.
 *
 * Sans ce message, l'avoir existe en base et personne ne le sait : la famille
 * repaie plein tarif et découvre la réduction par hasard, ou jamais.
 */
const avoir_credite: Modele = {
  type: 'avoir_credite',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'credit_amount', 'credit_total'],
  sujet: (h) => `Tu as gagné ${h.r('credit_amount')} € sur ta prochaine matinée`,
  contenu: (h) => ({
    titre: `+${h.t('credit_amount')} € pour toi`,
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: h.a('filleul_name')
          ? `<strong>${h.t('filleul_name')}</strong> vient de s'inscrire avec ton code. Merci !`
          : 'Quelqu’un vient de s’inscrire avec ton code. Merci !',
      },
      {
        type: 'encadre',
        ton: 'succes',
        titre: `Ton avoir : ${h.t('credit_total')} €`,
        lignes: [
          'Il se déduira <strong>tout seul</strong> de ta prochaine inscription — rien à saisir.',
          'Valable un an.',
        ],
      },
    ],
    bouton: { libelle: 'Réserver ma prochaine matinée', url: h.r('inscription_url') },
  }),
};

// --- Ambassadeur ------------------------------------------------------

/**
 * Les trois codes promis par le site après la première matinée.
 *
 * « L'élève reçoit par email 3 codes −10 € à donner autour de lui. Pour chaque
 * ami qui s'inscrit avec l'un de ces codes, il gagne 5 € de crédit. »
 */
const ambassadeur_codes: Modele = {
  type: 'ambassadeur_codes',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'code_1', 'code_2', 'code_3'],
  sujet: () => 'Tes 3 codes −10 € à offrir',
  contenu: (h) => ({
    titre: 'Tu es ambassadeur',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: 'Tu as passé ta première matinée : voici <strong>trois codes de 10 € de réduction</strong> à donner autour de toi.',
      },
      {
        type: 'encadre',
        ton: 'succes',
        titre: 'Tes codes',
        lignes: [
          `<strong>${h.t('code_1')}</strong>`,
          `<strong>${h.t('code_2')}</strong>`,
          `<strong>${h.t('code_3')}</strong>`,
        ],
      },
      {
        type: 'encadre',
        ton: 'neutre',
        titre: 'Ce que tu gagnes',
        lignes: [
          'Pour <strong>chaque ami</strong> qui s’inscrit avec un de ces codes, tu reçois <strong>5 € d’avoir</strong> sur ta prochaine matinée.',
          'Chaque code ne sert qu’<strong>une fois</strong>.',
        ],
      },
    ],
    bouton: { libelle: 'Voir mes matinées', url: h.r('student_space_url') },
  }),
};

// --- Registre ---------------------------------------------------------

const LISTE: Modele[] = [
  preinscription_recue,
  inscription_confirmee,
  inscription_expiree,
  paiement_confirme,
  paiement_attente,
  infos_pratiques,
  lien_visio,
  rappel_veille,
  dernier_rappel,
  session_modifiee,
  session_annulee,
  session_terminee,
  correction_disponible,
  demande_avis,
  relance_interet,
  fermeture_inscriptions,
  nouvelle_session,
  retour_ancien_participant,
  prof_affectation,
  prof_infos_session,
  prof_rappel_veille,
  prof_session_modifiee,
  prof_session_annulee,
  prof_copies_disponibles,
  prof_rappel_correction,
  prof_mission_terminee,
  facture_disponible,
  trio_code_partage,
  trio_rappel,
  trio_expire,
  pack_achete,
  pack_bientot_expire,
  avoir_credite,
  ambassadeur_codes,
];

export const MODELES: Record<string, Modele> = Object.fromEntries(
  LISTE.map((m) => [m.type, m]),
);

export function modele(type: string): Modele | null {
  return MODELES[type] ?? null;
}

// --- Construction d'un message ---------------------------------------

export type EmailConstruit =
  | { ok: true; sujet: string; html: string; texte: string }
  | { ok: false; manquantes: string[]; raison: string };

/**
 * Construit un message à partir d'un modèle et de variables.
 *
 * Si une variable obligatoire manque, on ne rend RIEN : pas de « undefined »,
 * pas de date fausse, pas de bouton cassé. L'appelant met le message en
 * « bloqué » et l'administration affiche la donnée manquante.
 */
/**
 * Les zones corrigées depuis la console (script SQL 55).
 *
 * Volontairement passées en paramètre plutôt que lues ici : ce fichier ne
 * fait aucun appel réseau, et doit rester testable hors ligne.
 */
export type ZonesTexte = {
  sujet?: string;
  titre?: string;
  intro?: string;
  postscriptum?: string;
  signature?: string;
};

export function construireEmail(
  type: string,
  variables: Variables,
  options: PageOptions = {},
  zones: ZonesTexte = {},
): EmailConstruit {
  const m = modele(type);
  if (!m) {
    return { ok: false, manquantes: [], raison: `Modèle inconnu : ${type}` };
  }

  const manquantes = m.requises.filter((c) => !(variables[c] ?? '').trim());
  if (manquantes.length) {
    return {
      ok: false,
      manquantes,
      raison: `Donnée(s) manquante(s) : ${manquantes.join(', ')}`,
    };
  }

  // Les adresses doivent être en http(s) : un bouton vide ou piégé n'est pas
  // un e-mail « presque bon », c'est un e-mail à ne pas envoyer.
  const urlsInvalides = m.requises
    .filter((c) => c.endsWith('_url'))
    .filter((c) => !/^https?:\/\//i.test((variables[c] ?? '').trim()));
  if (urlsInvalides.length) {
    return {
      ok: false,
      manquantes: urlsInvalides,
      raison: `Adresse(s) invalide(s) : ${urlsInvalides.join(', ')}`,
    };
  }

  const h = aide(variables);
  const origine = m.contenu(h);

  // Les corrections de la console s'appliquent ICI, sur le contenu déjà
  // construit : `titre` remplace, `intro` et `postscriptum` s'ajoutent sans
  // rien supprimer. Le corps du message n'est jamais touché.
  const perso = (v: string | undefined) =>
    v ? appliquerVariables(v, variables, echapper) : '';
  const intro = perso(zones.intro);
  const postscriptum = perso(zones.postscriptum);

  const contenu: Contenu = {
    ...origine,
    titre: perso(zones.titre) || origine.titre,
    blocs: intro
      ? ([{ type: 'paragraphe' as const, texte: intro }, ...origine.blocs] as Contenu['blocs'])
      : origine.blocs,
    apres: postscriptum
      ? ([...(origine.apres ?? []), { type: 'paragraphe' as const, texte: postscriptum }] as Contenu['blocs'])
      : origine.apres,
    signature: perso(zones.signature) || origine.signature,
  };
  const opts: PageOptions =
    m.categorie === 'marketing'
      ? {
          ...options,
          mentionLegale:
            options.mentionLegale ??
            'Tu reçois ce message parce que tu t’es inscrit·e ou que tu as manifesté ton intérêt pour Les Matinées du Bac.',
        }
      : { ...options, desinscriptionUrl: null };

  return {
    ok: true,
    // L'objet est du TEXTE BRUT : on n'y échappe rien, sinon une esperluette
    // arriverait en « &amp; » dans la boîte de réception.
    sujet: (
      (zones.sujet ? appliquerVariables(zones.sujet, variables, (v) => v) : '') || m.sujet(h)
    ).slice(0, 250),
    html: rendreHtml(contenu, opts),
    texte: rendreTexte(contenu, opts),
  };
}
