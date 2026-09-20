/**
 * POST /api/emails/cron — le battement de cœur du système d'e-mails.
 *
 * Appelée toutes les 5 minutes par pg_cron (voir supabase/sql/29_emails_cron.sql).
 * Elle fait trois choses, dans cet ordre :
 *   1. expirer   — annuler les inscriptions dont le délai de règlement est
 *                  passé, et préparer le message d'annulation au parent ;
 *   2. planifier — relire l'état du site et mettre en file ce qui manque ;
 *   3. envoyer   — traiter les messages dus, en respectant la limite Brevo.
 *
 * L'expiration passe EN PREMIER : sinon le planificateur reprogrammerait,
 * dans la même seconde, les rappels d'une inscription sur le point d'être
 * annulée.
 *
 * Protégée par un secret partagé dans l'en-tête `x-emails-cron-secret`. Sans
 * lui, la route répond 401 : personne ne peut déclencher des envois depuis
 * l'extérieur. Le secret n'apparaît jamais dans une URL (donc jamais dans un
 * journal d'accès).
 */
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { emailsManquant } from '@/lib/emails/config';
import { synchroniserTout } from '@/lib/emails/declencheurs';
import { traiterFile } from '@/lib/emails/envoi';
import { expirerInscriptionsImpayees } from '@/lib/emails/expiration';
import { veiller } from '@/lib/direction/veille';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function secretValide(recu: string | null): boolean {
  const attendu = process.env.EMAILS_CRON_SECRET ?? '';
  if (!attendu || !recu) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!secretValide(req.headers.get('x-emails-cron-secret'))) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 401 });
  }

  const manquants = emailsManquant();
  if (manquants.length) {
    return NextResponse.json(
      { error: 'Système e-mails non configuré', manquants },
      { status: 503 },
    );
  }

  const debut = Date.now();
  try {
    // Une expiration qui échoue ne doit pas empêcher les e-mails de partir.
    let expiration;
    try {
      expiration = await expirerInscriptionsImpayees();
    } catch (err) {
      console.error('⚠️ Expiration des inscriptions impayées', err);
      expiration = { erreur: (err as Error).message };
    }

    const planification = await synchroniserTout();
    const envoi = await traiterFile();

    // 4. prévenir — la direction reçoit sur son téléphone ce qui vient
    // d'apparaître (e-mail à valider, paiement en attente, copie bloquée).
    // Isolée : une notification impossible ne doit pas colorer le cron en rouge.
    let veille;
    try {
      veille = await veiller();
    } catch (err) {
      console.error('⚠️ Veille direction', err);
      veille = { erreur: (err as Error).message };
    }

    const resume = {
      ok: true,
      duree_ms: Date.now() - debut,
      expiration,
      planification,
      veille,
      envoi: {
        dryRun: envoi.dryRun,
        examines: envoi.examines,
        envoyes: envoi.envoyes,
        bloques: envoi.bloques,
        annules: envoi.annules,
        echecs: envoi.echecs,
        reportes: envoi.reportes,
        quota: envoi.quota,
        avertissements: envoi.avertissements,
      },
    };
    console.log('📬 cron e-mails', JSON.stringify(resume));
    return NextResponse.json(resume);
  } catch (err) {
    console.error('❌ /api/emails/cron', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}

/** GET : simple contrôle de santé, sans rien envoyer. */
export async function GET(req: NextRequest) {
  if (!secretValide(req.headers.get('x-emails-cron-secret'))) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, manquants: emailsManquant() });
}
