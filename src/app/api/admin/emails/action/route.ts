/**
 * POST /api/admin/emails/action — les boutons de la page /admin/emails.
 *
 * Réservé à l'administratrice. Toutes les actions qui envoient réellement un
 * message exigent une confirmation explicite (`confirme: true`) envoyée par
 * l'interface après affichage du destinataire, du modèle et des liens.
 *
 * Deux protections importantes :
 *  - l'adresse d'un message ne peut PAS être modifiée librement. Un envoi de
 *    test part vers l'adresse de l'administratrice connectée ou vers une
 *    adresse explicitement autorisée par la variable EMAILS_ADRESSES_TEST —
 *    jamais vers une adresse saisie au hasard, pour qu'on ne puisse pas
 *    envoyer les informations privées d'un élève à quelqu'un d'autre ;
 *  - aucune campagne commerciale ne part sans confirmation, et seulement vers
 *    les personnes ayant accepté d'être recontactées.
 */
import { NextRequest, NextResponse } from 'next/server';
import { profConnecte } from '@/lib/authProf';
import { emailsDb } from '@/lib/emails/client';
import { adressesDeTest } from '@/lib/emails/config';
import { envoyerMaintenant, previsualiser, traiterFile } from '@/lib/emails/envoi';
import { annuler, lireEmail, reprogrammer } from '@/lib/emails/file';
import { enregistrerReglage, estReglage } from '@/lib/emails/reglages';
import {
  apresChangementSession,
  apresCorrectionPubliee,
  apresCopieRecue,
  apresPaiementConfirme,
  synchroniserInscription,
  synchroniserTout,
} from '@/lib/emails/declencheurs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé à l’administratrice.' }, { status: 403 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête illisible' }, { status: 400 });
  }

  const action = String(corps.action ?? '');
  const id = corps.id ? String(corps.id) : '';

  try {
    switch (action) {
      // --- Prévisualiser : ne touche à rien, n'envoie rien ---
      case 'previsualiser': {
        const ligne = await lireEmail(id);
        if (!ligne) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
        const apercu = await previsualiser(ligne);
        return NextResponse.json({
          ...apercu,
          destinataire: ligne.destinataire_email,
          type: ligne.type,
          categorie: ligne.categorie,
          statut: ligne.statut,
        });
      }

      // --- Envoyer un test à MON adresse ---
      case 'test': {
        const ligne = await lireEmail(id);
        if (!ligne) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });

        const demande = String(corps.destinataire ?? '').trim().toLowerCase();
        const autorisees = [moi.email.toLowerCase(), ...adressesDeTest()];
        const destinataire = demande || moi.email.toLowerCase();
        if (!autorisees.includes(destinataire)) {
          return NextResponse.json(
            {
              error:
                'Adresse de test non autorisée. Utilise ton adresse d’administratrice, ou ajoute l’adresse à la variable EMAILS_ADRESSES_TEST sur Vercel.',
            },
            { status: 400 },
          );
        }

        const res = await envoyerMaintenant(ligne, { destinataireTest: destinataire });
        return NextResponse.json({ ...res, destinataire });
      }

      // --- Annuler un message programmé ---
      case 'annuler': {
        const ok = await annuler(id, `annulé par ${moi.email}`);
        return NextResponse.json({ ok, message: ok ? 'Message annulé.' : 'Ce message ne peut plus être annulé.' });
      }

      // --- Renvoyer / relancer un message échoué ou bloqué ---
      case 'renvoyer': {
        if (corps.confirme !== true) {
          return NextResponse.json({ error: 'Confirmation manquante.' }, { status: 400 });
        }
        const ligne = await lireEmail(id);
        if (!ligne) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });

        if (ligne.statut === 'sent' || ligne.statut === 'delivered') {
          return NextResponse.json(
            { error: 'Ce message est déjà parti. Le renvoyer créerait un doublon côté destinataire.' },
            { status: 409 },
          );
        }
        await reprogrammer(ligne.id);
        const frais = await lireEmail(ligne.id);
        const res = frais ? await envoyerMaintenant(frais) : { ok: false, message: 'Message introuvable' };
        return NextResponse.json(res);
      }

      // --- Modifier un réglage (délais, quota, textes) ---
      case 'reglage': {
        const cle = String(corps.cle ?? '');
        if (!estReglage(cle)) {
          return NextResponse.json({ error: `Réglage inconnu : ${cle}` }, { status: 400 });
        }
        await enregistrerReglage(cle, String(corps.valeur ?? ''));
        return NextResponse.json({ ok: true });
      }

      // --- Mettre à jour une inscription (paiement, présence, correction) ---
      case 'inscription': {
        const inscriptionId = String(corps.inscription_id ?? '');
        if (!inscriptionId) {
          return NextResponse.json({ error: 'inscription_id manquant' }, { status: 400 });
        }
        const maj: Record<string, unknown> = {};
        let suite: 'paiement' | 'copie' | 'correction' | 'aucune' = 'aucune';

        if (typeof corps.paiement_statut === 'string') {
          const statut = corps.paiement_statut;
          const valides = ['en_attente', 'paye', 'offert', 'rembourse', 'annule'];
          if (!valides.includes(statut)) {
            return NextResponse.json({ error: 'Statut de paiement invalide' }, { status: 400 });
          }
          maj.paiement_statut = statut;
          maj.paiement_confirme_le =
            statut === 'paye' || statut === 'offert' ? new Date().toISOString() : null;
          if (corps.paiement_montant != null && corps.paiement_montant !== '') {
            maj.paiement_montant = Number(corps.paiement_montant);
          }
          if (typeof corps.paiement_reference === 'string') {
            maj.paiement_reference = corps.paiement_reference.slice(0, 120) || null;
          }
          suite = 'paiement';
        }

        if (typeof corps.copie_recue === 'boolean') {
          maj.copie_recue = corps.copie_recue;
          suite = 'copie';
        }
        if (typeof corps.presence === 'string' && ['inconnu', 'present', 'absent'].includes(corps.presence)) {
          maj.presence = corps.presence;
        }
        if (corps.correction_publiee === true) {
          maj.correction_publiee_le = new Date().toISOString();
          suite = 'correction';
        }
        if (corps.correction_publiee === false) {
          maj.correction_publiee_le = null;
        }
        if (corps.annuler_inscription === true) {
          maj.annulee_le = new Date().toISOString();
          maj.statut_eleve = 'annule';
        }

        if (!Object.keys(maj).length) {
          return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 });
        }

        const { error } = await emailsDb().from('inscriptions').update(maj).eq('id', inscriptionId);
        if (error) throw error;

        let misEnFile = 0;
        if (suite === 'paiement') misEnFile = await apresPaiementConfirme(inscriptionId);
        else if (suite === 'copie') misEnFile = await apresCopieRecue(inscriptionId);
        else if (suite === 'correction') misEnFile = await apresCorrectionPubliee(inscriptionId);
        else misEnFile = await synchroniserInscription(inscriptionId, 'admin');

        return NextResponse.json({ ok: true, misEnFile });
      }

      // --- Prévenir d'un changement de session, à la main ---
      case 'session': {
        const sessionId = String(corps.session_id ?? '');
        if (!sessionId) return NextResponse.json({ error: 'session_id manquant' }, { status: 400 });
        if (corps.confirme !== true) {
          return NextResponse.json({ error: 'Confirmation manquante.' }, { status: 400 });
        }
        const misEnFile = await apresChangementSession({
          sessionId,
          annulation: corps.annulation === true,
          motif: typeof corps.motif === 'string' ? corps.motif.slice(0, 400) : undefined,
        });
        return NextResponse.json({ ok: true, misEnFile });
      }

      // --- Lancer le moteur tout de suite (sans attendre les 5 minutes) ---
      case 'executer': {
        const planification = await synchroniserTout();
        const envoi = await traiterFile({ dryRun: corps.simulation === true });
        return NextResponse.json({ ok: true, planification, envoi });
      }

      // --- Répétition générale : construit tout, n'envoie rien ---
      case 'simulation': {
        const envoi = await traiterFile({ dryRun: true, limite: 100 });
        return NextResponse.json({ ok: true, envoi });
      }

      default:
        return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('❌ /api/admin/emails/action', action, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}
