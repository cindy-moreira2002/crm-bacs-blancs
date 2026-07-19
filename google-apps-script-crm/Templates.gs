function seedTemplates() {
  const sheet = getOrCreateSheet(MDB.SHEETS.TEMPLATES);
  const existingKeys = sheet.getLastRow() < 2
    ? {}
    : sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().reduce(function (index, row) {
      index[normalizeKey(row[0]) + '|' + normalizeKey(row[1])] = true;
      return index;
    }, {});
  const rows = DEFAULT_TEMPLATES.map(function (template) {
    return [template.category, template.type, template.subject, template.body, 'Oui'];
  }).filter(function (row) {
    return !existingKeys[normalizeKey(row[0]) + '|' + normalizeKey(row[1])];
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows).setWrap(true);
}

function getTemplate(category, type) {
  const sheet = getOrCreateSheet(MDB.SHEETS.TEMPLATES);
  const rows = sheet.getDataRange().getValues().slice(1);
  const normalizedCategory = normalizeKey(category);
  const normalizedType = normalizeKey(type);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (
      normalizeKey(row[0]) === normalizedCategory &&
      normalizeKey(row[1]) === normalizedType &&
      normalizeYesNo(row[4]) === 'Oui'
    ) {
      return { subject: row[2], body: row[3] };
    }
  }
  return null;
}

function renderTemplate(text, prospect, config) {
  const variables = buildVariables(prospect, config);
  const missing = [];
  const optionalVariables = [
    'telephone',
    'site_url',
    'brochure_url',
    'exemple_correction_url',
    'calendrier_url',
    'phrase_desinscription'
  ];
  const withoutEmptyOptionalLines = String(text || '').split('\n').filter(function (line) {
    return !optionalVariables.some(function (name) {
      return line.indexOf('{{' + name + '}}') !== -1 && !normalizeText(variables[name]);
    });
  }).join('\n');
  const rendered = withoutEmptyOptionalLines.replace(/\{\{([^}]+)\}\}/g, function (_, rawName) {
    const name = String(rawName).trim();
    const value = variables[name];
    if (value === undefined || value === null || value === '') {
      missing.push(name);
      return '';
    }
    return value;
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { text: rendered, missing: missing.filter(uniqueOnly) };
}

function hasUnresolvedPlaceholders(text) {
  return /\{\{[^}]+\}\}|\[\s*[ÀA]\s+RENSEIGNER\s*:/i.test(String(text || ''));
}

function buildVariables(prospect, config) {
  return {
    prenom_contact: prospect.firstName || 'Madame, Monsieur',
    nom_contact: prospect.lastName || '',
    fonction: prospect.role || '',
    organisation: prospect.organisation || 'votre organisation',
    ville: prospect.city || 'votre territoire',
    element_personnalisation: prospect.personalization || 'les informations publiquement disponibles sur votre site',
    offre_recommandee: prospect.offer || 'une première session pilote',
    nom_expediteur: config['Nom de l’expéditrice'] || 'Cindy Moreira',
    telephone: config['Numéro de téléphone'] || '',
    site_url: config['URL du site'] || '',
    brochure_url: config['URL de la brochure PDF'] || '',
    exemple_correction_url: config['URL d’un exemple de correction'] || '',
    calendrier_url: config['URL de prise de rendez-vous'] || '',
    phrase_desinscription: config['Phrase de désinscription'] || ''
  };
}

const DEFAULT_TEMPLATES = [
  {
    category: 'CSE',
    type: 'PREMIER_CONTACT',
    subject: 'Une offre de préparation au bac pour les enfants de vos salariés',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets de vous contacter au sujet des avantages proposés aux familles de {{organisation}}.\n\nLes Matinées du Bac organise des bacs blancs en visioconférence pour les élèves de Première et de Terminale : épreuve en conditions réelles, accompagnement en direct, correction individualisée et dossier personnel de progression.\n\nLe CSE peut financer des places, participer au prix ou proposer un tarif partenaire aux salariés.\n\nNous prenons en charge les inscriptions, l’organisation des sessions et la remise des corrections.\n\nVoici une présentation du dispositif : {{brochure_url}}\n\nSeriez-vous disponible pour un court échange afin d’étudier une première opération pilote ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'CSE',
    type: 'RELANCE_1',
    subject: 'Re: Une offre de préparation au bac pour les enfants de vos salariés',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets de revenir vers vous concernant les bacs blancs en visioconférence proposés aux enfants de salariés.\n\nPlusieurs formats sont possibles : places financées, participation du CSE ou tarif négocié sans engagement important.\n\nVoici la présentation : {{brochure_url}}\n\nEst-ce un sujet qui pourrait intéresser votre CSE cette année ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'CSE',
    type: 'RELANCE_2',
    subject: 'Dernier message - préparation au bac pour les familles',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous adresse un dernier message concernant notre proposition de bacs blancs accompagnés pour les enfants de salariés.\n\nJe peux vous transmettre une proposition pilote très simple, adaptée au nombre de familles potentiellement concernées.\n\nDans le cas contraire, je ne vous relancerai pas davantage.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PRIVES',
    type: 'PREMIER_CONTACT',
    subject: 'Proposition de session pilote de bac blanc pour vos élèves',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte afin de vous présenter Les Matinées du Bac, un dispositif de bacs blancs en visioconférence pour les élèves de Première et de Terminale.\n\nChaque élève réalise une épreuve en conditions réelles et reçoit ensuite une correction détaillée, une grille d’évaluation et un dossier personnel de progression.\n\nLe dispositif peut prendre la forme d’une session dédiée à votre établissement, d’un pack de places, d’un tarif négocié proposé aux familles ou de places financées pour certains élèves.\n\nNous gérons les inscriptions, l’encadrement, les corrections et le suivi administratif.\n\nPrésentation : {{brochure_url}}\n\nSerait-il possible d’échanger brièvement sur une première session pilote ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PRIVES',
    type: 'RELANCE_1',
    subject: 'Re: Proposition de session pilote de bac blanc',
    body: 'Bonjour {{prenom_contact}},\n\nJe reviens vers vous au sujet de notre proposition de bac blanc accompagné en visioconférence.\n\nL’objectif n’est pas de remplacer les entraînements organisés par l’établissement, mais de proposer une session complémentaire avec correction individualisée et bilan personnel pour chaque élève.\n\nVoici un exemple de correction : {{exemple_correction_url}}\n\nLa proposition peut-elle être transmise à la direction pédagogique ou à l’association de parents ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PRIVES',
    type: 'RELANCE_2',
    subject: 'Dernier message - session pilote de bac blanc',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets un dernier message au sujet d’une éventuelle session pilote pour vos élèves de Première ou de Terminale.\n\nSi le sujet n’est pas prioritaire, je peux aussi vous recontacter à une période plus adaptée.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PUBLICS',
    type: 'PREMIER_CONTACT',
    subject: 'Dispositif complémentaire de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte afin de vous présenter Les Matinées du Bac, un dispositif de préparation aux épreuves du baccalauréat organisé en visioconférence.\n\nLes élèves réalisent une épreuve complète en conditions réelles et bénéficient d’une correction individualisée, d’une grille d’évaluation et de conseils de progression.\n\nUne session peut être organisée pour un groupe d’élèves de l’établissement ou financée dans le cadre d’une action éducative ou d’un partenariat.\n\nNous pouvons commencer par une opération pilote limitée.\n\nPrésentation : {{brochure_url}}\n\nPourriez-vous m’indiquer la personne chargée des actions de préparation aux examens ou des partenariats éducatifs ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PUBLICS',
    type: 'RELANCE_1',
    subject: 'Re: Dispositif complémentaire de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets de revenir vers vous concernant notre proposition de bac blanc accompagné.\n\nLe dispositif peut concerner un groupe réduit d’élèves et inclure un bilan anonymisé des principales difficultés observées.\n\nPourriez-vous me préciser si cette proposition doit être adressée à la direction, au service de gestion ou à un professeur coordonnateur ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'LYCEES_PUBLICS',
    type: 'RELANCE_2',
    subject: 'Dernier message - préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous adresse un dernier message concernant cette proposition de session pilote de bac blanc accompagné.\n\nSi le sujet ne relève pas de votre service, pourriez-vous simplement m’indiquer le bon interlocuteur ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'MAIRIES',
    type: 'PREMIER_CONTACT',
    subject: 'Une action locale de préparation au bac pour les lycéens de {{ville}}',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte afin de vous présenter une action pouvant être proposée aux lycéens de {{ville}}.\n\nLes Matinées du Bac organise des bacs blancs en visioconférence comprenant une épreuve complète, un accompagnement en direct et une correction individualisée.\n\nLa commune peut notamment financer des places pour les jeunes de son territoire, réserver des places aux familles rencontrant des difficultés, organiser une session dédiée ou intégrer l’action à un dispositif jeunesse ou de réussite éducative.\n\nNous prenons en charge l’organisation, les inscriptions et les corrections.\n\nPrésentation : {{brochure_url}}\n\nPourriez-vous m’indiquer si cette proposition relève de votre service jeunesse, éducation ou politique de la ville ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'MAIRIES',
    type: 'RELANCE_1',
    subject: 'Re: Action locale de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe reviens vers vous concernant la possibilité de proposer des bacs blancs accompagnés aux lycéens de {{ville}}.\n\nUne première action peut être organisée avec un nombre limité de places afin d’évaluer l’intérêt et la participation.\n\nEst-ce un dispositif que je peux présenter à votre service jeunesse ou éducation ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'MAIRIES',
    type: 'RELANCE_2',
    subject: 'Dernier message - action locale de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets un dernier message au sujet d’une action locale de préparation au bac pour les lycéens de {{ville}}.\n\nSi ce sujet n’est pas adapté, je ne vous relancerai pas davantage.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_PARENTS',
    type: 'PREMIER_CONTACT',
    subject: 'Un partenariat de préparation au bac pour vos familles',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte au sujet des actions proposées par {{organisation}} aux familles.\n\nLes Matinées du Bac organise des bacs blancs en visioconférence avec accompagnement en direct, correction individualisée et dossier personnel de progression.\n\nVotre association pourrait proposer un tarif négocié à ses adhérents, une session réservée aux élèves de l’établissement, un pack de places, quelques places solidaires ou un simple code partenaire sans engagement financier.\n\nPrésentation : {{brochure_url}}\n\nSeriez-vous disponible pour un court échange sur le format le plus adapté à vos familles ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_PARENTS',
    type: 'RELANCE_1',
    subject: 'Re: Partenariat de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe me permets de revenir vers vous concernant notre proposition destinée aux élèves de Première et Terminale.\n\nLe partenariat peut être très simple : un tarif réservé aux familles, sans achat préalable ni engagement financier de l’association.\n\nPuis-je vous transmettre un exemple concret de fonctionnement et de tarif ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_PARENTS',
    type: 'RELANCE_2',
    subject: 'Dernier message - partenariat de préparation au bac',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous adresse un dernier message concernant la possibilité de proposer un tarif ou une session dédiée aux familles de {{organisation}}.\n\nJe peux vous envoyer une proposition très courte si cela peut être utile.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_EDUCATIVES',
    type: 'PREMIER_CONTACT',
    subject: 'Des bacs blancs accompagnés pour les jeunes que vous suivez',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous contacte afin de vous présenter Les Matinées du Bac, un dispositif pouvant compléter l’accompagnement scolaire proposé par {{organisation}}.\n\nLes élèves réalisent une épreuve complète en conditions réelles puis reçoivent une correction détaillée et un plan personnel de progression.\n\nDes places peuvent être financées par l’association, un partenaire ou un mécène, notamment pour des élèves n’ayant pas accès à un accompagnement privé.\n\nPrésentation : {{brochure_url}}\n\nSeriez-vous disponible pour étudier une première session pilote destinée à un petit groupe de jeunes ?\n\nCordialement,\n\n{{nom_expediteur}}\n{{telephone}}\n{{site_url}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_EDUCATIVES',
    type: 'RELANCE_1',
    subject: 'Re: Bacs blancs accompagnés pour les jeunes suivis',
    body: 'Bonjour {{prenom_contact}},\n\nJe reviens vers vous au sujet d’une session pilote de bacs blancs accompagnés pour les jeunes suivis par {{organisation}}.\n\nLe format peut rester limité au départ, avec un petit groupe et un bilan de progression individuel pour chaque élève.\n\nPensez-vous que cette proposition puisse compléter vos actions d’accompagnement scolaire ?\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  },
  {
    category: 'ASSOCIATIONS_EDUCATIVES',
    type: 'RELANCE_2',
    subject: 'Dernier message - session pilote de bac blanc',
    body: 'Bonjour {{prenom_contact}},\n\nJe vous adresse un dernier message concernant la possibilité d’une session pilote pour les jeunes accompagnés par {{organisation}}.\n\nSi le sujet n’est pas adapté, je ne vous relancerai pas davantage.\n\nCordialement,\n\n{{nom_expediteur}}\n\n{{phrase_desinscription}}'
  }
];
