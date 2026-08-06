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

const inscription_confirmee: Modele = {
  type: 'inscription_confirmee',
  categorie: 'transactional',
  role: 'eleve',
  requises: ['first_name', 'subject_name', 'student_space_url'],
  sujet: (h) => `Inscription confirmée — bac blanc de ${h.r('subject_name')}`,
  contenu: (h) => ({
    titre: 'Inscription confirmée 🎉',
    blocs: [
      { type: 'paragraphe', texte: `Bonjour ${h.t('first_name')},` },
      {
        type: 'paragraphe',
        texte: `L'inscription au <strong>bac blanc de ${h.t('subject_name')}</strong> est bien enregistrée.`,
      },
      h.a('session_date')
        ? ficheSession(h)
        : {
            type: 'encadre',
            ton: 'attention',
            lignes: ['La date exacte sera confirmée très bientôt — tu recevras un e-mail dès qu’elle est fixée.'],
          },
      {
        type: 'encadre',
        titre: h.a('payment_status_label') ? `Paiement : ${h.t('payment_status_label')}` : 'Paiement',
        ton: h.r('payment_status') === 'paye' || h.r('payment_status') === 'offert' ? 'succes' : 'attention',
        lignes:
          h.r('payment_status') === 'paye' || h.r('payment_status') === 'offert'
            ? ['Tout est réglé, il n’y a rien à faire de ce côté.']
            : [
                h.a('payment_instructions')
                  ? h.t('payment_instructions')
                  : 'Le règlement se fait par virement. On t’envoie les informations dans un e-mail séparé.',
              ],
      },
      {
        type: 'paragraphe',
        texte: 'Comment ça se passe :',
      },
      {
        type: 'liste',
        items: [
          'Le bac blanc se déroule <strong>en visio</strong>, depuis chez toi, dans les conditions de l’examen',
          'Tu reçois un <strong>lien de salon personnel</strong> quelques jours avant',
          'Un professeur passe dans ton salon pendant l’épreuve et reste joignable',
          'Après l’épreuve, tu déposes ta copie et tu reçois un <strong>dossier de correction complet</strong>',
        ],
      },
    ],
    bouton: { libelle: 'Voir mon espace élève', url: h.r('student_space_url') },
    apres: [
      {
        type: 'petit',
        texte: 'Prochaine étape : les informations pratiques, quelques jours avant l’épreuve.',
      },
    ],
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

// --- Registre ---------------------------------------------------------

const LISTE: Modele[] = [
  preinscription_recue,
  inscription_confirmee,
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
export function construireEmail(
  type: string,
  variables: Variables,
  options: PageOptions = {},
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
  const contenu = m.contenu(h);
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
    sujet: m.sujet(h).slice(0, 250),
    html: rendreHtml(contenu, opts),
    texte: rendreTexte(contenu, opts),
  };
}
