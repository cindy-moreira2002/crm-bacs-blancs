/**
 * Le catalogue des modèles d'e-mails, pour l'onglet « Modèles » de
 * /direction/emails.
 *
 * GET              → la liste des 33 modèles (type, libellé, rôle, catégorie,
 *                    variables requises, et si le modèle se rend bien).
 * GET ?type=xxx    → le rendu complet d'UN modèle, avec des valeurs d'exemple.
 *
 * Réservé à l'administratrice : les textes contiennent les conditions
 * commerciales et les adresses internes.
 *
 * Aucune donnée réelle n'est lue : le rendu se fait sur `VARIABLES_EXEMPLE`.
 * Relire un modèle ne doit jamais faire apparaître le nom d'un vrai élève.
 */
import { NextRequest, NextResponse } from 'next/server';
import { gardeApiAdmin } from '@/lib/gardeAcces';
import { LIBELLE_TYPE, TYPES_EMAIL, type TypeEmail } from '@/lib/emails/config';
import { construireEmail, MODELES } from '@/lib/emails/modeles/index';
import { VARIABLES_EXEMPLE } from '@/lib/emails/exemples';
import {
  AIDE_ZONE,
  LIBELLE_ZONE,
  ZONES,
  enregistrerTexte,
  estZone,
  textesDuModele,
  type TextesModele,
} from '@/lib/emails/textes';
import { profConnecte } from '@/lib/authProf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DESINSCRIPTION_EXEMPLE =
  'https://espaces.matineesdubac.fr/desinscription?jeton=exemple';

function rendre(type: string, zones: TextesModele = {}) {
  return construireEmail(
    type,
    VARIABLES_EXEMPLE,
    { desinscriptionUrl: DESINSCRIPTION_EXEMPLE },
    zones,
  );
}

export async function GET(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  const type = req.nextUrl.searchParams.get('type');

  // --- Un modèle en particulier : le rendu complet ---------------------
  if (type) {
    const m = MODELES[type];
    if (!m) return NextResponse.json({ error: 'Modèle inconnu.' }, { status: 404 });

    // L'aperçu montre le message TEL QU'IL PARTIRAIT : corrections comprises.
    const zones = await textesDuModele(type);
    const rendu = rendre(type, zones);
    if (!rendu.ok) {
      return NextResponse.json({
        type,
        libelle: LIBELLE_TYPE[type as TypeEmail] ?? type,
        ok: false,
        raison: rendu.raison,
        manquantes: rendu.manquantes,
        requises: m.requises,
      });
    }

    return NextResponse.json({
      type,
      libelle: LIBELLE_TYPE[type as TypeEmail] ?? type,
      ok: true,
      role: m.role,
      categorie: m.categorie,
      requises: m.requises,
      sujet: rendu.sujet,
      html: rendu.html,
      texte: rendu.texte,
      // Ce qui est modifiable depuis la console, et ce qui a déjà été changé.
      zones: ZONES.map((z) => ({
        cle: z,
        libelle: LIBELLE_ZONE[z],
        aide: AIDE_ZONE[z],
        valeur: zones[z] ?? '',
        personnalise: Boolean(zones[z]),
      })),
      // Le corps du message, lui, reste dans le dépôt.
      fichier: 'src/lib/emails/modeles/index.ts',
    });
  }

  // --- La liste ---------------------------------------------------------
  const modeles = TYPES_EMAIL.map((t) => {
    const m = MODELES[t];
    if (!m) {
      return {
        type: t,
        libelle: LIBELLE_TYPE[t],
        existe: false,
        ok: false,
        role: null,
        categorie: null,
        requises: [] as string[],
      };
    }
    const rendu = rendre(t);
    return {
      type: t,
      libelle: LIBELLE_TYPE[t],
      existe: true,
      ok: rendu.ok,
      role: m.role,
      categorie: m.categorie,
      requises: m.requises,
      ...(rendu.ok ? { sujet: rendu.sujet } : { manquantes: rendu.manquantes }),
    };
  });

  return NextResponse.json({ modeles, total: modeles.length });
}

/**
 * POST — enregistre la correction d'une zone, ou la vide pour revenir au
 * texte d'origine.
 *
 * Corps : { type, zone, valeur }
 */
export async function POST(req: NextRequest) {
  const refus = await gardeApiAdmin();
  if (refus) return refus;

  try {
    const { type, zone, valeur } = await req.json();
    if (!type || !MODELES[String(type)]) {
      return NextResponse.json({ error: 'Modèle inconnu.' }, { status: 400 });
    }
    if (!zone || !estZone(String(zone))) {
      return NextResponse.json({ error: 'Zone inconnue.' }, { status: 400 });
    }

    const moi = await profConnecte();
    await enregistrerTexte(String(type), zone, String(valeur ?? ''), moi?.email ?? null);

    // On renvoie le rendu à jour : la console montre le résultat sans avoir à
    // recharger, et une faute de frappe se voit tout de suite.
    const zones = await textesDuModele(String(type));
    const rendu = rendre(String(type), zones);

    return NextResponse.json({
      ok: true,
      rendu: rendu.ok
        ? { sujet: rendu.sujet, html: rendu.html, texte: rendu.texte }
        : { erreur: rendu.raison },
      zones: ZONES.map((z) => ({
        cle: z,
        libelle: LIBELLE_ZONE[z],
        aide: AIDE_ZONE[z],
        valeur: zones[z] ?? '',
        personnalise: Boolean(zones[z]),
      })),
    });
  } catch (err) {
    console.error('❌ /api/admin/emails/modeles POST', err);
    return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 500 });
  }
}
