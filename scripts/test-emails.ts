/**
 * Tests du système d'e-mails — HORS LIGNE.
 *
 *   npm run test:emails
 *
 * Aucun accès à Supabase, aucun appel à Brevo, aucun vrai destinataire :
 * tout est joué sur des données fabriquées. Le seul « réseau » est un faux
 * `fetch` qui simule les réponses de Brevo (erreur temporaire, adresse
 * rejetée) pour vérifier que le moteur réagit correctement.
 *
 * Les 20 scénarios demandés sont numérotés dans la sortie.
 */
import assert from 'node:assert/strict';

// Le lien du salon d'un élève est une adresse Discord : sans identifiant de
// serveur, il n'y a pas d'adresse à construire — et c'est bien ce que vérifie
// le scénario 07. On en pose donc un, faux mais bien formé, pour que les autres
// scénarios travaillent sur la situation normale.
process.env.DISCORD_GUILD_ID ||= '1300000000000000000';

import { construireEmail, MODELES } from '../src/lib/emails/modeles/index';
import { rendreHtml, rendreTexte } from '../src/lib/emails/modeles/mise-en-page';
import { REGLAGES_DEFAUT, fusionnerReglages, type Reglages } from '../src/lib/emails/reglages';
import {
  planifier,
  tachesChangementSession,
  verifierAvantEnvoi,
} from '../src/lib/emails/planificateur';
import {
  variablesEleve,
  type ContextePlanification,
  type LigneInscription,
  type LigneProf,
  type LigneSession,
  type LignePreinscription,
} from '../src/lib/emails/donnees';
import { calculerQuota, refusDEnvoi, type Contact } from '../src/lib/emails/file';
import { envoyerViaBrevo } from '../src/lib/emails/brevo';
import { lienSalon } from '../src/lib/discord/config';
import { instantParis, lireHeure, formaterHeure, heureMoins } from '../src/lib/emails/temps';

/** Les salles Discord des deux élèves de référence. */
const SALLE_LEA = '1400000000000000001';
const SALLE_TOM = '1400000000000000002';
/** L'adresse attendue pour une salle donnée. */
const salonUrl = (salleId: string) => lienSalon(salleId) as string;

// --- Petit harnais ----------------------------------------------------

let reussis = 0;
let echoues = 0;
const echecs: string[] = [];

function test(numero: string, titre: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      reussis++;
      console.log(`  ✅ ${numero}. ${titre}`);
    })
    .catch((err) => {
      echoues++;
      echecs.push(`${numero}. ${titre}\n     ${(err as Error).message}`);
      console.log(`  ❌ ${numero}. ${titre}`);
      console.log(`     ${(err as Error).message.split('\n')[0]}`);
    });
}

// --- Données de test --------------------------------------------------

const MAINTENANT = new Date('2026-09-01T08:00:00.000Z'); // 10 h à Paris
const REGLAGES: Reglages = { ...REGLAGES_DEFAUT, actif_depuis: '2026-08-01T00:00:00.000Z' };

const SESSION: LigneSession = {
  id: 'sess-francais',
  matiere: 'Français',
  date_epreuve: '2026-09-06',
  heure_debut: '9h',
  heure_fin: '13h',
  places: 8,
  statut: 'ouverte',
  annulee_le: null,
  derniere_notif_empreinte: '2026-09-06|9h|13h|active',
};

function inscription(sur: Partial<LigneInscription> = {}): LigneInscription {
  return {
    id: 'insc-lea',
    nom: 'Léa Martin',
    email: 'lea@test-matineesdubac.fr',
    email_parent: 'parent.lea@test-matineesdubac.fr',
    matiere: 'Français',
    date_epreuve: '2026-09-06',
    session_id: 'sess-francais',
    created_at: '2026-08-20T10:00:00.000Z',
    email_envoye: false,
    rappel_j1_envoye: false,
    rappel_h1_envoye: false,
    statut_eleve: 'inscrit',
    paiement_statut: 'en_attente',
    paiement_montant: null,
    paiement_reference: null,
    paiement_confirme_le: null,
    presence: 'inconnu',
    copie_recue: false,
    correction_publiee_le: null,
    annulee_le: null,
    // Léa a sa salle Discord : c'est la situation normale une fois les salles
    // préparées. Les tests qui vérifient l'absence de lien la retirent.
    discord_salon_id: SALLE_LEA,
    ...sur,
  };
}

const PROF: LigneProf = {
  id: 'prof-1',
  prenom: 'Camille',
  nom: 'Durand',
  email: 'camille@test-matineesdubac.fr',
  matieres: ['Français'],
  statut_compte: 'actif',
};

function contexte(sur: Partial<ContextePlanification> = {}): ContextePlanification {
  const sessions = new Map<string, LigneSession>([[SESSION.id, SESSION]]);
  const sessionsParCle = new Map<string, LigneSession>([['français|2026-09-06', SESSION]]);
  return {
    inscriptions: [],
    sessions,
    sessionsParCle,
    coachs: [],
    profs: new Map([[PROF.id, PROF]]),
    copiesParEmail: new Map(),
    preinscriptions: [],
    ...sur,
  };
}

function typesDe(taches: { type: string }[]): string[] {
  return [...new Set(taches.map((t) => t.type))];
}

// --- Les scénarios ----------------------------------------------------

async function main() {
  console.log('\n📬 Tests du système d’e-mails — aucun envoi réel\n');

  // 1
  await test('01', 'Nouvelle préinscription → accusé de réception mis en file', () => {
    const p: LignePreinscription = {
      id: 'pre-1',
      prenom: 'Sacha',
      nom: null,
      email: 'sacha@test-matineesdubac.fr',
      matiere: 'Philosophie',
      session_libelle: 'samedi 20 septembre',
      session_id: null,
      statut: 'nouvelle',
      consentement_marketing: true,
      inscription_id: null,
      created_at: '2026-08-30T09:00:00.000Z',
    };
    const taches = planifier(contexte({ preinscriptions: [p] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.ok(typesDe(taches).includes('preinscription_recue'), 'accusé de réception absent');
    assert.ok(typesDe(taches).includes('relance_interet'), 'relance commerciale absente');
    const relance = taches.find((t) => t.type === 'relance_interet')!;
    assert.equal(relance.categorie, 'marketing');
  });

  // 2
  await test('02', 'Inscription validée → confirmation à l’élève ET au parent', () => {
    const taches = planifier(contexte({ inscriptions: [inscription()] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    const confirmations = taches.filter((t) => t.type === 'inscription_confirmee');
    assert.equal(confirmations.length, 2, 'il faut une confirmation élève + une parent');
    const roles = confirmations.map((c) => c.destinataire_role).sort();
    assert.deepEqual(roles, ['eleve', 'parent']);
    const construit = construireEmail('inscription_confirmee', confirmations[0].variables);
    assert.ok(construit.ok, 'ok' in construit && !construit.ok ? construit.raison : '');
  });

  // 3
  await test('03', 'Paiement confirmé côté serveur → e-mail de confirmation', () => {
    const i = inscription({
      paiement_statut: 'paye',
      paiement_confirme_le: '2026-08-31T12:00:00.000Z',
      paiement_montant: 29,
      paiement_reference: 'VIR-2026-014',
    });
    const taches = planifier(contexte({ inscriptions: [i] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.ok(typesDe(taches).includes('paiement_confirme'));
    const t = taches.find((x) => x.type === 'paiement_confirme')!;
    const c = construireEmail('paiement_confirme', t.variables);
    assert.ok(c.ok);
    if (c.ok) {
      assert.ok(c.html.includes('29'), 'le montant doit apparaître');
      assert.ok(c.html.includes('VIR-2026-014'), 'la référence doit apparaître');
    }
  });

  // 4
  await test('04', 'Inscription finalisée avant la relance → aucune relance de paiement', () => {
    const ancienne = inscription({ created_at: '2026-08-25T10:00:00.000Z' });

    const enAttente = planifier(contexte({ inscriptions: [ancienne] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.ok(typesDe(enAttente).includes('paiement_attente'), 'la relance devrait exister');

    const payee = inscription({
      created_at: '2026-08-25T10:00:00.000Z',
      paiement_statut: 'paye',
      paiement_confirme_le: '2026-08-26T10:00:00.000Z',
    });
    const apres = planifier(contexte({ inscriptions: [payee] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.ok(!typesDe(apres).includes('paiement_attente'), 'plus aucune relance une fois payé');

    // Et même si une relance avait été mise en file, elle serait annulée :
    const verdict = verifierAvantEnvoi({
      type: 'paiement_attente',
      inscription: payee,
      session: SESSION,
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.equal(verdict.action, 'annuler');
  });

  // 5
  await test('05', 'Informations pratiques programmées à J-5, 10 h de Paris', () => {
    const taches = planifier(contexte({ inscriptions: [inscription()] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    const t = taches.find((x) => x.type === 'infos_pratiques' && x.destinataire_role === 'eleve');
    assert.ok(t, 'informations pratiques absentes');
    const attendu = instantParis(2026, 9, 1, 10, 0); // 6 septembre − 5 jours
    assert.equal(new Date(t!.planifie_le).toISOString(), attendu.toISOString());
  });

  // 6
  await test('06', 'Lien de visioconférence présent, personnel et sûr', () => {
    const taches = planifier(contexte({ inscriptions: [inscription()] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    const t = taches.find((x) => x.type === 'lien_visio')!;
    assert.ok(t, 'lien_visio absent');
    assert.equal(t.variables.video_room_url, salonUrl(SALLE_LEA));
    const c = construireEmail('lien_visio', t.variables);
    assert.ok(c.ok);
    if (c.ok) {
      assert.ok(c.html.includes(salonUrl(SALLE_LEA)));
      assert.ok(/ne le partage/i.test(c.html), 'la consigne de non-partage doit être présente');
    }
  });

  // 7
  await test('07', 'Lien de visioconférence absent → aucun envoi, message bloqué', () => {
    const sansDate = inscription({ date_epreuve: null, session_id: null });
    const taches = planifier(contexte({ inscriptions: [sansDate] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.ok(!typesDe(taches).includes('lien_visio'), 'aucun lien ne doit être planifié sans date');

    const v = variablesEleve({ inscription: sansDate, session: null });
    assert.equal(v.video_room_url, undefined);
    const c = construireEmail('lien_visio', v);
    assert.equal(c.ok, false);
    if (!c.ok) {
      assert.ok(c.manquantes.includes('video_room_url'), `manquantes: ${c.manquantes.join(',')}`);
    }
  });

  // 8
  await test('08', 'Rappel de la veille programmé à 18 h, heure de Paris', () => {
    const taches = planifier(contexte({ inscriptions: [inscription()] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    const t = taches.find((x) => x.type === 'rappel_veille' && x.destinataire_role === 'eleve')!;
    assert.ok(t);
    assert.equal(new Date(t.planifie_le).toISOString(), instantParis(2026, 9, 5, 18, 0).toISOString());

    const dernier = taches.find((x) => x.type === 'dernier_rappel')!;
    assert.ok(dernier, 'dernier rappel absent');
    // 9 h à Paris moins 60 minutes = 8 h à Paris = 06:00 UTC en été.
    assert.equal(new Date(dernier.planifie_le).toISOString(), '2026-09-06T06:00:00.000Z');

    // Un rappel déjà envoyé par l'ancien système n'est jamais reprogrammé.
    const dejaFait = planifier(
      contexte({ inscriptions: [inscription({ rappel_j1_envoye: true, rappel_h1_envoye: true })] }),
      { reglages: REGLAGES, maintenant: MAINTENANT },
    );
    assert.ok(!typesDe(dejaFait).includes('rappel_veille'));
    assert.ok(!typesDe(dejaFait).includes('dernier_rappel'));
  });

  // 9
  await test('09', 'Session reportée → le message est replanifié, pas envoyé trop tôt', () => {
    const reportee: LigneSession = { ...SESSION, date_epreuve: '2026-09-20' };
    const verdict = verifierAvantEnvoi({
      type: 'rappel_veille',
      inscription: inscription({ date_epreuve: '2026-09-20' }),
      session: reportee,
      reglages: REGLAGES,
      maintenant: new Date('2026-09-05T16:00:00.000Z'),
    });
    assert.equal(verdict.action, 'reporter');
    if (verdict.action === 'reporter') {
      assert.equal(verdict.quand.toISOString(), instantParis(2026, 9, 19, 18, 0).toISOString());
    }

    // Et l'élève est prévenu du changement.
    const taches = tachesChangementSession({
      session: reportee,
      ancienne: { date_epreuve: '2026-09-06', heure_debut: '9h' },
      eleves: [inscription()],
      profs: [{ prof: PROF, remuneration: 40 }],
      annulation: false,
      reglages: REGLAGES,
      maintenant: MAINTENANT,
      empreinte: '2026-09-20|9h|13h|active',
    });
    assert.ok(typesDe(taches).includes('session_modifiee'));
    assert.ok(typesDe(taches).includes('prof_session_modifiee'));
    const t = taches.find((x) => x.type === 'session_modifiee')!;
    const c = construireEmail('session_modifiee', t.variables);
    assert.ok(c.ok);
    if (c.ok) {
      assert.ok(c.html.includes('6 septembre'), 'l’ancienne date doit apparaître');
      assert.ok(c.html.includes('20 septembre'), 'la nouvelle date doit apparaître');
    }
  });

  // 10
  await test('10', 'Session annulée → plus aucun rappel, message d’annulation', () => {
    const annulee: LigneSession = { ...SESSION, statut: 'annulee', annulee_le: '2026-09-01T09:00:00.000Z' };
    const taches = planifier(contexte({ inscriptions: [inscription()], sessions: new Map([[annulee.id, annulee]]) }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    for (const interdit of ['infos_pratiques', 'lien_visio', 'rappel_veille', 'dernier_rappel']) {
      assert.ok(!typesDe(taches).includes(interdit), `${interdit} ne doit plus être planifié`);
    }

    const verdict = verifierAvantEnvoi({
      type: 'lien_visio',
      inscription: inscription(),
      session: annulee,
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.equal(verdict.action, 'annuler');

    const annonce = tachesChangementSession({
      session: annulee,
      ancienne: { date_epreuve: '2026-09-06', heure_debut: '9h' },
      eleves: [inscription()],
      profs: [{ prof: PROF, remuneration: null }],
      annulation: true,
      reglages: REGLAGES,
      maintenant: MAINTENANT,
      empreinte: 'annulee-2026-09-06',
    });
    assert.ok(typesDe(annonce).includes('session_annulee'));
    const c = construireEmail('session_annulee', annonce[0].variables);
    assert.ok(c.ok);
    if (c.ok) assert.ok(!c.html.includes('discord.com/channels'), 'aucun lien de salon dans une annulation');
  });

  // 11
  await test('11', 'Correction publiée → e-mail de correction puis demande d’avis à J+3', () => {
    const i = inscription({
      correction_publiee_le: '2026-09-08T10:00:00.000Z',
      copie_recue: true,
      presence: 'present',
    });
    const taches = planifier(contexte({ inscriptions: [i] }), {
      reglages: REGLAGES,
      maintenant: new Date('2026-09-08T12:00:00.000Z'),
    });
    assert.ok(typesDe(taches).includes('correction_disponible'));
    assert.ok(typesDe(taches).includes('session_terminee'));
    const avis = taches.find((t) => t.type === 'demande_avis')!;
    assert.ok(avis, 'demande d’avis absente');
    assert.equal(new Date(avis.planifie_le).toISOString(), '2026-09-11T10:00:00.000Z');

    // Absent ou remboursé : pas de demande d'avis.
    const absent = planifier(contexte({ inscriptions: [{ ...i, presence: 'absent' }] }), {
      reglages: REGLAGES,
      maintenant: new Date('2026-09-08T12:00:00.000Z'),
    });
    assert.ok(!typesDe(absent).includes('demande_avis'));
  });

  // 12
  await test('12', 'Correction non publiée → aucun e-mail « correction disponible »', () => {
    const i = inscription({ copie_recue: true, correction_publiee_le: null });
    const taches = planifier(contexte({ inscriptions: [i] }), {
      reglages: REGLAGES,
      maintenant: new Date('2026-09-08T12:00:00.000Z'),
    });
    assert.ok(!typesDe(taches).includes('correction_disponible'));

    const verdict = verifierAvantEnvoi({
      type: 'correction_disponible',
      inscription: i,
      session: SESSION,
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.equal(verdict.action, 'annuler');
    if (verdict.action === 'annuler') assert.match(verdict.raison, /correction non publiée/);
  });

  // 13
  await test('13', 'E-mails professeur : affectation, informations, rappel', () => {
    const taches = planifier(
      contexte({
        inscriptions: [inscription()],
        coachs: [
          {
            session_id: SESSION.id,
            professeur_id: PROF.id,
            statut: 'confirme',
            remuneration: 40,
            created_at: '2026-08-28T10:00:00.000Z',
          },
        ],
      }),
      { reglages: REGLAGES, maintenant: MAINTENANT },
    );
    const types = typesDe(taches);
    for (const attendu of ['prof_affectation', 'prof_infos_session', 'prof_rappel_veille']) {
      assert.ok(types.includes(attendu), `${attendu} absent`);
    }
    const infos = taches.find((t) => t.type === 'prof_infos_session')!;
    assert.equal(infos.destinataire_email, PROF.email);
    assert.equal(infos.variables.student_count, '1');
    const c = construireEmail('prof_infos_session', infos.variables);
    assert.ok(c.ok);
    if (c.ok) {
      assert.ok(!c.html.includes('lea@test-matineesdubac.fr'), 'aucune adresse d’élève dans un e-mail prof');
      assert.ok(!c.html.includes('discord.com/channels'), 'aucun salon d’élève dans un e-mail prof');
    }
  });

  // 14
  await test('14', 'Double planification → mêmes clés d’idempotence (aucun doublon possible)', () => {
    const ctx = contexte({ inscriptions: [inscription()] });
    const a = planifier(ctx, { reglages: REGLAGES, maintenant: MAINTENANT });
    const b = planifier(ctx, { reglages: REGLAGES, maintenant: MAINTENANT });
    const clesA = a.map((t) => t.cle_idempotence).sort();
    const clesB = b.map((t) => t.cle_idempotence).sort();
    assert.deepEqual(clesA, clesB, 'la planification doit être stable');
    assert.equal(new Set(clesA).size, clesA.length, 'aucune clé ne doit être en double dans un même lot');
    // Élève et parent ont bien des clés distinctes.
    assert.ok(clesA.some((c) => c.endsWith(':parent')));
  });

  // 15
  await test('15', 'Erreur temporaire de Brevo (429 / 500) → nouvel essai, pas d’abandon', async () => {
    const vraiFetch = globalThis.fetch;
    process.env.BREVO_API_KEY = 'cle-de-test';
    try {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ code: 'too_many_requests', message: 'trop vite' }), {
          status: 429,
        })) as typeof fetch;
      const r1 = await envoyerViaBrevo(messageTest());
      assert.equal(r1.ok, false);
      if (!r1.ok) assert.equal(r1.permanent, false, 'un 429 doit être temporaire');

      globalThis.fetch = (async () => new Response('panne', { status: 503 })) as typeof fetch;
      const r2 = await envoyerViaBrevo(messageTest());
      if (!r2.ok) assert.equal(r2.permanent, false, 'un 503 doit être temporaire');
    } finally {
      globalThis.fetch = vraiFetch;
      delete process.env.BREVO_API_KEY;
    }
  });

  // 16
  await test('16', 'Adresse rejetée (400) → échec définitif, pas de boucle', async () => {
    const vraiFetch = globalThis.fetch;
    process.env.BREVO_API_KEY = 'cle-de-test';
    try {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ code: 'invalid_parameter', message: 'email invalide' }), {
          status: 400,
        })) as typeof fetch;
      const r = await envoyerViaBrevo(messageTest());
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.permanent, true, 'une adresse invalide est un échec définitif');
        assert.match(r.message, /invalid_parameter/);
      }
    } finally {
      globalThis.fetch = vraiFetch;
      delete process.env.BREVO_API_KEY;
    }
  });

  // 17
  await test('17', 'Désinscription : plus de commercial, mais les messages indispensables passent', () => {
    const desinscrit: Contact = {
      email: 'lea@test-matineesdubac.fr',
      nom: 'Léa',
      role: 'eleve',
      consentement_marketing: false,
      desinscrit: true,
      bounce: false,
      plainte: false,
    };
    assert.ok(refusDEnvoi(desinscrit, 'marketing'), 'le marketing doit être refusé');
    assert.equal(refusDEnvoi(desinscrit, 'transactional'), null, 'les messages d’inscription passent');

    const rejete: Contact = { ...desinscrit, desinscrit: false, bounce: true };
    assert.ok(refusDEnvoi(rejete, 'transactional'), 'une adresse rejetée ne reçoit plus rien');

    const sansConsentement: Contact = { ...desinscrit, desinscrit: false };
    assert.ok(refusDEnvoi(sansConsentement, 'marketing'), 'pas de marketing sans consentement');

    // Le lien de désinscription est présent dans un message commercial.
    const html = rendreHtml(
      { titre: 'Test', blocs: [{ type: 'paragraphe', texte: 'Bonjour' }] },
      { desinscriptionUrl: 'https://exemple.fr/desinscription?jeton=abc' },
    );
    assert.ok(html.includes('Se désinscrire'), 'lien de désinscription absent');
  });

  // 18
  await test('18', 'Limite quotidienne : le transactionnel passe avant le commercial', () => {
    const q = calculerQuota(275, 40, 300, 30);
    assert.equal(q.restantTransactionnel, 25);
    assert.equal(q.restantMarketing, 0, 'la marge protège les messages indispensables');
    assert.ok(q.alerte, 'une alerte doit être affichée');

    const plein = calculerQuota(300, 12, 300, 30);
    assert.equal(plein.restantTransactionnel, 0);
    assert.match(plein.alerte ?? '', /Limite de 300/);

    const calme = calculerQuota(10, 5, 300, 30);
    assert.equal(calme.alerte, null);
    assert.equal(calme.restantMarketing, 260);
  });

  // 19
  await test('19', 'Un élève ne reçoit jamais le lien d’un autre', () => {
    const lea = inscription();
    const tom = inscription({
      id: 'insc-tom',
      nom: 'Tom Bernard',
      email: 'tom@test-matineesdubac.fr',
      email_parent: null,
      discord_salon_id: SALLE_TOM,
    });
    const taches = planifier(contexte({ inscriptions: [lea, tom] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });

    for (const t of taches) {
      const lien = t.variables.video_room_url;
      if (!lien) continue;
      const attendu = salonUrl(t.inscription_id === 'insc-tom' ? SALLE_TOM : SALLE_LEA);
      assert.equal(lien, attendu, `le lien de ${t.destinataire_email} n'est pas le sien`);
    }

    const liensLea = taches.filter((t) => t.destinataire_email === lea.email).map((t) => t.variables.video_room_url);
    assert.ok(!liensLea.includes(salonUrl(SALLE_TOM)), 'Léa ne doit jamais voir le salon de Tom');

    // Le parent reçoit le salon de SON enfant, et rien d'autre.
    const parent = taches.filter((t) => t.destinataire_role === 'parent');
    for (const p of parent) {
      if (p.variables.video_room_url) assert.equal(p.variables.video_room_url, salonUrl(SALLE_LEA));
    }
  });

  // 20
  await test('20', 'Rendu lisible sur ordinateur et sur téléphone', () => {
    const t = planifier(contexte({ inscriptions: [inscription()] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    }).find((x) => x.type === 'infos_pratiques')!;
    const c = construireEmail('infos_pratiques', t.variables);
    assert.ok(c.ok);
    if (!c.ok) return;

    assert.ok(c.html.includes('width=device-width'), 'balise viewport absente');
    assert.ok(c.html.includes('max-width:600px'), 'largeur maximale absente');
    assert.ok(!/width:\s*[7-9]\d\d/.test(c.html), 'aucune largeur fixe supérieure à 600 px');
    assert.ok(c.texte.length > 200, 'la version texte doit être complète');
    assert.ok(c.texte.includes('Les Matinées du Bac'));
    assert.ok(!/undefined|NaN|\[object/.test(c.html), 'aucune valeur non résolue dans le HTML');
    assert.ok(!/undefined|NaN/.test(c.texte), 'aucune valeur non résolue dans le texte');
  });

  // --- Contrôles supplémentaires ---------------------------------------

  console.log('\n  Contrôles complémentaires\n');

  await test('21', 'Tous les modèles se construisent avec un jeu de variables complet', () => {
    const complet: Record<string, string> = {
      first_name: 'Léa',
      student_name: 'Léa Martin',
      parent_name: 'Mme Martin',
      subject_name: 'Français',
      session_date: 'samedi 6 septembre 2026',
      session_date_court: 'sam. 6 sept.',
      session_date_iso: '2026-09-06',
      start_time: '9 h 00',
      end_time: '13 h 00',
      connection_time: '8 h 45',
      teacher_name: 'Camille Durand',
      student_space_url: 'https://exemple.fr/espace-eleve',
      teacher_space_url: 'https://exemple.fr/espace-prof',
      video_room_url: salonUrl(SALLE_LEA),
      inscription_url: 'https://exemple.fr/inscription',
      correction_url: 'https://exemple.fr/espace-eleve',
      survey_url: 'https://exemple.fr/avis',
      support_email: 'matineesdubac@gmail.com',
      site_url: 'https://exemple.fr',
      inscription_ref: 'INSC-LEA',
      amount: '29',
      payment_reference: 'VIR-1',
      payment_status: 'paye',
      payment_status_label: 'réglé',
      payment_instructions: 'Virement sur le compte des Matinées du Bac',
      new_value: 'samedi 20 septembre 2026 à 9 h 00',
      old_value: 'samedi 6 septembre 2026 à 9 h 00',
      change_reason: 'Report demandé par le professeur.',
      student_count: '8',
      copy_count: '8',
      deadline_date: 'samedi 13 septembre 2026',
      remuneration: '40',
      grade: '14/20',
      places_restantes: '3',
    };
    for (const type of Object.keys(MODELES)) {
      const c = construireEmail(type, complet, { desinscriptionUrl: 'https://exemple.fr/d?jeton=x' });
      assert.ok(c.ok, `modèle ${type} : ${c.ok ? '' : c.raison}`);
      if (c.ok) {
        assert.ok(c.sujet.length > 5, `objet trop court pour ${type}`);
        assert.ok(!/undefined/.test(c.sujet), `objet non résolu pour ${type}`);
        assert.ok(!/undefined/.test(c.html), `HTML non résolu pour ${type}`);
      }
    }
  });

  await test('22', 'Une variable obligatoire manquante bloque l’envoi (pas de « undefined »)', () => {
    const c = construireEmail('infos_pratiques', { first_name: 'Léa', subject_name: 'Français' });
    assert.equal(c.ok, false);
    if (!c.ok) {
      assert.ok(c.manquantes.includes('session_date'));
      assert.ok(c.manquantes.includes('start_time'));
      assert.ok(c.manquantes.includes('student_space_url'));
    }
  });

  await test('23', 'Une adresse de bouton non https est refusée', () => {
    const c = construireEmail('inscription_confirmee', {
      first_name: 'Léa',
      subject_name: 'Français',
      student_space_url: 'javascript:alert(1)',
    });
    assert.equal(c.ok, false);
  });

  await test('24', 'Le contenu venant des données est échappé (pas d’injection HTML)', () => {
    const c = construireEmail('inscription_confirmee', {
      first_name: '<script>alert(1)</script>',
      subject_name: 'Français',
      student_space_url: 'https://exemple.fr/espace-eleve',
    });
    assert.ok(c.ok);
    if (c.ok) {
      assert.ok(!c.html.includes('<script>alert(1)</script>'), 'le HTML doit être échappé');
      assert.ok(c.html.includes('&lt;script&gt;'));
    }
  });

  await test('25', 'Heures et fuseau : « 9h » lu correctement, heure d’été gérée', () => {
    assert.deepEqual(lireHeure('9h'), { heures: 9, minutes: 0 });
    assert.deepEqual(lireHeure('09h30'), { heures: 9, minutes: 30 });
    assert.deepEqual(lireHeure('14:15'), { heures: 14, minutes: 15 });
    assert.equal(lireHeure('n’importe quoi'), null);
    assert.equal(formaterHeure('9h'), '9 h 00');
    assert.equal(heureMoins('9h', 15), '8 h 45');
    // Été : Paris = UTC+2 ; hiver : UTC+1.
    assert.equal(instantParis(2026, 9, 6, 9, 0).toISOString(), '2026-09-06T07:00:00.000Z');
    assert.equal(instantParis(2026, 12, 6, 9, 0).toISOString(), '2026-12-06T08:00:00.000Z');
  });

  await test('26', 'Rien d’antérieur à la mise en service ne déclenche de relance', () => {
    const vieille = inscription({ created_at: '2026-06-21T10:00:00.000Z' });
    const taches = planifier(contexte({ inscriptions: [vieille] }), {
      reglages: REGLAGES,
      maintenant: MAINTENANT,
    });
    assert.ok(!typesDe(taches).includes('paiement_attente'), 'pas de relance rétroactive');
    // En revanche, les rappels de la session à venir restent légitimes.
    assert.ok(typesDe(taches).includes('rappel_veille'));
  });

  await test('27', 'Les réglages de la base remplacent bien les valeurs par défaut', () => {
    const r = fusionnerReglages([
      { cle: 'rappel_veille_heure', valeur: '20' },
      { cle: 'quota_quotidien', valeur: '300' },
      { cle: 'inconnu', valeur: 'ignoré' },
      { cle: 'lien_avis_url', valeur: 'https://exemple.fr/avis' },
    ]);
    assert.equal(r.rappel_veille_heure, 20);
    assert.equal(r.lien_avis_url, 'https://exemple.fr/avis');
    assert.equal(r.infos_pratiques_jours_avant, REGLAGES_DEFAUT.infos_pratiques_jours_avant);
  });

  await test('28', 'La version texte reprend le même contenu que le HTML', () => {
    const contenu = {
      titre: 'Titre',
      blocs: [
        { type: 'paragraphe' as const, texte: 'Bonjour <strong>Léa</strong>' },
        { type: 'liste' as const, items: ['un', 'deux'] },
      ],
      bouton: { libelle: 'Ouvrir', url: 'https://exemple.fr/x' },
    };
    const texte = rendreTexte(contenu);
    assert.ok(texte.includes('Bonjour Léa'), 'les balises doivent disparaître');
    assert.ok(texte.includes('- un'));
    assert.ok(texte.includes('https://exemple.fr/x'), 'le lien doit être lisible en texte');
  });

  // --- Bilan ------------------------------------------------------------

  console.log(`\n  ${reussis} réussis, ${echoues} échoués\n`);
  if (echecs.length) {
    console.log('  Détail des échecs :\n');
    for (const e of echecs) console.log(`  ${e}\n`);
    process.exit(1);
  }
  console.log('  ✅ Tout est vert. Aucun e-mail n’a été envoyé.\n');
}

function messageTest() {
  return {
    destinataire: 'test@test-matineesdubac.fr',
    sujet: 'Test',
    html: '<p>Test</p>',
    texte: 'Test',
  };
}

main();
