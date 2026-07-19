function findPublicHintsForActiveProspect() {
  const sheet = getSs().getActiveSheet();
  const rowNumber = sheet.getActiveRange().getRow();
  if (!isProspectSheetName(sheet.getName()) || rowNumber < 2) {
    SpreadsheetApp.getUi().alert('Sélectionnez une ligne prospect.');
    return;
  }
  const row = sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).getValues()[0];
  const website = normalizeText(row[COL.WEBSITE - 1]);
  if (!website) {
    SpreadsheetApp.getUi().alert('Aucun site officiel renseigné.');
    return;
  }
  const hints = findPublicHintsFromWebsite(website);
  row[COL.NOTES - 1] = appendNote(row[COL.NOTES - 1], hints.length ? 'Pistes publiques à vérifier manuellement :\n' + hints.join('\n') : 'Aucune piste publique évidente trouvée sur le site officiel.');
  sheet.getRange(rowNumber, 1, 1, MDB.HEADERS.length).setValues([row]);
  writeLog('INFO', 'findPublicHintsForActiveProspect', sheet.getName(), rowNumber, 'Pistes publiques proposées', hints.join(' | '));
}

function findPublicHintsFromWebsite(website) {
  const base = website.indexOf('http') === 0 ? website : 'https://' + website;
  const domain = normalizeDomain(base);
  const paths = ['', '/contact', '/contacts', '/equipe', '/équipe', '/direction', '/cse', '/education', '/jeunesse', '/partenariats', '/association-de-parents'];
  const hints = [];
  paths.forEach(function (path) {
    if (hints.length >= 20) return;
    const url = base.replace(/\/$/, '') + path;
    try {
      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0 Apps Script CRM MDB' }
      });
      const code = response.getResponseCode();
      if (code < 200 || code >= 400) return;
      const html = response.getContentText().slice(0, 120000);
      extractPublicHints(html, url, domain).forEach(function (hint) {
        if (hints.indexOf(hint) === -1 && hints.length < 20) hints.push(hint);
      });
    } catch (error) {
      writeLog('WARN', 'findPublicHintsFromWebsite', '', '', 'Page non accessible', url + ' - ' + error);
    }
  });
  return hints;
}

function extractPublicHints(html, url, domain) {
  const hints = [];
  const mailMatches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  mailMatches.forEach(function (email) {
    if (normalizeDomain(email.split('@')[1]) === domain || email.toLowerCase().indexOf(domain) !== -1) {
      hints.push('E-mail public possible (' + url + ') : ' + email.toLowerCase());
    }
  });
  const telMatches = html.match(/(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g) || [];
  telMatches.forEach(function (phone) {
    hints.push('Téléphone public possible (' + url + ') : ' + normalizeFrenchPhone(phone));
  });
  const interestingWords = ['contact', 'direction', 'jeunesse', 'éducation', 'education', 'partenariat', 'parents', 'cse'];
  interestingWords.forEach(function (word) {
    if (html.toLowerCase().indexOf(word) !== -1) hints.push('Page à vérifier (' + word + ') : ' + url);
  });
  return hints.filter(uniqueOnly).slice(0, 8);
}

function researchMissingEmailsAndDeleteBatch() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    ensureAllProspectSchemas_();
    const batchSize = 60;
    const sheets = getProspectSheets();
    const existingEmails = {};
    const candidates = [];

    sheets.forEach(function (sheet) {
      getProspectRows(sheet).forEach(function (row, index) {
        const prospect = rowToObject(row);
        const email = normalizeText(prospect.email).toLowerCase();
        if (isValidEmail(email)) {
          existingEmails[email] = true;
          return;
        }
        if (candidates.length >= batchSize) return;
        if (prospect.firstContactDate || prospect.draftId) return;
        candidates.push({
          sheet: sheet,
          rowNumber: index + 2,
          row: row,
          organisation: prospect.organisation,
          primaryUrl: normalizeResearchUrl_(prospect.website) || normalizeResearchUrl_(prospect.sourceUrl),
          officialDomain: normalizeDomain(prospect.website || '')
        });
      });
    });

    if (!candidates.length) {
      refreshDashboard();
      console.log(JSON.stringify({ processed: 0, found: 0, deleted: 0, remaining: 0 }));
      return { processed: 0, found: 0, deleted: 0, remaining: 0 };
    }

    const primaryRequests = [];
    const primaryOwners = [];
    candidates.forEach(function (candidate) {
      if (!candidate.primaryUrl) return;
      primaryRequests.push(makeResearchRequest_(candidate.primaryUrl));
      primaryOwners.push(candidate);
    });
    const primaryResponses = safeFetchAll_(primaryRequests);
    const secondRequests = [];
    const secondOwners = [];

    primaryResponses.forEach(function (response, index) {
      if (!response) return;
      const candidate = primaryOwners[index];
      const html = response.getContentText().slice(0, 350000);
      candidate.email = choosePublicEmail_(html, candidate.officialDomain || normalizeDomain(candidate.primaryUrl));
      if (candidate.email) return;
      const contactUrl = findContactPageUrl_(html, candidate.primaryUrl);
      if (!contactUrl) return;
      secondRequests.push(makeResearchRequest_(contactUrl));
      secondOwners.push(candidate);
    });
    const secondResponses = safeFetchAll_(secondRequests);
    secondResponses.forEach(function (response, index) {
      if (!response) return;
      const candidate = secondOwners[index];
      candidate.email = choosePublicEmail_(response.getContentText().slice(0, 350000), candidate.officialDomain || normalizeDomain(candidate.primaryUrl));
    });

    let found = 0;
    let deleted = 0;
    let duplicates = 0;
    const deletionsBySheet = {};
    candidates.forEach(function (candidate) {
      const email = normalizeText(candidate.email).toLowerCase();
      if (isValidEmail(email) && !existingEmails[email]) {
        candidate.row[COL.EMAIL - 1] = email;
        candidate.row[COL.EMAIL_TYPE - 1] = isGenericEmail(email) ? 'générique' : 'nominatif';
        candidate.row[COL.EMAIL_VERIFIED - 1] = 'Non';
        candidate.row[COL.STATUS - 1] = 'Prêt à contacter';
        candidate.row[COL.NOTES - 1] = appendNote(candidate.row[COL.NOTES - 1], 'Adresse e-mail publique trouvée automatiquement sur le site indiqué dans le CRM le ' + formatDate(new Date()) + '.');
        candidate.sheet.getRange(candidate.rowNumber, COL.EMAIL).setValue(email);
        candidate.sheet.getRange(candidate.rowNumber, COL.EMAIL_TYPE).setValue(candidate.row[COL.EMAIL_TYPE - 1]);
        candidate.sheet.getRange(candidate.rowNumber, COL.EMAIL_VERIFIED).setValue('Non');
        candidate.sheet.getRange(candidate.rowNumber, COL.STATUS).setValue('Prêt à contacter');
        candidate.sheet.getRange(candidate.rowNumber, COL.NOTES).setValue(candidate.row[COL.NOTES - 1]);
        existingEmails[email] = true;
        found += 1;
        return;
      }
      if (isValidEmail(email) && existingEmails[email]) duplicates += 1;
      const name = candidate.sheet.getName();
      if (!deletionsBySheet[name]) deletionsBySheet[name] = [];
      deletionsBySheet[name].push(candidate.rowNumber);
    });

    Object.keys(deletionsBySheet).forEach(function (sheetName) {
      const sheet = getSs().getSheetByName(sheetName);
      deletionsBySheet[sheetName].sort(function (a, b) { return b - a; }).forEach(function (rowNumber) {
        sheet.deleteRow(rowNumber);
        deleted += 1;
      });
    });

    refreshDashboard();
    const remaining = countMissingEmailProspects_();
    const result = { processed: candidates.length, found: found, deleted: deleted, duplicatesDeleted: duplicates, remaining: remaining };
    writeLog('INFO', 'researchMissingEmailsAndDeleteBatch', '', '', 'Recherche des e-mails manquants terminée', JSON.stringify(result));
    console.log(JSON.stringify(result));
    SpreadsheetApp.getActive().toast(found + ' e-mails trouvés, ' + deleted + ' contacts sans e-mail supprimés. Restants : ' + remaining + '.', MDB.APP_NAME, 12);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function normalizeResearchUrl_(value) {
  let url = normalizeText(value).replace(/&amp;/g, '&');
  if (!url) return '';
  if (/^www\./i.test(url)) url = 'https://' + url;
  if (!/^https?:\/\//i.test(url)) return '';
  return url.replace(/\s/g, '');
}

function makeResearchRequest_(url) {
  return {
    url: url,
    muteHttpExceptions: true,
    followRedirects: true,
    validateHttpsCertificates: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CRM-Les-Matinees-du-Bac/1.0)' }
  };
}

function safeFetchAll_(requests) {
  if (!requests.length) return [];
  try {
    return UrlFetchApp.fetchAll(requests).map(function (response) {
      const code = response.getResponseCode();
      return code >= 200 && code < 400 ? response : null;
    });
  } catch (error) {
    writeLog('WARN', 'safeFetchAll_', '', '', 'Certaines pages publiques sont inaccessibles', stack(error));
    return requests.map(function (request) {
      try {
        const response = UrlFetchApp.fetch(request.url, request);
        const code = response.getResponseCode();
        return code >= 200 && code < 400 ? response : null;
      } catch (ignored) {
        return null;
      }
    });
  }
}

function choosePublicEmail_(html, officialDomain) {
  const cleaned = String(html || '')
    .replace(/&#0*64;|&commat;|\s(?:\[at\]|\(at\))\s/gi, '@')
    .replace(/\s(?:\[dot\]|\(dot\))\s/gi, '.')
    .replace(/%40/gi, '@');
  const matches = cleaned.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const blockedDomains = ['example.com', 'example.org', 'sentry.io', 'w3.org', 'schema.org', 'google.com', 'googleapis.com', 'gstatic.com', 'wixpress.com', 'wordpress.org', 'cloudflare.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'pappers.fr', 'societe.com', 'data.education.gouv.fr'];
  const blockedLocals = ['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'support', 'webmaster', 'privacy', 'dpo', 'abuse'];
  const consumerDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'orange.fr', 'wanadoo.fr', 'yahoo.fr', 'laposte.net', 'free.fr'];
  const genericLocals = ['contact', 'info', 'accueil', 'secretariat', 'secrétariat', 'direction', 'mairie', 'cse', 'association', 'scolarite', 'scolarité', 'administration', 'bureau'];
  const preferredDomain = normalizeDomain(officialDomain || '');
  let best = '';
  let bestScore = -1;

  matches.filter(uniqueOnly).forEach(function (rawEmail) {
    const email = rawEmail.toLowerCase().replace(/^mailto:/, '');
    if (!isValidEmail(email)) return;
    const parts = email.split('@');
    const local = parts[0];
    const domain = normalizeDomain(parts[1]);
    if (blockedDomains.some(function (blocked) { return domain === blocked || domain.endsWith('.' + blocked); })) return;
    if (blockedLocals.some(function (blocked) { return local === blocked || local.indexOf(blocked + '.') === 0; })) return;
    let score = 10;
    if (preferredDomain && (domain === preferredDomain || domain.endsWith('.' + preferredDomain) || preferredDomain.endsWith('.' + domain))) score += 100;
    if (genericLocals.some(function (generic) { return local === generic || local.indexOf(generic + '.') === 0 || local.indexOf(generic + '-') === 0; })) score += 35;
    if (consumerDomains.indexOf(domain) !== -1) score += 20;
    if (/\.gouv\.fr$/.test(domain) || /^ac-[a-z-]+\.fr$/.test(domain) || /\.asso\.fr$/.test(domain)) score += 20;
    if (score > bestScore) {
      best = email;
      bestScore = score;
    }
  });
  return best;
}

function findContactPageUrl_(html, baseUrl) {
  const links = [];
  const regex = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match;
  while ((match = regex.exec(String(html || ''))) !== null && links.length < 80) links.push(match[1]);
  const baseHost = normalizeDomain(baseUrl);
  for (let index = 0; index < links.length; index += 1) {
    const href = links[index];
    if (!/(contact|nous-contacter|mentions-legales|mentions_l[eé]gales|equipe|direction|accueil|secretariat)/i.test(href)) continue;
    const resolved = resolveResearchUrl_(baseUrl, href);
    if (resolved && normalizeDomain(resolved) === baseHost) return resolved;
  }
  const fallback = baseUrl.replace(/\/$/, '') + '/contact';
  return normalizeDomain(fallback) === baseHost ? fallback : '';
}

function resolveResearchUrl_(baseUrl, href) {
  if (/^https?:\/\//i.test(href)) return href;
  const originMatch = baseUrl.match(/^(https?:\/\/[^/]+)/i);
  if (!originMatch) return '';
  if (href.indexOf('//') === 0) return 'https:' + href;
  if (href.indexOf('/') === 0) return originMatch[1] + href;
  const directory = baseUrl.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
  return directory + href;
}

function countMissingEmailProspects_() {
  let count = 0;
  getProspectSheets().forEach(function (sheet) {
    getProspectRows(sheet).forEach(function (row) {
      if (!isValidEmail(row[COL.EMAIL - 1])) count += 1;
    });
  });
  return count;
}
