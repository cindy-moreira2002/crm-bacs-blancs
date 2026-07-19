function enrichPersonalizationForRow(sheetName, row) {
  const category = sheetName;
  if (!row[COL.TYPE_ORG - 1]) row[COL.TYPE_ORG - 1] = MDB.CATEGORY_LABELS[category] || category;
  if (!row[COL.ANGLE - 1]) row[COL.ANGLE - 1] = getRecommendedAngle(category);
  if (!row[COL.OFFER - 1]) row[COL.OFFER - 1] = getRecommendedOffer(category, row);
  if (!row[COL.PERSONALIZATION - 1]) row[COL.PERSONALIZATION - 1] = getNeutralPersonalization(category, row);
  return row;
}

function getRecommendedAngle(category) {
  const angles = {
    CSE: 'Soutien à la parentalité et avantage concret destiné aux enfants des salariés.',
    LYCEES_PRIVES: 'Session complémentaire permettant aux élèves de s’entraîner et d’obtenir une correction individualisée.',
    LYCEES_PUBLICS: 'Dispositif complémentaire pouvant être proposé dans le cadre d’un pilote, d’un partenariat ou d’une action financée.',
    MAIRIES: 'Action éducative locale et accessible pouvant soutenir les lycéens de la commune.',
    ASSOCIATIONS_PARENTS: 'Tarif négocié, session dédiée ou places financées pour les adhérents.',
    ASSOCIATIONS_EDUCATIVES: 'Outil de préparation aux examens pouvant compléter l’accompagnement déjà proposé aux jeunes.'
  };
  return angles[category] || 'Proposition de session pilote adaptée au public concerné.';
}

function getRecommendedOffer(category, row) {
  if (category === 'CSE') return 'places financées, participation du CSE ou tarif partenaire';
  if (category === 'LYCEES_PRIVES') return 'Sessions complémentaires avec correction individualisée et bilan personnel : session dédiée, pack de places, tarif négocié, places financées ou partenariat de communication.';
  if (category === 'LYCEES_PUBLICS') return 'session pilote ou action financée pour un groupe d’élèves';
  if (category === 'MAIRIES') return 'places financées, session dédiée ou action jeunesse locale';
  if (category === 'ASSOCIATIONS_PARENTS') return 'tarif négocié, code partenaire, pack de places ou places solidaires';
  if (category === 'ASSOCIATIONS_EDUCATIVES') return 'session pilote avec places financées pour un petit groupe';
  return 'première session pilote';
}

function getNeutralPersonalization(category, row) {
  const organisation = row[COL.ORGANISATION - 1] || 'l’organisation';
  const city = row[COL.CITY - 1] || '';
  if (category === 'MAIRIES' && city) return 'Action proposée aux lycéens de ' + city + '.';
  if (category === 'CSE') return 'Approche centrée sur les familles de salariés de ' + organisation + '.';
  if (category === 'LYCEES_PRIVES' || category === 'LYCEES_PUBLICS') return 'Proposition complémentaire pour les élèves de Première et Terminale.';
  if (category === 'ASSOCIATIONS_PARENTS') return 'Proposition destinée aux familles adhérentes ou aux parents d’élèves.';
  if (category === 'ASSOCIATIONS_EDUCATIVES') return 'Proposition complémentaire pour les jeunes accompagnés.';
  return 'Personnalisation neutre à partir des informations publiques disponibles.';
}
