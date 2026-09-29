/**
 * PUBLIER UNE CORRECTION DU PIPELINE DANS L'ESPACE D'UN ÉLÈVE.
 *
 *   npm run correction:publier -- <correction_id> [--dry-run]
 *   npm run correction:publier -- <email-eleve> <matiere> [--dry-run]
 *
 * Options :
 *   --dry-run            affiche ce qui serait fait, n'écrit RIEN ;
 *   --eleve <email>      e-mail de l'élève quand la correction n'en porte pas
 *                        (ou pour vérifier qu'on vise le bon) ;
 *   --inscription <id>   tranche quand l'élève a plusieurs inscriptions dans
 *                        la matière ;
 *   --sans-note          publie le dossier sans note dans l'espace ;
 *   --avec-note          force la note exacte même si le dossier n'affiche
 *                        qu'une fourchette ;
 *   --remplacer          l'inscription a déjà une AUTRE correction publiée
 *                        (recorrection) : la ligne existante est repointée
 *                        vers celle-ci au lieu d'en créer une seconde.
 *
 * Pourquoi ce script existe. La chaîne de correction (projet Supabase
 * « pipeline ») produit une correction et un dossier, lisible sur
 * /dossier/<correction_id>. Mais l'espace élève ne lit que la table CRM
 * `copies` (lignes `envoye = true`) : sans ce pont, la correction n'arrivait
 * jamais chez l'élève. Cindy dit « envoie la correction de X sur son espace »,
 * Claude lance cette commande.
 *
 * Ce qu'il fait, dans l'ordre :
 *   1. lit la correction du pipeline, vérifie qu'elle est corrigée, qu'elle
 *      n'est pas une copie étalon et qu'un dossier élève existe ;
 *   2. retrouve l'inscription CRM PAR E-MAIL + MATIÈRE (jamais par le nom) ;
 *      s'il y a le moindre doute, il s'arrête et liste les candidats ;
 *   3. crée — ou met à jour — UNE ligne `copies` reliée à la correction
 *      (`remarques.pipeline.correction_id`) : l'espace élève y affiche la note
 *      et le bouton « Mon dossier de correction » vers /dossier/<id> ;
 *   4. pose `inscriptions.correction_publiee_le` (seulement s'il est vide) et
 *      met en file l'e-mail « correction disponible ». Avec
 *      `validation_manuelle = oui`, il ATTEND le bouton « Valider et envoyer »
 *      de /admin/emails : ce script n'envoie aucun e-mail.
 *
 * Idempotent : relancer retrouve la même ligne `copies` (par l'identifiant de
 * correction) et la même clé d'e-mail — rien n'est dupliqué.
 *
 * Ce qu'il ne fait PAS : il ne modifie rien dans le pipeline, ne génère aucun
 * dossier, ne touche pas aux copies déposées par un prof.
 */
import './_env'; // EN PREMIER : voir le commentaire de ce fichier.

import { dossierUrlDeCopie, lienDossierPipeline } from '../src/lib/copiesPipeline';
import { cleMatiere, labelMatiere } from '../src/lib/matieres';
import { baremeGrille, pipelineDb, pipelineManquant, STATUTS_CORRIGE } from '../src/lib/pipeline';
import { emailsDb } from '../src/lib/emails/client';
import { chargerReglages, envoiDesactive, validationManuelle } from '../src/lib/emails/reglages';
import {
  CHAMPS_INSCRIPTION,
  CHAMPS_SESSION,
  cleSession,
  type ContextePlanification,
  type LigneInscription,
  type LigneSession,
} from '../src/lib/emails/donnees';
import { planifierEleve } from '../src/lib/emails/planificateur';
import { apresCorrectionPubliee } from '../src/lib/emails/declencheurs';

// ── Arguments ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SANS_NOTE = args.includes('--sans-note');
const REMPLACER = args.includes('--remplacer');
const AVEC_NOTE = args.includes('--avec-note');
function option(nom: string): string | null {
  const i = args.indexOf(`--${nom}`);
  return i > -1 ? args[i + 1] ?? null : null;
}
const positionnels = args.filter((a, i) => !a.startsWith('--') && !['--eleve', '--inscription'].includes(args[i - 1]));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

class Arret extends Error {}
function stop(message: string): never {
  throw new Arret(message);
}

// ── Types lus ────────────────────────────────────────────────────────────

type Correction = {
  id: string;
  status: string;
  matiere: string | null;
  student_name: string | null;
  student_email: string | null;
  est_etalon: boolean | null;
  moteur: string | null;
  rubric_id: string | null;
  max_score: number | null;
  max_analytique: number | null;
  groupe_copie_id: string | null;
  human_review_required: boolean | null;
  created_at: string;
  result_json: Record<string, unknown> | null;
};

type Inscription = {
  id: string;
  nom: string | null;
  email: string | null;
  matiere: string | null;
  session_id: string | null;
  date_epreuve: string | null;
  annulee_le: string | null;
  statut_eleve: string | null;
  correction_publiee_le: string | null;
  created_at: string;
};

const CHAMPS_CORRECTION =
  'id, status, matiere, student_name, student_email, est_etalon, moteur, rubric_id, max_score, ' +
  'max_analytique, groupe_copie_id, human_review_required, created_at, result_json';

// ── Note ─────────────────────────────────────────────────────────────────

function nombre(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * La note qui fait foi, et son barème. `result_json.note_finale` porte la note
 * du professeur quand `note_source = 'professeur'` (voir
 * /api/prof/sessions/[id]/generer) ; sinon c'est la note de l'IA. Le moteur
 * « barème par sujet » n'écrit pas de note_finale : on prend score_validated.
 */
async function noteDe(c: Correction) {
  const rj = c.result_json ?? {};
  const source = rj.note_source === 'professeur' ? 'professeur' : 'ia';
  const brute =
    (source === 'professeur' ? nombre(rj.note_professeur) : null) ??
    nombre(rj.note_finale) ??
    nombre(rj.score_validated) ??
    nombre(rj.analytic_sum);

  // Même logique que /api/pipeline/correction/[id] : toutes les épreuves ne
  // sont pas sur 20.
  let bareme = 20;
  if (c.moteur === 'criteres_rediges' && c.max_analytique) bareme = Number(c.max_analytique);
  else if (c.moteur === 'bareme_sujet' && (nombre(rj.max_score) ?? c.max_score)) bareme = Number(nombre(rj.max_score) ?? c.max_score);
  else if (c.rubric_id) {
    const { data } = await pipelineDb().from('rubrics').select('rubric_json').eq('id', c.rubric_id).maybeSingle();
    if (data) bareme = baremeGrille((data as { rubric_json: unknown }).rubric_json);
  }

  // L'espace élève affiche « /20 » en dur : on ramène sur 20, au quart de point.
  const sur20 = brute == null ? null : bareme === 20 ? brute : Math.round((brute * 20 / bareme) * 4) / 4;
  return { source, brute, bareme, sur20, noteIa: nombre(rj.note_ia) };
}

/**
 * Ce que le dossier montre en tête : une note exacte (« 12 / 20 », même suivie
 * de « soit une fourchette de 11 à 13 ») ou SEULEMENT une fourchette
 * (« 4 – 8 / 20 »). Dans le second cas, afficher 6/20 dans l'espace
 * contredirait le dossier.
 */
function affichageDossier(html: string) {
  const texte = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const n = '(\\d+(?:[.,]\\d+)?)';
  const premier = new RegExp(`${n}\\s*(?:[–-]\\s*${n}\\s*)?\\/\\s*20\\b`).exec(texte);
  if (!premier) return { type: 'inconnu' as const, texte: null };
  if (premier[2]) return { type: 'fourchette' as const, texte: `${premier[1]} – ${premier[2]} / 20` };
  const suite = texte.slice(premier.index, premier.index + 120);
  const f = /fourchette de\s*(\d+(?:[.,]\d+)?)\s*à\s*(\d+(?:[.,]\d+)?)/i.exec(suite);
  return {
    type: 'exacte' as const,
    texte: `${premier[1]} / 20${f ? ` (fourchette ${f[1]} à ${f[2]} affichée aussi)` : ''}`,
  };
}

// ── Recherche ────────────────────────────────────────────────────────────

async function dossierEleve(correctionId: string) {
  const { data, error } = await pipelineDb()
    .from('dossiers')
    .select('id, template_id, audience, content, created_at')
    .eq('correction_id', correctionId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) stop(`Lecture du dossier impossible : ${error.message}`);
  return (data?.[0] ?? null) as { id: string; template_id: string; audience: string; content: string; created_at: string } | null;
}

async function correctionParId(id: string): Promise<Correction> {
  const { data, error } = await pipelineDb().from('corrections').select(CHAMPS_CORRECTION).eq('id', id).maybeSingle();
  if (error) stop(`Lecture de la correction impossible : ${error.message}`);
  if (!data) stop(`Aucune correction ${id} dans le pipeline.`);
  return data as unknown as Correction;
}

async function correctionParEmail(email: string, matiere: string): Promise<Correction> {
  const cle = cleMatiere(matiere);
  if (!cle) stop(`Matière inconnue : « ${matiere} ». Exemples : francais, philosophie, maths, ses, svt, hggsp, hlp, physique-chimie, anglais.`);
  const { data, error } = await pipelineDb()
    .from('corrections')
    .select(CHAMPS_CORRECTION)
    .in('matiere', [...new Set([cle, labelMatiere(cle)])])
    .in('status', STATUTS_CORRIGE)
    .order('created_at', { ascending: false });
  if (error) stop(`Lecture des corrections impossible : ${error.message}`);
  // Comparaison en JS : un `ilike` prendrait le « _ » d'une adresse pour un joker.
  const lignes = ((data ?? []) as unknown as Correction[]).filter(
    (c) => norm(c.student_email) === email && !c.est_etalon,
  );
  if (!lignes.length) {
    stop(`Aucune correction terminée pour ${email} en ${labelMatiere(cle)} dans le pipeline.\n` +
      `  (Si la correction ne porte pas d'e-mail, relance avec son identifiant : <correction_id> --eleve ${email})`);
  }
  if (lignes.length > 1) {
    const liste = lignes.map((c) => `  - ${c.id}  déposée le ${c.created_at.slice(0, 10)}  statut ${c.status}`).join('\n');
    stop(`Plusieurs corrections pour ${email} en ${labelMatiere(cle)} — laquelle ?\n${liste}\n` +
      `Relance avec l'identifiant : npm run correction:publier -- <correction_id>`);
  }
  return lignes[0];
}

type CopieCrm = {
  id: string; eleve_email: string | null; matiere: string; note: number | null;
  envoye: boolean | null; statut: string; remarques: Record<string, unknown> | null;
};

/** Ligne `copies` déjà reliée à cette correction (relance idempotente). */
async function copieExistante(correctionId: string) {
  const { data, error } = await emailsDb()
    .from('copies')
    .select('id, eleve_email, matiere, note, envoye, statut, remarques')
    .eq('remarques->pipeline->>correction_id', correctionId);
  if (error) stop(`Lecture des copies CRM impossible : ${error.message}`);
  if ((data ?? []).length > 1) {
    stop(`Anomalie : ${data!.length} lignes copies pointent déjà vers la correction ${correctionId} (${data!.map((d) => d.id).join(', ')}). À nettoyer avant de republier.`);
  }
  return (data?.[0] ?? null) as CopieCrm | null;
}

async function trouverInscription(
  email: string,
  cle: string,
  correction: Correction,
  imposee: string | null,
): Promise<Inscription> {
  const db = emailsDb();
  const champs = 'id, nom, email, matiere, session_id, date_epreuve, annulee_le, statut_eleve, correction_publiee_le, created_at';

  if (imposee) {
    const { data } = await db.from('inscriptions').select(champs).eq('id', imposee).maybeSingle();
    const i = data as Inscription | null;
    if (!i) stop(`Inscription ${imposee} introuvable.`);
    if (norm(i.email) !== email) stop(`L'inscription ${imposee} appartient à ${i.email}, pas à ${email}.`);
    if (cleMatiere(i.matiere ?? '') !== cle) stop(`L'inscription ${imposee} est en ${i.matiere}, pas en ${labelMatiere(cle)}.`);
    return i;
  }

  // Par e-mail exact (insensible à la casse), jamais par le nom.
  const { data, error } = await db.from('inscriptions').select(champs).ilike('email', email.replace(/[\\%_]/g, '\\$&'));
  if (error) stop(`Lecture des inscriptions impossible : ${error.message}`);
  const toutes = ((data ?? []) as Inscription[]).filter((i) => norm(i.email) === email);
  if (!toutes.length) stop(`Aucune inscription au CRM avec l'adresse ${email}. L'élève doit être inscrit(e) pour avoir un espace.`);

  const memeMatiere = toutes.filter((i) => cleMatiere(i.matiere ?? '') === cle);
  const actives = memeMatiere.filter((i) => !i.annulee_le && i.statut_eleve !== 'annule');
  if (!actives.length) {
    stop(`${email} n'a aucune inscription active en ${labelMatiere(cle)}` +
      (memeMatiere.length ? ` (${memeMatiere.length} annulée(s)).` : ` (inscrit(e) en : ${[...new Set(toutes.map((i) => i.matiere))].join(', ')}).`));
  }
  if (actives.length === 1) return actives[0];

  // Plusieurs bacs blancs dans la matière : on ne garde que ceux déjà passés
  // au moment du dépôt de la copie. S'il en reste un seul, c'est lui.
  const depot = correction.created_at.slice(0, 10);
  const passees = actives.filter((i) => i.date_epreuve && i.date_epreuve <= depot);
  const plusRecente = passees.sort((a, b) => (b.date_epreuve ?? '').localeCompare(a.date_epreuve ?? ''));
  const nonPubliees = plusRecente.filter((i) => !i.correction_publiee_le);
  if (nonPubliees.length === 1) return nonPubliees[0];

  const liste = actives
    .map((i) => `  - ${i.id}  épreuve du ${i.date_epreuve ?? '?'}${i.correction_publiee_le ? '  (correction déjà publiée)' : ''}`)
    .join('\n');
  stop(`${email} a ${actives.length} inscriptions actives en ${labelMatiere(cle)} — laquelle correspond à cette copie ?\n${liste}\n` +
    `Relance avec --inscription <id>.`);
}

// ── Programme ────────────────────────────────────────────────────────────

async function principal() {
  if (!positionnels.length) {
    console.error(
      'Usage :\n' +
      '  npm run correction:publier -- <correction_id> [--eleve <email>] [--dry-run]\n' +
      '  npm run correction:publier -- <email-eleve> <matiere> [--dry-run]\n' +
      'Options : --inscription <id>  --sans-note  --avec-note  --remplacer',
    );
    process.exit(1);
  }
  const manquants = pipelineManquant();
  if (manquants.length) stop(`Pipeline non configuré (variables manquantes : ${manquants.join(', ')}).`);
  if (SANS_NOTE && AVEC_NOTE) stop('--sans-note et --avec-note sont incompatibles.');

  // 1. La correction.
  const premier = positionnels[0];
  let correction: Correction;
  let email: string;
  if (UUID.test(premier)) {
    correction = await correctionParId(premier);
    const demande = option('eleve');
    const porte = norm(correction.student_email) || null;
    if (demande && porte && norm(demande) !== porte) {
      stop(`La correction porte l'adresse ${porte}, pas ${norm(demande)}. Rien n'est fait.`);
    }
    email = norm(demande) || porte || '';
    if (!email) {
      stop(`La correction ${correction.id} (« ${correction.student_name ?? 'sans nom'} ») ne porte aucun e-mail.\n` +
        `Précise l'élève par son adresse : --eleve <email>. (Jamais par le nom seul.)`);
    }
  } else if (premier.includes('@')) {
    if (!positionnels[1]) stop('Il manque la matière : npm run correction:publier -- <email> <matiere>');
    email = norm(premier);
    correction = await correctionParEmail(email, positionnels[1]);
  } else {
    stop(`« ${premier} » n'est ni un identifiant de correction ni une adresse e-mail. Jamais de recherche par nom.`);
  }

  if (correction.est_etalon) stop('Cette correction est une copie ÉTALON (calibration), pas une copie d’élève.');
  if (!STATUTS_CORRIGE.includes(correction.status)) {
    stop(`Correction pas terminée (statut « ${correction.status} »).`);
  }
  if (correction.groupe_copie_id) {
    stop('Cette copie fait partie d’un bac blanc en plusieurs exercices (groupe_copie_id) : un dossier par exercice, ' +
      'une note sur l’épreuve entière. Ce cas n’est pas encore géré par cet outil — rien n’est fait.');
  }
  const cle = cleMatiere(correction.matiere ?? '');
  if (!cle) stop(`Matière de la correction non reconnue : « ${correction.matiere} ».`);

  const dossier = await dossierEleve(correction.id);
  if (!dossier?.content) stop('Aucun dossier généré pour cette correction : rien à montrer à l’élève.');
  if (dossier.audience && dossier.audience !== 'eleve') stop(`Le dernier dossier est destiné à « ${dossier.audience} », pas à l’élève.`);

  // 2. Déjà publiée ? Alors on garde l'inscription d'origine.
  let existante: CopieCrm | null = await copieExistante(correction.id);
  const inscriptionMemo = (existante?.remarques?.pipeline as { inscription_id?: string } | undefined)?.inscription_id ?? null;
  if (existante && norm(existante.eleve_email) !== email) {
    stop(`Cette correction est déjà publiée pour ${existante.eleve_email}, pas pour ${email}. Rien n'est fait.`);
  }
  const inscription = await trouverInscription(email, cle, correction, option('inscription') ?? inscriptionMemo);

  // Une inscription = un bac blanc = UNE ligne dans l'espace. Si une autre
  // correction y est déjà publiée, on ne crée pas de doublon en silence.
  if (!existante) {
    const { data: autres, error } = await emailsDb()
      .from('copies')
      .select('id, eleve_email, matiere, note, envoye, statut, remarques')
      .eq('remarques->pipeline->>inscription_id', inscription.id);
    if (error) stop(`Lecture des copies CRM impossible : ${error.message}`);
    const autre = ((autres ?? [])[0] ?? null) as CopieCrm | null;
    if (autre) {
      const ancienne = (autre.remarques?.pipeline as { correction_id?: string } | undefined)?.correction_id;
      if (!REMPLACER) {
        stop(`Cette inscription a déjà une correction publiée (${ancienne}, copie ${autre.id}).\n` +
          `Pour la remplacer par ${correction.id} : relance avec --remplacer. Rien n'est fait.`);
      }
      existante = autre;
    }
  }

  let session: LigneSession | null = null;
  if (inscription.session_id) {
    const { data } = await emailsDb().from('sessions_bacs_blancs').select(CHAMPS_SESSION).eq('id', inscription.session_id).maybeSingle();
    session = (data as unknown as LigneSession) ?? null;
  }
  const dateEpreuve = session?.date_epreuve ?? inscription.date_epreuve ?? null;

  // 3. La note.
  const note = await noteDe(correction);
  const affiche = affichageDossier(dossier.content);
  let noteEspace: number | null = note.sur20;
  let raisonSansNote: string | null = null;
  if (SANS_NOTE) {
    noteEspace = null;
    raisonSansNote = 'option --sans-note';
  } else if (!AVEC_NOTE && affiche.type === 'fourchette' && note.source !== 'professeur') {
    noteEspace = null;
    raisonSansNote = `le dossier n'affiche qu'une fourchette (${affiche.texte}) : une note exacte dans l'espace le contredirait (--avec-note pour la forcer)`;
  }

  // 4. La ligne `copies`.
  const maintenant = new Date().toISOString();
  const lienPipeline = {
    correction_id: correction.id,
    inscription_id: inscription.id,
    session_id: session?.id ?? inscription.session_id ?? null,
    note_source: note.source,
    publie_le: (existante?.remarques?.pipeline as { publie_le?: string } | undefined)?.publie_le ?? maintenant,
    maj_le: maintenant,
    publie_par: 'claude-code:correction:publier',
  };
  const ligne = {
    matiere: inscription.matiere ?? labelMatiere(cle),
    eleve_nom: (inscription.nom ?? '').trim() || correction.student_name || email,
    eleve_email: email,
    note: noteEspace,
    statut: 'envoyé',
    envoye: true,
    a_envoyer: false,
    pdf_pret: false,
    // Rien pour l'Apps Script qui prévient les profs (statut « corrigée » +
    // prof_notifie = false) : cette copie ne vient d'aucun prof.
    prof_notifie: true,
    remarques: { ...(existante?.remarques ?? {}), pipeline: lienPipeline },
  };

  // 5. L'e-mail « correction disponible » : aperçu fidèle, calculé par le même
  // planificateur que le moteur, avec la date de publication simulée.
  const reglages = await chargerReglages(true);
  const { data: brute } = await emailsDb().from('inscriptions').select(CHAMPS_INSCRIPTION).eq('id', inscription.id).maybeSingle();
  const pourPlan = { ...(brute as unknown as LigneInscription), correction_publiee_le: inscription.correction_publiee_le ?? maintenant };
  const ctx: ContextePlanification = {
    inscriptions: [], sessions: new Map(), sessionsParCle: new Map(), coachs: [], profs: new Map(),
    copiesParEmail: new Map(), preinscriptions: [],
  };
  if (session) {
    ctx.sessions.set(session.id, session);
    ctx.sessionsParCle.set(cleSession(session.matiere, session.date_epreuve), session);
  }
  const prevus = planifierEleve(pourPlan, ctx, reglages, new Date(), new Date(reglages.actif_depuis))
    .filter((t) => t.type === 'correction_disponible' || t.type === 'demande_avis');
  const cles = prevus.map((t) => t.cle_idempotence);
  const { data: dejaEnFile } = cles.length
    ? await emailsDb().from('emails').select('type, statut, cle_idempotence').in('cle_idempotence', cles)
    : { data: [] as { type: string; statut: string; cle_idempotence: string }[] };
  const etatEmail = (type: string) => {
    const t = prevus.find((p) => p.type === type);
    if (!t) return 'non prévu (inscription hors parcours e-mail : voir réglages / actif_depuis)';
    const d = (dejaEnFile ?? []).find((e) => e.cle_idempotence === t.cle_idempotence);
    if (d) return `déjà en file (statut « ${d.statut} ») — pas de doublon`;
    return `sera mis en file pour le ${new Date(t.planifie_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
  };

  // ── Récapitulatif ──
  const fmt = (n: number | null) => (n == null ? '—' : String(n).replace('.', ','));
  console.log('');
  console.log(DRY ? '🔎 SIMULATION (--dry-run) — rien n’est écrit' : '📤 PUBLICATION');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`Élève        : ${ligne.eleve_nom} <${email}>`);
  console.log(`Inscription  : ${inscription.id} — ${inscription.matiere}, épreuve du ${dateEpreuve ?? '?'}${session ? ` (session ${session.id})` : ' (sans session rattachée)'}`);
  console.log(`Correction   : ${correction.id} — ${labelMatiere(cle)}, statut ${correction.status}, moteur ${correction.moteur ?? '?'}`);
  console.log(`Dossier      : ${dossier.template_id} du ${dossier.created_at.slice(0, 10)} → ${lienDossierPipeline(correction.id)}`);
  console.log(`Dossier affiche : ${affiche.texte ?? 'aucune note repérée'}`);
  console.log(`Note         : ${fmt(note.brute)} / ${fmt(note.bareme)} — ${note.source === 'professeur' ? `note du PROFESSEUR (IA : ${fmt(note.noteIa)})` : 'note de l’IA (pas de note prof)'}`);
  if (note.bareme !== 20 && note.sur20 != null) console.log(`               ramenée sur 20 : ${fmt(note.sur20)} / 20`);
  console.log(`Dans l'espace : ${noteEspace == null ? `« ✓ Corrigé », sans note — ${raisonSansNote ?? 'aucune note lisible'}` : `${fmt(noteEspace)}/20`} + bouton « 📘 Mon dossier de correction »`);
  if (correction.status === 'corrected_review' && note.source !== 'professeur') {
    console.log('⚠️  Correction marquée « à relire » et aucune note de prof : elle part telle quelle.');
  }
  const remplacee = (existante?.remarques?.pipeline as { correction_id?: string } | undefined)?.correction_id;
  console.log(`Ligne copies : ${!existante ? 'créée'
    : remplacee && remplacee !== correction.id ? `mise à jour (${existante.id}) — remplace la correction ${remplacee}`
    : `mise à jour (${existante.id}) — déjà publiée, rien ne sera dupliqué`}`);
  console.log(`correction_publiee_le : ${inscription.correction_publiee_le ? `déjà posé (${inscription.correction_publiee_le}) — inchangé` : 'posé maintenant'}`);
  console.log(`E-mail « correction disponible » : ${etatEmail('correction_disponible')}`);
  console.log(`E-mail « demande d’avis »         : ${etatEmail('demande_avis')}`);
  console.log(`Validation manuelle : ${validationManuelle(reglages) ? 'OUI — rien ne part sans « Valider et envoyer » sur /admin/emails' : '⚠️ NON — le moteur enverra seul'}` +
    `${envoiDesactive(reglages) ? ' ; envoi désactivé (envoi_actif=non)' : ''}`);
  console.log('──────────────────────────────────────────────────────────');

  if (DRY) {
    console.log('Simulation terminée. Relance sans --dry-run pour publier.');
    return;
  }

  // ── Écritures ──
  const db = emailsDb();
  let copieId = existante?.id ?? null;
  if (existante) {
    const { error } = await db.from('copies').update(ligne).eq('id', existante.id);
    if (error) stop(`Mise à jour de la copie impossible : ${error.message}`);
  } else {
    const { data, error } = await db
      .from('copies')
      .insert({
        ...ligne,
        // Obligatoire en base ; le texte de la copie vit dans le pipeline.
        copie_texte: `(Copie corrigée par la chaîne de correction — dossier : ${lienDossierPipeline(correction.id)})`,
        // Daté du jour de l'épreuve : l'espace rapproche copie et inscription
        // par la date la plus proche, et la courbe de notes suit l'ordre réel.
        ...(dateEpreuve ? { created_at: `${dateEpreuve}T12:00:00` } : {}),
      })
      .select('id')
      .single();
    if (error) stop(`Création de la copie impossible : ${error.message}`);
    copieId = (data as { id: string }).id;
  }

  if (!inscription.correction_publiee_le) {
    const { error } = await db.from('inscriptions').update({ correction_publiee_le: maintenant }).eq('id', inscription.id).is('correction_publiee_le', null);
    if (error) stop(`correction_publiee_le non posé : ${error.message} (la copie est pourtant visible)`);
  }
  // Même chemin que le bouton « correction publiée » de l'administration.
  const misEnFile = await apresCorrectionPubliee(inscription.id);

  // Relecture : ce que l'espace élève verra vraiment.
  const { data: relue } = await db.from('copies').select('eleve_email, envoye, note, remarques').eq('id', copieId!).maybeSingle();
  const visible = Boolean(relue && relue.envoye && relue.eleve_email === email && dossierUrlDeCopie(relue.remarques));
  console.log(`✅ Publié. Copie ${copieId} visible dans l'espace de ${email} : ${visible ? `oui (note ${fmt(relue?.note ?? null)}, dossier ${dossierUrlDeCopie(relue?.remarques)})` : '⚠️ NON (vérifier)'}.`);
  console.log(`   E-mails mis en file maintenant : ${misEnFile} (en attente de validation sur /admin/emails si validation_manuelle = oui).`);
}

principal().catch((err) => {
  if (err instanceof Arret) {
    console.error(`\n⛔ ${err.message}\n`);
  } else {
    console.error('\n❌ Erreur inattendue :', err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
