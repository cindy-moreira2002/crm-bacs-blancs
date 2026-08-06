/**
 * Mise en page commune à tous les e-mails.
 *
 * Un seul gabarit : en-tête « Les Matinées du Bac », titre, contenu, un
 * bouton principal bien visible, le lien de secours en texte, le contact,
 * et le lien de désinscription pour les messages commerciaux.
 *
 * Contraintes d'e-mail respectées : tableaux plutôt que flexbox, styles en
 * ligne, largeur maximale 600 px, aucune image indispensable à la
 * compréhension, et une version texte produite à partir des mêmes blocs (donc
 * jamais désynchronisée du HTML).
 */
import { MARQUE, SUPPORT_EMAIL, EXPEDITEUR } from '../config';

export type Bloc =
  | { type: 'paragraphe'; texte: string }
  | { type: 'liste'; items: string[] }
  | { type: 'encadre'; titre?: string; lignes: string[]; ton?: 'neutre' | 'attention' | 'succes' }
  | { type: 'fiche'; lignes: [string, string][] }
  | { type: 'petit'; texte: string };

export type Bouton = { libelle: string; url: string; secondaire?: boolean };

export type Contenu = {
  titre: string;
  blocs: Bloc[];
  bouton?: Bouton;
  /** Second bouton, moins mis en avant (ex. « voir mon espace »). */
  boutonSecondaire?: Bouton;
  /** Blocs affichés après les boutons. */
  apres?: Bloc[];
  /** Formule de fin. Par défaut : « À très vite ». */
  signature?: string;
};

export type PageOptions = {
  desinscriptionUrl?: string | null;
  /** Mention affichée en tout petit sous le pied de page. */
  mentionLegale?: string;
};

const LOGO_URL = process.env.EMAILS_LOGO_URL?.trim() || '';

// --- Échappement ------------------------------------------------------

/**
 * Tout ce qui vient des données (prénom, matière, note du prof…) passe par
 * là avant d'entrer dans le HTML. Un élève qui s'appellerait « <script> » ne
 * casse ni ne détourne le message.
 */
export function echapper(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Les URL ne sont acceptées qu'en http(s) : pas de `javascript:` dans un bouton. */
export function urlSure(u: string): string {
  const propre = String(u ?? '').trim();
  return /^https?:\/\//i.test(propre) ? echapper(propre) : '';
}

// --- Rendu HTML -------------------------------------------------------

function blocHtml(b: Bloc): string {
  switch (b.type) {
    case 'paragraphe':
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${MARQUE.texte}">${b.texte}</p>`;
    case 'petit':
      return `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${MARQUE.gris}">${b.texte}</p>`;
    case 'liste':
      return (
        `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.8;color:${MARQUE.texte}">` +
        b.items.map((i) => `<li style="margin-bottom:4px">${i}</li>`).join('') +
        '</ul>'
      );
    case 'fiche':
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" ` +
        `style="margin:0 0 16px;background:${MARQUE.fondDoux};border-radius:10px;border:1px solid ${MARQUE.bordure}">` +
        '<tr><td style="padding:14px 16px">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" width="100%">' +
        b.lignes
          .map(
            ([k, v]) =>
              `<tr><td style="padding:4px 0;font-size:14px;color:${MARQUE.gris};white-space:nowrap">${k}</td>` +
              `<td style="padding:4px 0 4px 12px;font-size:15px;color:${MARQUE.texte};font-weight:600">${v}</td></tr>`,
          )
          .join('') +
        '</table></td></tr></table>'
      );
    case 'encadre': {
      const tons = {
        neutre: { fond: '#F3F4F6', bord: '#E5E7EB', texte: MARQUE.texte },
        attention: { fond: '#FEF3C7', bord: '#FCD34D', texte: '#78350F' },
        succes: { fond: '#ECFDF5', bord: '#A7F3D0', texte: '#065F46' },
      };
      const t = tons[b.ton ?? 'neutre'];
      return (
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" ` +
        `style="margin:0 0 16px;background:${t.fond};border:1px solid ${t.bord};border-radius:10px">` +
        `<tr><td style="padding:14px 16px;font-size:14px;line-height:1.65;color:${t.texte}">` +
        (b.titre ? `<strong style="display:block;margin-bottom:6px">${b.titre}</strong>` : '') +
        b.lignes.join('<br>') +
        '</td></tr></table>'
      );
    }
  }
}

function boutonHtml(b: Bouton): string {
  const url = urlSure(b.url);
  if (!url) return '';
  const fond = b.secondaire ? '#FFFFFF' : MARQUE.violetClair;
  const couleur = b.secondaire ? MARQUE.violetClair : '#FFFFFF';
  const bordure = b.secondaire ? `2px solid ${MARQUE.violetClair}` : 'none';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px"><tr><td ` +
    `style="border-radius:10px;background:${fond};border:${bordure}">` +
    `<a href="${url}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;` +
    `color:${couleur};text-decoration:none;border-radius:10px">${echapper(b.libelle)}</a>` +
    '</td></tr></table>'
  );
}

function entete(): string {
  if (LOGO_URL) {
    return (
      `<img src="${urlSure(LOGO_URL)}" alt="Les Matinées du Bac" width="180" ` +
      'style="display:block;border:0;max-width:180px;height:auto">'
    );
  }
  return (
    `<div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:${MARQUE.or};font-weight:700">Les</div>` +
    `<div style="font-size:26px;font-weight:800;color:${MARQUE.violet};line-height:1.15">Matinées du Bac</div>` +
    `<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${MARQUE.gris};margin-top:4px">Bacs blancs en visio · coaching personnalisé</div>`
  );
}

export function rendreHtml(c: Contenu, o: PageOptions = {}): string {
  const corps = [
    ...c.blocs.map(blocHtml),
    c.bouton ? boutonHtml(c.bouton) : '',
    c.bouton ? lienSecoursHtml(c.bouton.url) : '',
    c.boutonSecondaire ? boutonHtml(c.boutonSecondaire) : '',
    ...(c.apres ?? []).map(blocHtml),
  ].join('');

  const desinscription = o.desinscriptionUrl
    ? `<p style="margin:10px 0 0;font-size:12px;color:${MARQUE.gris}">` +
      `Tu ne veux plus recevoir nos actualités ? ` +
      `<a href="${urlSure(o.desinscriptionUrl)}" style="color:${MARQUE.gris}">Se désinscrire en un clic</a>.` +
      '</p>'
    : '';

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(c.titre)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${echapper(c.titre)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F4F6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <tr><td style="padding:26px 28px 18px;border-bottom:1px solid ${MARQUE.bordure}">${entete()}</td></tr>
  <tr><td style="padding:26px 28px 8px">
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${MARQUE.violet}">${echapper(c.titre)}</h1>
    ${corps}
  </td></tr>
  <tr><td style="padding:18px 28px 26px;border-top:1px solid ${MARQUE.bordure}">
    <p style="margin:0 0 6px;font-size:14px;color:${MARQUE.texte}">${echapper(c.signature ?? 'À très vite,')}<br><strong>${echapper(EXPEDITEUR.nom)}</strong></p>
    <p style="margin:0;font-size:13px;color:${MARQUE.gris}">Une question ? Réponds à cet e-mail ou écris à <a href="mailto:${echapper(SUPPORT_EMAIL)}" style="color:${MARQUE.violetClair}">${echapper(SUPPORT_EMAIL)}</a>.</p>
    ${o.mentionLegale ? `<p style="margin:10px 0 0;font-size:12px;color:${MARQUE.gris}">${o.mentionLegale}</p>` : ''}
    ${desinscription}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function lienSecoursHtml(url: string): string {
  const u = urlSure(url);
  if (!u) return '';
  return (
    `<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:${MARQUE.gris};word-break:break-all">` +
    `Le bouton ne fonctionne pas ? Copie ce lien : <a href="${u}" style="color:${MARQUE.gris}">${u}</a></p>`
  );
}

// --- Rendu texte ------------------------------------------------------

function sansBalises(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function blocTexte(b: Bloc): string {
  switch (b.type) {
    case 'paragraphe':
    case 'petit':
      return sansBalises(b.texte);
    case 'liste':
      return b.items.map((i) => `- ${sansBalises(i)}`).join('\n');
    case 'fiche':
      return b.lignes.map(([k, v]) => `${sansBalises(k)} : ${sansBalises(v)}`).join('\n');
    case 'encadre':
      return [b.titre ? sansBalises(b.titre) : '', ...b.lignes.map(sansBalises)].filter(Boolean).join('\n');
  }
}

export function rendreTexte(c: Contenu, o: PageOptions = {}): string {
  const morceaux: string[] = [c.titre.toUpperCase(), ''];
  for (const b of c.blocs) morceaux.push(blocTexte(b), '');
  if (c.bouton) morceaux.push(`${c.bouton.libelle} : ${c.bouton.url}`, '');
  if (c.boutonSecondaire) morceaux.push(`${c.boutonSecondaire.libelle} : ${c.boutonSecondaire.url}`, '');
  for (const b of c.apres ?? []) morceaux.push(blocTexte(b), '');
  morceaux.push(c.signature ?? 'À très vite,', EXPEDITEUR.nom, '');
  morceaux.push(`Une question ? Écris à ${SUPPORT_EMAIL}`);
  if (o.mentionLegale) morceaux.push(sansBalises(o.mentionLegale));
  if (o.desinscriptionUrl) morceaux.push(`Se désinscrire : ${o.desinscriptionUrl}`);
  return morceaux.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
