'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { LiaisonDiscord } from '@/components/LiaisonDiscord';
import { SESSIONS_PLATEFORME, chargerSessionsPubliques, examenDeMatiere, type Session } from '@/lib/sessions';

// Les sessions telles qu'elles sont en base, chargées une fois par visite.
// Module et non état : `heuresEpreuve` est appelée par des composants qui n'ont
// pas la liste sous la main. Le remplacement déclenche un rendu du composant
// principal (il pose aussi un état), donc les enfants relisent la bonne valeur.
let SESSIONS_CONNUES: Session[] = SESSIONS_PLATEFORME;

type Copie = {
  id: string;
  matiere: string;
  eleve_nom: string;
  statut: string;
  note: number | null;
  fichier_nom: string | null;
  pdf_pret: boolean;
  created_at: string;
};

type Inscription = {
  id: string;
  nom: string;
  matiere: string;
  date_epreuve: string | null;
  created_at: string;
  // Signé par le serveur (voir src/lib/codeCopie.ts). Absent si le serveur n'a
  // pas de secret : on préfère masquer l'accès plutôt que d'exposer une adresse
  // devinable.
  code_copie?: string | null;
  // Adresse de la salle vocale Discord de cet élève, construite par le serveur
  // (voir /api/inscriptions). Absente tant qu'aucune salle ne lui est
  // attribuée : dans ce cas le bouton reste verrouillé plutôt que de mener
  // nulle part le matin de l'épreuve.
  salon_url?: string | null;
};

const COULEURS: Record<string, string> = {
  'Français':       '#7C3AED',
  'Philosophie':    '#2563EB',
  'Mathématiques':  '#059669',
  'Histoire-Géo':   '#D97706',
  'SES':            '#DC2626',
  'Spécialité 1':   '#0891B2',
  'Spécialité 2':   '#C026D3',
};
const couleur = (m: string) => COULEURS[m] ?? '#6B7280';

// La salle de l'élève est sa salle vocale Discord, et rien d'autre. Elle n'est
// plus déduite de son identifiant : elle lui est attribuée en base au moment où
// on prépare les salles du bac blanc. Pas de salle attribuée = pas de lien.
const salonUrl = (i: Inscription) => i.salon_url ?? null;

// ── Espace écriture (application « le téléphone devient le stylo ») ──────────
// Le code d'une copie (« lea-martin-x7f3 ») est signé par le serveur et arrive
// avec l'inscription : il ne peut pas être recalculé ici, et c'est justement ce
// qui empêche de deviner l'adresse de la copie d'un autre élève à partir de son
// nom. Voir src/lib/codeCopie.ts.
// L'adresse de production sert de valeur par défaut : ce n'est pas un secret,
// et le bouton ne doit pas disparaître si la variable d'environnement manque.
// NEXT_PUBLIC_ECRITURE_URL reste prioritaire (développement local, changement
// de domaine) ; on lui retire espaces et barre oblique finale, deux fautes de
// saisie qui casseraient silencieusement tous les liens.
const ECRITURE_URL = (
  process.env.NEXT_PUBLIC_ECRITURE_URL?.trim() || 'https://matinees-appweb-ecriture.vercel.app'
).replace(/\/+$/, '');
// Page à ouvrir sur l'ORDINATEUR : elle affiche la copie A4 et le QR code que
// l'élève scanne avec son téléphone.
const ecritureUrl = (i: Inscription) =>
  `${ECRITURE_URL}/copie/${i.code_copie}?m=${encodeURIComponent(i.matiere)}`;

// --- Le sujet de l'épreuve -------------------------------------------

/** Ce que renvoie /api/eleve/sujets. Miroir de `SujetEleve` côté serveur. */
type SujetEleveVue = {
  sujet_id: string;
  session_id: string;
  matiere: string;
  date_epreuve: string;
  heure_debut: string | null;
  debut_le: string | null;
  titre: string | null;
  consigne: string | null;
  fichier_nom: string | null;
  disponible: boolean;
  ouverture_prevue: string | null;
};

/** Jamais bloquant : pas de session, table absente → aucun sujet, pas d'erreur. */
async function chargerSujets(): Promise<SujetEleveVue[]> {
  try {
    const r = await fetch('/api/eleve/sujets');
    if (!r.ok) return [];
    const data = await r.json();
    return (data.sujets ?? []) as SujetEleveVue[];
  } catch {
    return [];
  }
}

function fmtHeure(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** « dans 7 min », « dans 2 h 15 ». Null quand c'est passé. */
function dansCombien(iso: string, now: Date): string | null {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `dans ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `dans ${h} h ${String(m).padStart(2, '0')}` : `dans ${h} h`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function joursRestants(iso: string) {
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(iso); d.setHours(0,0,0,0);
  const diff = Math.round((d.getTime()-t.getTime())/86400000);
  if (diff === 0) return "Aujourd'hui !";
  if (diff === 1) return 'Demain';
  if (diff < 0)  return null;
  return `J-${diff}`;
}
/**
 * Le sujet du jour : soit il est ouvert et l'élève le télécharge, soit il
 * s'ouvre à une heure précise et on la lui dit — avec le décompte, pour qu'il
 * n'ait pas à recharger la page ni à demander au surveillant.
 *
 * Le lien de téléchargement dure cinq minutes et n'est demandé qu'au clic :
 * rien de partageable ne traîne dans la page.
 */
function CarteSujet({ s, now }: { s: SujetEleveVue; now: Date }) {
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const c = couleur(s.matiere);

  const ouvrir = async () => {
    setErreur('');
    setChargement(true);
    try {
      const r = await fetch('/api/eleve/sujets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sujet_id: s.sujet_id }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error || 'Sujet indisponible.');
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setChargement(false);
    }
  };

  const attente = !s.disponible && s.ouverture_prevue ? dansCombien(s.ouverture_prevue, now) : null;

  return (
    <div style={{ background: '#fff', border: `2px solid ${s.disponible ? c : '#E5E7EB'}`, borderRadius: 18, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <p style={{ fontSize: '.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: c, marginBottom: 4 }}>
          Sujet · {s.matiere}
        </p>
        <p style={{ fontWeight: 800, color: '#1E1145', fontSize: '1.05rem' }}>
          {s.titre || `Bac blanc du ${fmtDate(s.date_epreuve)}`}
        </p>
        {s.consigne && <p style={{ fontSize: '.85rem', color: '#4B5563', marginTop: 4 }}>{s.consigne}</p>}
        {!s.disponible && (
          <p style={{ fontSize: '.85rem', color: '#6B7280', marginTop: 6 }}>
            {s.ouverture_prevue
              ? attente
                ? `🔒 Il s’ouvre à ${fmtHeure(s.ouverture_prevue)} — ${attente}`
                : '🔓 Ouverture imminente, actualise dans une minute'
              : '🔒 Le sujet sera mis en ligne juste avant l’épreuve'}
          </p>
        )}
      </div>

      {s.disponible ? (
        <button
          onClick={ouvrir}
          disabled={chargement}
          style={{ background: c, color: '#fff', border: 'none', padding: '13px 22px', borderRadius: 14, fontWeight: 800, fontSize: '.95rem', cursor: chargement ? 'wait' : 'pointer', flexShrink: 0 }}
        >
          {chargement ? 'Ouverture…' : '📄 Ouvrir mon sujet'}
        </button>
      ) : (
        <span style={{ fontSize: '.85rem', fontWeight: 800, color: '#9CA3AF', flexShrink: 0 }}>
          {s.heure_debut ? `Épreuve à ${s.heure_debut}` : 'Horaire à confirmer'}
        </span>
      )}

      {erreur && <p style={{ width: '100%', fontSize: '.8rem', color: '#DC2626' }}>{erreur}</p>}
    </div>
  );
}

function prenom(nom: string) { return nom.split(' ')[0]; }
// Couleur d'une note /20 : rouge < 8, orange < 10, ambre < 12, vert < 16, vert vif ≥ 16
function couleurNote(n: number) {
  if (n < 8)  return '#DC2626';
  if (n < 10) return '#EA580C';
  if (n < 12) return '#D97706';
  if (n < 16) return '#059669';
  return '#10B981';
}
function fmtNote(n: number) { return Number.isInteger(n) ? `${n}` : n.toFixed(1).replace('.', ','); }

// ── Horaires du salon ────────────────────────────────────────────────────────
// Le salon visio n'est PAS rejoignable à l'avance : le bouton ne devient
// cliquable qu'une heure avant le début de l'épreuve, et se referme une heure
// après la fin. L'heure vient de la session plateforme correspondante
// (« 9h — 13h ») ; à défaut on suppose 9h — 13h, l'horaire des Matinées.
function heuresEpreuve(i: Inscription): { debut: number; fin: number; label: string | null } {
  const s = SESSIONS_CONNUES.find(s => s.matiere === i.matiere && s.date === i.date_epreuve);
  const m = s?.heure.match(/(\d+)\s*h\s*(?:—|–|-)\s*(\d+)\s*h/);
  if (m) return { debut: +m[1], fin: +m[2], label: s!.heure };
  return { debut: 9, fin: 13, label: null };
}
type EtatSalon = 'ouvert' | 'pas-encore' | 'sans-date' | 'sans-salle';
function etatSalon(i: Inscription, now: Date): EtatSalon {
  if (!i.date_epreuve) return 'sans-date';
  // La salle n'a pas encore été préparée : mieux vaut le dire que d'afficher un
  // bouton qui ouvrirait une page Discord vide.
  if (!salonUrl(i)) return 'sans-salle';
  const { debut, fin } = heuresEpreuve(i);
  const ouverture = new Date(i.date_epreuve); ouverture.setHours(debut - 1, 0, 0, 0);
  const fermeture = new Date(i.date_epreuve); fermeture.setHours(fin + 1, 0, 0, 0);
  return now >= ouverture && now <= fermeture ? 'ouvert' : 'pas-encore';
}

// Bouton salon : cliquable seulement à partir de H-1 (sinon verrouillé, pas un
// lien — un élève ne doit pas pouvoir rejoindre le salon avant, ni sur une
// session dont la date n'est pas fixée).
function BoutonSalon({ i, now, grand }: { i: Inscription; now: Date; grand?: boolean }) {
  const etat = etatSalon(i, now);
  const c = couleur(i.matiere);
  const lien = salonUrl(i);
  if (etat === 'ouvert' && lien) {
    return grand ? (
      <a href={lien} target="_blank" rel="noreferrer"
        style={{ background: 'rgba(255,255,255,.95)', color: c, padding: '13px 22px', borderRadius: 14, fontWeight: 800, fontSize: '.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(0,0,0,.15)' }}>
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Rejoindre mon salon
      </a>
    ) : (
      <a href={lien} target="_blank" rel="noreferrer"
        style={{ fontSize: '.75rem', fontWeight: 700, color: c, background: c+'15', padding: '5px 12px', borderRadius: 100, textDecoration: 'none' }}>
        Salon →
      </a>
    );
  }
  const texteGrand = etat === 'sans-date'
    ? '🔒 Salon — dès que ta date est fixée'
    : etat === 'sans-salle'
      ? '🔒 Salon — en cours de préparation'
      : `🔒 Salon — s'ouvre à ${heuresEpreuve(i).debut - 1}h le jour J`;
  return grand ? (
    <span title="Le salon ouvre 1 h avant le début de l'épreuve"
      style={{ background: 'rgba(255,255,255,.25)', color: 'rgba(255,255,255,.75)', padding: '13px 22px', borderRadius: 14, fontWeight: 800, fontSize: '.95rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'not-allowed', border: '1.5px dashed rgba(255,255,255,.5)' }}>
      {texteGrand}
    </span>
  ) : (
    <span title="Le salon ouvre 1 h avant le début de l'épreuve"
      style={{ fontSize: '.75rem', fontWeight: 700, color: '#9CA3AF', background: '#F3F4F6', padding: '5px 12px', borderRadius: 100, cursor: 'not-allowed' }}>
      🔒 Salon
    </span>
  );
}

// ── Mode aperçu (URL ?demo=1) : élève fictif déjà noté, pour visualiser le rendu.
// N'affecte jamais la prod : activé uniquement par le paramètre d'URL, aucune donnée réelle touchée.
const DEMO_INSCRIPTIONS: Inscription[] = [
  { id: 'demo-fr', nom: 'Léa Martin', matiere: 'Français',       date_epreuve: '2026-03-14', created_at: '2026-02-01T09:00:00Z', code_copie: 'lea-martin-demo01' },
  { id: 'demo-ph', nom: 'Léa Martin', matiere: 'Philosophie',    date_epreuve: '2026-04-11', created_at: '2026-03-01T09:00:00Z', code_copie: 'lea-martin-demo02' },
  { id: 'demo-ma', nom: 'Léa Martin', matiere: 'Mathématiques',  date_epreuve: '2026-05-16', created_at: '2026-04-01T09:00:00Z', code_copie: 'lea-martin-demo03' },
  { id: 'demo-hg', nom: 'Léa Martin', matiere: 'Histoire-Géo',   date_epreuve: '2026-09-27', created_at: '2026-07-01T09:00:00Z', code_copie: 'lea-martin-demo04' },
  // Sans date : reproduit une inscription dont la session n'est pas planifiée.
  { id: 'demo-sp', nom: 'Léa Martin', matiere: 'Spécialité 1',   date_epreuve: null,         created_at: '2026-07-20T09:00:00Z', code_copie: 'lea-martin-demo05' },
];
const DEMO_COPIES: Copie[] = [
  { id: 'demo-fr', matiere: 'Français',      eleve_nom: 'Léa Martin', statut: 'corrigée', note: 14,   fichier_nom: 'copie-francais.pdf', pdf_pret: true, created_at: '2026-03-14T13:00:00Z' },
  { id: 'demo-ph', matiere: 'Philosophie',   eleve_nom: 'Léa Martin', statut: 'corrigée', note: 11.5, fichier_nom: 'copie-philo.pdf',    pdf_pret: true, created_at: '2026-04-11T13:00:00Z' },
  { id: 'demo-ma', matiere: 'Mathématiques', eleve_nom: 'Léa Martin', statut: 'corrigée', note: 8,    fichier_nom: 'copie-maths.pdf',    pdf_pret: true, created_at: '2026-05-16T13:00:00Z' },
  // Deuxième copie de la même matière, sans inscription liée : vérifie que
  // l'historique montre bien TOUTES les copies, pas une seule par matière.
  { id: 'demo-fr2', matiere: 'Français',     eleve_nom: 'Léa Martin', statut: 'corrigée', note: 12,   fichier_nom: 'copie-francais-2.pdf', pdf_pret: true, created_at: '2026-06-10T13:00:00Z' },
];

/**
 * Aperçu des deux états du sujet, pour `?demo=1` : celui d'aujourd'hui, déjà
 * ouvert, et celui qui s'ouvrira tout à l'heure avec son décompte. Les dates
 * sont calculées à l'affichage, sinon l'aperçu vieillirait.
 */
function demoSujets(): SujetEleveVue[] {
  const auj = new Date();
  const jour = auj.toISOString().slice(0, 10);
  const dansUneHeure = new Date(auj.getTime() + 60 * 60_000);
  return [
    {
      sujet_id: 'demo-sujet-1',
      session_id: 'demo-session-1',
      matiere: 'Histoire-Géo',
      date_epreuve: jour,
      heure_debut: '9h',
      debut_le: auj.toISOString(),
      titre: 'Bac blanc Histoire-Géo — sujet',
      consigne: 'Deux exercices. Aucun document personnel autorisé.',
      fichier_nom: 'sujet-histoire-geo.pdf',
      disponible: true,
      ouverture_prevue: null,
    },
    {
      sujet_id: 'demo-sujet-2',
      session_id: 'demo-session-2',
      matiere: 'Français',
      date_epreuve: jour,
      heure_debut: '14h',
      debut_le: new Date(dansUneHeure.getTime() + 10 * 60_000).toISOString(),
      titre: 'Bac blanc Français — sujet',
      consigne: null,
      fichier_nom: null,
      disponible: false,
      ouverture_prevue: dansUneHeure.toISOString(),
    },
  ];
}

// ── Check-list du jour J ─────────────────────────────────────────────────────
const CHECKLIST: { icone: string; titre: string; detail: string }[] = [
  { icone: '🖥️', titre: 'Un ordinateur avec caméra et micro', detail: 'C’est lui qui te connecte à ton salon visio pendant toute l’épreuve.' },
  { icone: '🌐', titre: 'Une connexion internet stable', detail: 'Rapproche-toi de la box si possible, préviens ta famille que tu passes une épreuve.' },
  { icone: '✍️', titre: 'De quoi écrire ta copie', detail: 'Ton Google Doc prêt, OU ton téléphone chargé + un stylo à bout rond si tu écris à la main avec notre appli (voir la FAQ juste en dessous).' },
  { icone: '🔗', titre: 'Ton lien de salon', detail: 'Il est dans tes mails et ici même, sur ton prochain bac blanc. Le bouton s’active 1 h avant le début.' },
  { icone: '💧', titre: 'De l’eau et un petit encas', detail: 'L’épreuve dure jusqu’à 4 h : hydrate-toi, prévois de quoi tenir.' },
  { icone: '🤫', titre: 'Une pièce calme, et rien d’autre', detail: 'Tu composes seul·e, sans cours ni notes : conditions réelles d’examen, c’est ce qui rend le bac blanc utile.' },
  { icone: '⏰', titre: '10 minutes d’avance', detail: 'Installe-toi tranquillement, vérifie caméra et micro avant le lancement.' },
];

// ── FAQ ──────────────────────────────────────────────────────────────────────
type FaqItem = { q: string; r: React.ReactNode };
const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Qu’est-ce que je dois préparer avant mon bac blanc ?',
    r: (
      <div>
        <p style={{ marginBottom: 12 }}>
          L&rsquo;essentiel, c&rsquo;est de choisir <strong>comment tu vas écrire ta copie</strong>. Deux possibilités :
        </p>
        <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
          <p style={{ fontWeight: 800, marginBottom: 4 }}>💻 Au clavier, sur un Google Doc</p>
          <p style={{ fontSize: '.88rem', color: '#4B5563', lineHeight: 1.6 }}>
            Possible pour les matières sans calculs ni schémas (français, philosophie, SES, HGGSP, HLP&hellip;).
            Attention : il faut être <strong>vraiment à l&rsquo;aise pour rédiger à l&rsquo;ordinateur</strong>{' '}
            pendant plusieurs heures. Si tu tapes lentement, entraîne-toi avant le jour J&hellip; ou choisis le stylo.
          </p>
        </div>
        <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
          <p style={{ fontWeight: 800, marginBottom: 4 }}>✍️ À la main, avec notre appli Écriture</p>
          <p style={{ fontSize: '.88rem', color: '#4B5563', lineHeight: 1.6, marginBottom: 10 }}>
            Tu préfères écrire au stylo ? Ton <strong>téléphone devient ton stylo</strong>{' '}: tu écris sur son écran,
            et ta copie A4 se remplit en direct sur l&rsquo;ordinateur, sous les yeux de ton correcteur. Voilà à quoi
            ressemble ta feuille sur le téléphone :
          </p>
          <Image src="/app-ecriture.png" width={2532} height={1170}
            alt="L&rsquo;appli Écriture : on écrit au stylo sur le quadrillage affiché par le téléphone"
            style={{ width: '100%', height: 'auto', borderRadius: 10, border: '1px solid #C7D2FE', display: 'block', marginBottom: 10 }} />
          <p style={{ fontSize: '.88rem', color: '#4B5563', lineHeight: 1.6 }}>
            Comment ça marche : depuis ton espace, clique sur <strong>« ✍️ Écrire ma copie »</strong>{' '}
            sur l&rsquo;ordinateur, puis scanne le QR code avec ton téléphone. Il te faut un{' '}
            <strong>stylo à bout rond</strong>{' '}(stylet à embout souple) — et si tu n&rsquo;en as pas,
            l&rsquo;astuce qui marche très bien : <strong>emballe le bout d&rsquo;un stylo
            classique dans du papier aluminium</strong>, il devient un stylet. Teste l&rsquo;appli quelques jours avant
            ton bac blanc pour être serein·e le jour J.
          </p>
        </div>
        <p style={{ fontSize: '.88rem', color: '#4B5563' }}>
          Dans les deux cas : relis ta méthode, dors bien la veille, et prépare la check-list ci-dessus. 💜
        </p>
      </div>
    ),
  },
  {
    q: 'Où est-ce que je trouve mon lien pour l’appel ?',
    r: (
      <div>
        <p style={{ marginBottom: 8 }}>Ton lien de salon visio est à deux endroits :</p>
        <ul style={{ paddingLeft: 20, lineHeight: 1.8, marginBottom: 10 }}>
          <li>📧 dans les <strong>mails</strong> qu&rsquo;on t&rsquo;envoie avant ton bac blanc ;</li>
          <li>🎓 <strong>ici, dans ton espace</strong>{' '}: le bouton « Rejoindre mon salon » sur ton prochain bac blanc.</li>
        </ul>
        <p style={{ fontSize: '.88rem', color: '#4B5563' }}>
          Le bouton s&rsquo;active <strong>1 heure avant le début de l&rsquo;épreuve</strong>, à la date de ton bac blanc.
          Avant ça, il reste verrouillé — inutile d&rsquo;essayer de rejoindre le salon la veille. 😉
        </p>
      </div>
    ),
  },
  {
    q: 'Comment se passe l’appel pendant le bac blanc ?',
    r: (
      <div>
        <ul style={{ paddingLeft: 20, lineHeight: 1.8, marginBottom: 10 }}>
          <li>Tu es <strong>seul·e dans ton salon</strong>{' '}: ce n&rsquo;est pas un appel de groupe, personne d&rsquo;autre que toi (et ton prof) n&rsquo;y entre.</li>
          <li>Ton <strong>prof passe te voir au fil de l&rsquo;épreuve</strong>{' '}pour vérifier que tout se passe bien, comme un surveillant dans une salle d&rsquo;examen.</li>
          <li>Tu <strong>restes connecté·e à l&rsquo;appel pendant toute l&rsquo;épreuve</strong>{' '}(les 4 heures), caméra allumée : c&rsquo;est ce qui garantit les conditions réelles du bac.</li>
        </ul>
        <p style={{ fontSize: '.88rem', color: '#4B5563' }}>
          Un souci de connexion pendant l&rsquo;épreuve ? Pas de panique : reviens dans le salon avec le même lien,
          ton prof verra que tu es revenu·e.
        </p>
      </div>
    ),
  },
  {
    q: 'Quand est-ce que je reçois ma note et ma correction ?',
    r: (
      <div>
        <p style={{ lineHeight: 1.7 }}>
          Après l&rsquo;épreuve, ta copie part en correction. Quelques jours plus tard, ta <strong>note</strong>{' '}
          et ton <strong>dossier de correction</strong>{' '}détaillé apparaissent ici, dans « Mes bacs blancs passés ».
          Tu recevras aussi un mail pour te prévenir.
        </p>
      </div>
    ),
  },
];

export function EspaceEleve() {
  const [email, setEmail]               = useState('');
  const [copies, setCopies]             = useState<Copie[] | null>(null);
  const [inscriptions, setInscriptions] = useState<Inscription[] | null>(null);
  // Le sujet de l'épreuve, ouvert automatiquement quelques minutes avant.
  const [sujets, setSujets]             = useState<SujetEleveVue[]>([]);
  const [loading, setLoading]           = useState(false);
  // Connexion en deux temps : l'adresse identifie, le code envoyé par e-mail
  // prouve. `defi` est la signature rendue par le serveur — il ne stocke rien.
  const [etape, setEtape]               = useState<'email' | 'code' | 'entree'>('email');
  const [code, setCode]                 = useState('');
  const [defi, setDefi]                 = useState('');
  const [erreur, setErreur]             = useState('');
  // Filtre matière : null = espace commun toutes matières.
  const [matiereActive, setMatiereActive] = useState<string | null>(null);
  const [faqOuverte, setFaqOuverte]     = useState<number | null>(null);
  // Horloge : re-rend chaque minute pour que le bouton du salon s'active tout
  // seul à H-1 sans que l'élève ait besoin de recharger la page.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Les bacs blancs ouverts, lus en base : l'horaire du salon et les sessions
  // proposées à l'élève suivent ce que l'administratrice a créé.
  const [catalogue, setCatalogue] = useState<Session[]>(SESSIONS_CONNUES);
  useEffect(() => {
    let vivant = true;
    chargerSessionsPubliques().then(s => {
      if (!vivant) return;
      SESSIONS_CONNUES = s;
      setCatalogue(s);
    });
    return () => { vivant = false; };
  }, []);

  // Le sujet s'ouvre tout seul, dix minutes avant l'épreuve : tant qu'une
  // ouverture approche, on redemande la liste à chaque battement d'horloge.
  // Sans cela, l'élève resterait devant un cadenas jusqu'à ce qu'il pense à
  // recharger la page — précisément au moment où il ne faut pas y penser.
  // La dépendance est un NOMBRE (la prochaine ouverture), pas la liste : mettre
  // la liste en dépendance relancerait l'effet à chaque réponse, donc en boucle.
  const prochaineOuverture = sujets.reduce((min, s) => {
    if (s.disponible || !s.ouverture_prevue) return min;
    const t = new Date(s.ouverture_prevue).getTime();
    return min === 0 || t < min ? t : min;
  }, 0);
  useEffect(() => {
    if (etape !== 'entree' || !prochaineOuverture) return;
    if (prochaineOuverture - now.getTime() > 2 * 3600_000) return; // encore loin
    let annule = false;
    chargerSujets().then((l) => { if (!annule) setSujets(l); });
    return () => { annule = true; };
  }, [now, etape, prochaineOuverture]);

  // Aperçu : ?demo=1 → élève fictif complet (notes, copies) ; ?demo=nouveau →
  // élève qui vient de s'inscrire (aucune copie), pour voir les états vides.
  // Sans passer par Supabase. setTimeout : la règle set-state-in-effect de
  // Next 16 interdit le setState synchrone dans un effet.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const demo = new URLSearchParams(window.location.search).get('demo');
    if (demo === '1' || demo === 'nouveau') {
      const t = setTimeout(() => {
        if (demo === 'nouveau') {
          setInscriptions([DEMO_INSCRIPTIONS[3]]); // Histoire-Géo à venir, rien d'autre
          setCopies([]);
        } else {
          setInscriptions(DEMO_INSCRIPTIONS);
          setCopies(DEMO_COPIES);
          setSujets(demoSujets());
        }
      }, 0);
      return () => clearTimeout(t);
    }
  }, []);

  /**
   * Charge les données de l'élève CONNECTÉ. Aucune adresse n'est passée en
   * paramètre : le serveur lit le cookie de session. Envoyer l'adresse dans
   * l'URL revenait à laisser chacun demander les copies de son choix.
   */
  const chargerMesDonnees = async () => {
    const [rc, ri, rs] = await Promise.all([
      fetch('/api/copies').then(r => r.json()),
      fetch('/api/inscriptions').then(r => r.json()),
      chargerSujets(),
    ]);
    setCopies(rc.copies || []);
    setInscriptions(ri.inscriptions || []);
    setSujets(rs);
  };

  // Session encore ouverte (cookie de 30 jours) → on entre sans redemander de code.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('demo')) return;
    let annule = false;
    (async () => {
      try {
        const r = await fetch('/api/inscriptions');
        if (!r.ok || annule) return;
        const ri = await r.json();
        const rc = await fetch('/api/copies').then(x => x.json()).catch(() => ({}));
        const rs = await chargerSujets();
        if (annule) return;
        setCopies(rc.copies || []);
        setInscriptions(ri.inscriptions || []);
        setSujets(rs);
        setEtape('entree');
      } catch { /* pas de session : on reste sur l'écran de connexion */ }
    })();
    return () => { annule = true; };
  }, []);

  /** Étape 1 — demande du code envoyé par e-mail. */
  const demanderCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setLoading(true);
    try {
      const r = await fetch('/api/eleve/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(j.message || 'Envoi impossible pour le moment. Réessaie dans un instant.');
        return;
      }
      setDefi(j.defi || '');
      setEtape('code');
    } catch {
      setErreur('Connexion impossible. Vérifie ta connexion internet.');
    } finally { setLoading(false); }
  };

  /** Étape 2 — vérification du code, puis chargement. */
  const validerCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setLoading(true);
    try {
      const r = await fetch('/api/eleve/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, defi }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(j.error || 'Code incorrect ou expiré.');
        return;
      }
      await chargerMesDonnees();
      setEtape('entree');
    } catch {
      setErreur('Connexion impossible. Réessaie.');
    } finally { setLoading(false); }
  };

  const deconnecter = async () => {
    await fetch('/api/eleve/deconnexion', { method: 'POST' }).catch(() => {});
    setCopies(null); setInscriptions(null);
    setCode(''); setDefi(''); setErreur(''); setEtape('email');
  };

  const today = new Date(); today.setHours(0,0,0,0);

  // ── Matières de l'élève (pour l'espace par matière) ──
  const mesMatieres = [...new Set((inscriptions ?? []).map(i => i.matiere))];
  // Si la matière filtrée disparaît (nouvel email…), on retombe sur « Toutes ».
  const filtre = matiereActive && mesMatieres.includes(matiereActive) ? matiereActive : null;

  const insFiltrees    = (inscriptions ?? []).filter(i => !filtre || i.matiere === filtre);
  const copiesFiltrees = (copies ?? []).filter(c => !filtre || c.matiere.toLowerCase() === filtre.toLowerCase());

  // Copie correspondant à une inscription (par matière)
  const copieDe = (i: Inscription) => (copies ?? []).find(c => c.matiere.toLowerCase() === i.matiere.toLowerCase());

  // Une inscription sans date d'épreuve n'a pas encore eu lieu : elle reste
  // « à venir » (date à confirmer) tant qu'aucune copie n'a été rendue —
  // avant, elle tombait dans « Passés » et perdait tout accès à l'écriture.
  const aVenir = insFiltrees
    .filter(i => (i.date_epreuve ? new Date(i.date_epreuve) >= today : !copieDe(i)))
    .sort((a,b) => {
      if (!a.date_epreuve) return 1;
      if (!b.date_epreuve) return -1;
      return new Date(a.date_epreuve).getTime() - new Date(b.date_epreuve).getTime();
    });

  const passes = insFiltrees
    .filter(i => (i.date_epreuve ? new Date(i.date_epreuve) < today : !!copieDe(i)))
    .sort((a,b) => new Date(b.date_epreuve ?? b.created_at).getTime() - new Date(a.date_epreuve ?? a.created_at).getTime());

  const prochain = aVenir[0] ?? null;

  // Calendrier à venir : groupé par mois, les sans-date à part
  const parMois = aVenir.reduce<Record<string, Inscription[]>>((acc, i) => {
    if (!i.date_epreuve) return acc;
    const m = i.date_epreuve.slice(0,7);
    (acc[m] ||= []).push(i);
    return acc;
  }, {});
  const sansDate = aVenir.filter(i => !i.date_epreuve);

  // ── Historique : TOUTES les anciennes copies, pas une par matière ──
  // Chaque inscription passée est appariée à la copie de sa matière la plus
  // proche en date pas encore prise ; les copies restantes (deuxième bac blanc
  // de la même matière, copie déposée sans inscription liée…) forment leurs
  // propres lignes. Rien ne peut disparaître de l'historique.
  type ItemHistorique = { cle: string; matiere: string; date: string | null; copie: Copie | null };
  const copiesPrises = new Set<string>();
  // Copie de la même matière dont la date de dépôt est la plus PROCHE de la
  // date d'épreuve : deux bacs blancs de français ne se volent pas leur copie.
  const copiePourInscription = (i: Inscription): Copie | null => {
    const candidates = copiesFiltrees.filter(c => !copiesPrises.has(c.id) && c.matiere.toLowerCase() === i.matiere.toLowerCase());
    if (candidates.length === 0) return null;
    if (!i.date_epreuve) return candidates[0];
    const ref = new Date(i.date_epreuve).getTime();
    return candidates.reduce((best, c) =>
      Math.abs(new Date(c.created_at).getTime() - ref) < Math.abs(new Date(best.created_at).getTime() - ref) ? c : best
    );
  };
  const historique: ItemHistorique[] = passes.map(i => {
    const c = copiePourInscription(i);
    if (c) copiesPrises.add(c.id);
    return { cle: `i-${i.id}`, matiere: i.matiere, date: i.date_epreuve, copie: c };
  });
  for (const c of copiesFiltrees) {
    if (!copiesPrises.has(c.id)) historique.push({ cle: `c-${c.id}`, matiere: c.matiere, date: c.created_at, copie: c });
  }
  historique.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());

  // Date de passage d'une copie : celle de son bac blanc apparié dans
  // l'historique (sinon sa date de dépôt) — le graphe raconte la même
  // chronologie que la liste.
  const dateParCopie = new Map(historique.flatMap(h => h.copie ? [[h.copie.id, h.date ?? h.copie.created_at] as const] : []));
  const dateCopie = (c: Copie) => dateParCopie.get(c.id) ?? c.created_at;
  // Notes réelles pour le graphe d'évolution (copies notées, ordre chronologique)
  const notesData = copiesFiltrees
    .filter(c => c.note != null)
    .map(c => ({ c, date: dateCopie(c) }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const moyenne = notesData.length
    ? notesData.reduce((s, x) => s + (x.c.note as number), 0) / notesData.length
    : null;

  // Sessions plateforme pas encore inscrites — pour s'entraîner plus.
  // On ne propose que l'univers de l'élève : un lycéen ne voit pas les
  // sessions du brevet, et réciproquement.
  const mesExamens = new Set(mesMatieres.map(examenDeMatiere));
  const sessionsDispos = catalogue.filter(s =>
    new Date(s.date) >= today &&
    mesExamens.has(examenDeMatiere(s.matiere)) &&
    (!filtre || s.matiere === filtre) &&
    !(inscriptions ?? []).some(i => i.matiere === s.matiere && i.date_epreuve === s.date)
  );

  const nomEleve = inscriptions?.[0]?.nom ?? '';
  const aucunResultat = copies !== null && inscriptions !== null && copies.length === 0 && inscriptions.length === 0;

  // ── AVANT CONNEXION ────────────────────────────────────────────────────────
  if (inscriptions === null) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1E1145 0%,#2D1B5E 55%,#1E3A5F 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: 'white', borderRadius: 24, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 8 }}>🎓</div>
          <h1 style={{ fontFamily: 'inherit', fontWeight: 900, fontSize: '1.8rem', color: '#1E1145', marginBottom: 8 }}>Mon espace élève</h1>
          <p style={{ color: '#6B7280', fontSize: '.95rem', marginBottom: 28, lineHeight: 1.6 }}>
            Accède à tes bacs blancs, ton salon visio et tes dossiers de correction.
          </p>
          {etape === 'email' ? (
            <form onSubmit={demanderCode}>
              <input type="email" required placeholder="Ton adresse email" value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', border: '2px solid #E5E7EB', borderRadius: 12, fontSize: '1rem', marginBottom: 6, outline: 'none', boxSizing: 'border-box' }} />
              <p style={{ fontSize: '.78rem', color: '#9CA3AF', marginBottom: 12, textAlign: 'left' }}>
                💡 Utilise l&rsquo;adresse donnée lors de ton inscription au bac blanc. Tu recevras un code à 6 caractères.
              </p>
              {erreur && (
                <p style={{ fontSize: '.85rem', color: '#B91C1C', background: '#FEF2F2', borderRadius: 10, padding: '10px 12px', marginBottom: 12, textAlign: 'left' }}>{erreur}</p>
              )}
              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#7C3AED,#581C87)', color: '#fff', border: 'none', borderRadius: 12, fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }}>
                {loading ? 'Envoi…' : 'Recevoir mon code →'}
              </button>
            </form>
          ) : (
            <form onSubmit={validerCode}>
              <p style={{ fontSize: '.9rem', color: '#374151', marginBottom: 14, lineHeight: 1.6 }}>
                Un code vient d&rsquo;être envoyé à <strong>{email}</strong>. Il est valable 15 minutes.
              </p>
              <input required placeholder="Ton code" value={code} inputMode="text" autoComplete="one-time-code"
                maxLength={6} onChange={e => setCode(e.target.value.toUpperCase())}
                style={{ width: '100%', padding: '12px 16px', border: '2px solid #E5E7EB', borderRadius: 12, fontSize: '1.4rem', fontWeight: 800, letterSpacing: 6, textAlign: 'center', marginBottom: 12, outline: 'none', boxSizing: 'border-box' }} />
              {erreur && (
                <p style={{ fontSize: '.85rem', color: '#B91C1C', background: '#FEF2F2', borderRadius: 10, padding: '10px 12px', marginBottom: 12, textAlign: 'left' }}>{erreur}</p>
              )}
              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#7C3AED,#581C87)', color: '#fff', border: 'none', borderRadius: 12, fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }}>
                {loading ? 'Vérification…' : 'Entrer dans mon espace →'}
              </button>
              <button type="button" onClick={() => { setEtape('email'); setCode(''); setErreur(''); }}
                style={{ marginTop: 12, background: 'none', border: 'none', color: '#7C3AED', cursor: 'pointer', fontWeight: 600, fontSize: '.85rem' }}>
                ← Changer d&rsquo;adresse ou renvoyer un code
              </button>
            </form>
          )}
          <p style={{ marginTop: 20, fontSize: '.8rem', color: '#9CA3AF' }}>
            Pas encore inscrit ? <a href="/inscription" style={{ color: '#7C3AED', fontWeight: 700 }}>S&rsquo;inscrire →</a>
          </p>
        </div>
      </div>
    );
  }

  // ── AUCUN RÉSULTAT ─────────────────────────────────────────────────────────
  if (aucunResultat) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1E1145,#2D1B5E 55%,#1E3A5F)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'white', borderRadius: 24, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
          <h2 style={{ fontWeight: 800, color: '#1E1145', marginBottom: 8 }}>Aucune inscription trouvée</h2>
          <p style={{ color: '#6B7280', marginBottom: 24 }}>Vérifie ton adresse email ou inscris-toi à un bac blanc.</p>
          <a href="/inscription" style={{ display: 'inline-block', padding: '12px 24px', background: '#7C3AED', color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            M&rsquo;inscrire →
          </a>
          <p style={{ marginTop: 16 }}>
            <button onClick={deconnecter} style={{ background: 'none', border: 'none', color: '#7C3AED', cursor: 'pointer', fontWeight: 600 }}>
              ← Réessayer
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  const cadre: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: '24px 26px', border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,.05)' };
  const titreSection = (txt: string) => (
    <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>{txt}</h3>
  );
  const sousTitre = (txt: string) => (
    <p style={{ fontSize: '.75rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #F3F4F6' }}>{txt}</p>
  );

  const heureProchain = prochain ? heuresEpreuve(prochain) : null;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', fontFamily: 'inherit' }}>

      {/* ── HERO ── */}
      <div style={{ background: 'linear-gradient(135deg,#1E1145 0%,#2D1B5E 55%,#1E3A5F 100%)', padding: '40px 24px 36px', position: 'relative', overflow: 'hidden' }}>
        {/* glow */}
        <div style={{ position: 'absolute', width: 500, height: 500, right: -150, top: -200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,58,237,.45),transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.8rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>Espace élève</p>
          <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.6rem)', margin: '0 0 6px' }}>
            Salut {prenom(nomEleve)} 👋
          </h1>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '.95rem', marginBottom: 20 }}>
            {(inscriptions ?? []).length} bac{(inscriptions ?? []).length > 1 ? 's' : ''} blanc{(inscriptions ?? []).length > 1 ? 's' : ''} au total
          </p>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {passes.length > 0 && <span style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 100, padding: '7px 14px', fontSize: '.8rem', fontWeight: 700, color: '#fff' }}>
              🔥 {passes.length} BB {passes.length > 1 ? 'passés' : 'passé'}
            </span>}
            {aVenir.length > 0 && <span style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 100, padding: '7px 14px', fontSize: '.8rem', fontWeight: 700, color: '#fff' }}>
              📅 {aVenir.length} à venir
            </span>}
            {copiesFiltrees.length > 0 && <span style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 100, padding: '7px 14px', fontSize: '.8rem', fontWeight: 700, color: '#fff' }}>
              📄 {copiesFiltrees.length} correction{copiesFiltrees.length > 1 ? 's' : ''} disponible{copiesFiltrees.length > 1 ? 's' : ''}
            </span>}
          </div>

          {/* ── Espace par matière : l'élève qui passe plusieurs matières bascule
                entre « Toutes » (espace commun) et chaque matière. ── */}
          {mesMatieres.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
              <button onClick={() => setMatiereActive(null)}
                style={{ padding: '8px 16px', borderRadius: 100, fontSize: '.85rem', fontWeight: 800, cursor: 'pointer', border: filtre === null ? '2px solid #fff' : '2px solid rgba(255,255,255,.25)', background: filtre === null ? '#fff' : 'rgba(255,255,255,.08)', color: filtre === null ? '#1E1145' : 'rgba(255,255,255,.85)' }}>
                Toutes mes matières
              </button>
              {mesMatieres.map(m => (
                <button key={m} onClick={() => setMatiereActive(m)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 100, fontSize: '.85rem', fontWeight: 800, cursor: 'pointer', border: filtre === m ? '2px solid #fff' : '2px solid rgba(255,255,255,.25)', background: filtre === m ? '#fff' : 'rgba(255,255,255,.08)', color: filtre === m ? couleur(m) : 'rgba(255,255,255,.85)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: couleur(m), flexShrink: 0 }} />
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Compte Discord ──
            Le lien de la salle ne suffit pas : une salle privée n'ouvre qu'aux
            comptes Discord qu'on y a autorisés. Tant que l'élève n'a pas relié
            le sien, il verrait son bouton s'activer le matin de l'épreuve et
            tomberait sur une salle qui ne le laisse pas entrer. */}
      <div style={{ maxWidth: 900, margin: '20px auto 0', padding: '0 24px' }}>
        <LiaisonDiscord pourquoi="Ta salle du jour J est privée : elle ne s’ouvre qu’aux comptes Discord autorisés. Relie le tien maintenant, pas le matin de l’épreuve." />
      </div>

      {/* ── FENÊTRE 1 : PROCHAIN BAC BLANC ── */}
      {prochain && (
        <div style={{ maxWidth: 900, margin: '20px auto 0', padding: '0 24px' }}>
          <div style={{ background: `linear-gradient(135deg,${couleur(prochain.matiere)},${couleur(prochain.matiere)}CC)`, borderRadius: 20, padding: '24px 28px', color: '#fff', boxShadow: `0 12px 40px ${couleur(prochain.matiere)}50` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ opacity: .8, fontSize: '.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Prochain bac blanc</p>
                <h2 style={{ fontWeight: 900, fontSize: '1.6rem', margin: '0 0 4px' }}>{prochain.matiere}</h2>
                {prochain.date_epreuve ? <>
                  <p style={{ opacity: .9, fontSize: '.9rem' }}>
                    {fmtDate(prochain.date_epreuve)}{heureProchain?.label ? ` · ${heureProchain.label}` : ''}
                  </p>
                  {joursRestants(prochain.date_epreuve) && <p style={{ marginTop: 6, fontWeight: 800, fontSize: '1.1rem' }}>⏳ {joursRestants(prochain.date_epreuve)}</p>}
                </> : <p style={{ opacity: .9, fontSize: '.9rem' }}>Date à confirmer — on te prévient par mail</p>}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
                <BoutonSalon i={prochain} now={now} grand />
                {ECRITURE_URL && prochain.code_copie && (
                  <a href={ecritureUrl(prochain)} target="_blank" rel="noreferrer"
                    style={{ background: 'rgba(255,255,255,.18)', border: '1.5px solid rgba(255,255,255,.55)', color: '#fff', padding: '13px 22px', borderRadius: 14, fontWeight: 800, fontSize: '.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    ✍️ Écrire ma copie
                  </a>
                )}
              </div>
            </div>
            {/* Guidage : que faire maintenant ? */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <p style={{ fontSize: '.85rem', opacity: .95 }}>
                📋 Prépare ton jour J : <a href="#checklist" style={{ color: '#fff', fontWeight: 800 }}>check-list</a> et <a href="#faq" style={{ color: '#fff', fontWeight: 800 }}>questions fréquentes</a> plus bas.
              </p>
              <a href={sessionsDispos.length > 0 ? '#sessions' : '/inscription'}
                style={{ fontSize: '.85rem', fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.18)', padding: '8px 14px', borderRadius: 100, textDecoration: 'none' }}>
                💪 Tu veux t&rsquo;entraîner plus ? Inscris-toi →
              </a>
            </div>
          </div>
          {ECRITURE_URL && prochain.code_copie && (
            <p style={{ fontSize: '.78rem', color: '#6B7280', margin: '8px 4px 0' }}>
              « Écrire ma copie » ouvre ta feuille sur cet ordinateur : scanne
              ensuite le QR code affiché avec ton téléphone, il devient ton stylo.
            </p>
          )}
        </div>
      )}

      {/* ── FENÊTRE 1 bis : LE SUJET DE L'ÉPREUVE ──
            Ouvert automatiquement quelques minutes avant le début. Filtré sur
            les épreuves du jour et à venir : un sujet d'il y a trois mois n'a
            rien à faire là. ── */}
      {(() => {
        const auj = new Date(now).toISOString().slice(0, 10);
        const aMontrer = sujets
          .filter((s) => s.date_epreuve >= auj)
          .filter((s) => (filtre ? s.matiere === filtre : true));
        if (!aMontrer.length) return null;
        return (
          <div style={{ maxWidth: 900, margin: '20px auto 0', padding: '0 24px' }}>
            <h3 style={{ fontWeight: 900, color: '#1E1145', fontSize: '1.05rem', margin: '0 0 10px' }}>
              📄 Mon sujet
            </h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {aMontrer.map((s) => (
                <CarteSujet key={s.sujet_id} s={s} now={now} />
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── FENÊTRE 2 : Mes anciens bacs blancs & mes copies ──
            Toujours affichée, même vide : un nouvel élève doit voir où ses
            copies et ses dossiers de correction arriveront. */}
      <div style={{ maxWidth: 900, margin: '26px auto 0', padding: '0 24px' }}>
          <div style={cadre}>
            <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              🗂️ Mes anciens bacs blancs &amp; mes copies
            </h3>
            <p style={{ fontSize: '.82rem', color: '#6B7280', marginBottom: 14 }}>
              Toutes tes copies restent ici : relis-les avec leur dossier de correction pour voir le chemin parcouru.
            </p>
            {historique.length === 0 && (
              <div style={{ background: '#F8FAFC', border: '1px dashed #D1D5DB', borderRadius: 14, padding: '18px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: '1.6rem' }}>🌱</span>
                <p style={{ fontSize: '.88rem', color: '#4B5563', lineHeight: 1.6 }}>
                  Tu n&rsquo;as pas encore passé de bac blanc. Après chaque épreuve, ta copie
                  et son <strong>dossier de correction</strong>{' '}seront rangés ici, avec ta note.
                </p>
              </div>
            )}
            {historique.map(h => {
              const c = h.copie;
              const note = c?.note ?? null;
              return (
                <div key={h.cle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '13px 0', borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 170 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: couleur(h.matiere), flexShrink: 0 }} />
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '.92rem', color: '#111827' }}>{h.matiere}</p>
                      <p style={{ fontSize: '.75rem', color: '#9CA3AF' }}>{h.date ? fmtDate(h.date) : 'Date non renseignée'}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {c?.fichier_nom && (
                      <a href={`/api/copies/fichier?id=${c.id}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: '.78rem', fontWeight: 700, color: '#374151', background: '#F3F4F6', padding: '7px 14px', borderRadius: 100, textDecoration: 'none' }}>
                        📄 Ma copie
                      </a>
                    )}
                    {c?.pdf_pret && (
                      <a href={`/api/copies/pdf?id=${c.id}`}
                        style={{ fontSize: '.78rem', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#7C3AED,#581C87)', padding: '7px 14px', borderRadius: 100, textDecoration: 'none' }}>
                        📘 Mon dossier de correction
                      </a>
                    )}
                    {!c && (
                      <span style={{ fontSize: '.75rem', fontWeight: 700, padding: '6px 12px', borderRadius: 100, background: '#FFF7ED', color: '#C2410C' }}>
                        Correction en cours
                      </span>
                    )}
                    {note != null
                      ? <span style={{ fontSize: '.92rem', fontWeight: 800, padding: '5px 13px', borderRadius: 100, color: '#fff', background: couleurNote(note), flexShrink: 0 }}>{fmtNote(note)}/20</span>
                      : c && <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '5px 11px', borderRadius: 100, background: '#ECFDF5', color: '#059669', flexShrink: 0 }}>✓ Corrigé</span>}
                  </div>
                </div>
              );
            })}
          </div>
      </div>

      {/* ── GRID : FENÊTRE 3 (calendrier à venir) + graphe + sessions ── */}
      <div style={{ maxWidth: 900, margin: '26px auto 0', padding: '0 24px 48px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22 }}>

        {/* ── FENÊTRE 3 : Calendrier à venir ── */}
        {aVenir.length > 0 && (
          <div style={cadre}>
            {titreSection('📅 Mon calendrier à venir')}

            {Object.entries(parMois).sort().map(([mois, list]) => (
              <div key={mois} style={{ marginBottom: 16 }}>
                {sousTitre(fmtMonth(mois+'-01'))}
                {list.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid #F9FAFB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: couleur(i.matiere), flexShrink: 0 }} />
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '.9rem', color: '#111827' }}>{i.matiere}</p>
                        {i.date_epreuve && <p style={{ fontSize: '.75rem', color: '#9CA3AF' }}>{fmtDate(i.date_epreuve)} {joursRestants(i.date_epreuve) ? `· ${joursRestants(i.date_epreuve)}` : ''}</p>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {ECRITURE_URL && i.code_copie && (
                        <a href={ecritureUrl(i)} target="_blank" rel="noreferrer"
                          style={{ fontSize: '.75rem', fontWeight: 700, color: '#1B3FAB', background: '#E8EDFA', padding: '5px 12px', borderRadius: 100, textDecoration: 'none' }}>
                          ✍️ Écrire
                        </a>
                      )}
                      <BoutonSalon i={i} now={now} />
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {sansDate.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                {sousTitre('Date à confirmer')}
                {sansDate.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid #F9FAFB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: couleur(i.matiere), flexShrink: 0 }} />
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '.9rem', color: '#111827' }}>{i.matiere}</p>
                        <p style={{ fontSize: '.75rem', color: '#9CA3AF' }}>La date te sera communiquée</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {ECRITURE_URL && i.code_copie && (
                        <a href={ecritureUrl(i)} target="_blank" rel="noreferrer"
                          style={{ fontSize: '.75rem', fontWeight: 700, color: '#1B3FAB', background: '#E8EDFA', padding: '5px 12px', borderRadius: 100, textDecoration: 'none' }}>
                          ✍️ Écrire
                        </a>
                      )}
                      <BoutonSalon i={i} now={now} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Graphique d'évolution des notes (toujours visible : un nouvel
              élève doit savoir que sa progression sera suivie ici) ── */}
        <div style={cadre}>
            <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              📈 Évolution de mes notes
            </h3>
            {notesData.length === 0 && (
              <div style={{ background: '#F8FAFC', border: '1px dashed #D1D5DB', borderRadius: 14, padding: '18px 20px', marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: '1.6rem' }}>📊</span>
                <p style={{ fontSize: '.88rem', color: '#4B5563', lineHeight: 1.6 }}>
                  Ta courbe de progression se dessinera ici dès ta première note.
                  Bac blanc après bac blanc, tu verras le chemin parcouru.
                </p>
              </div>
            )}
            {moyenne != null && (
              <p style={{ fontSize: '.82rem', color: '#6B7280', marginBottom: 6 }}>
                Moyenne : <strong style={{ color: couleurNote(moyenne) }}>{fmtNote(Math.round(moyenne * 10) / 10)}/20</strong> sur {notesData.length} épreuve{notesData.length > 1 ? 's' : ''}
              </p>
            )}
            {notesData.length > 0 && (<>
              {/* Barres = note/20, dernières 8 épreuves */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 10, marginBottom: 4 }}>
                {notesData.slice(-8).map(({ c, date }) => {
                  const n = c.note as number;
                  return (
                    <div key={c.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 800, color: couleurNote(n) }}>{fmtNote(n)}</span>
                      <div style={{ width: '100%', maxWidth: 46, borderRadius: '8px 8px 0 0', height: `${Math.max(4, Math.round((n / 20) * 120))}px`, background: couleurNote(n), transition: 'height .5s ease' }} />
                      <p style={{ fontSize: '.62rem', color: '#9CA3AF', fontWeight: 600, textAlign: 'center', lineHeight: 1.25 }}>
                        {c.matiere.replace('Mathématiques', 'Maths').replace('Histoire-Géo', 'Hist.')}<br />
                        {new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: '.7rem', color: '#9CA3AF', borderTop: '1px solid #F3F4F6', paddingTop: 12, marginTop: 8 }}>
                Notes sur 20. Vert = ≥ 10, rouge = &lt; 10.
              </p>
            </>)}
          </div>

        {/* ── Prochains BB plateforme (sessions dispo) ── */}
        {sessionsDispos.length > 0 && (
          <div id="sessions" style={{ background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', borderRadius: 20, padding: '24px 26px', border: '1px solid #FDE68A', boxShadow: '0 2px 12px rgba(0,0,0,.04)', scrollMarginTop: 20 }}>
            <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              💪 Tu veux t&rsquo;entraîner plus ?
            </h3>
            <p style={{ fontSize: '.82rem', color: '#92400E', marginBottom: 18, lineHeight: 1.5 }}>
              Chaque bac blanc en plus, c&rsquo;est des points en plus le jour J. Inscris-toi aux prochaines sessions :
            </p>
            {sessionsDispos.map(s => (
              <div key={s.matiere+s.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 0', borderBottom: '1px solid rgba(251,191,36,.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: couleur(s.matiere), flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '.88rem', color: '#111827' }}>{s.matiere}</p>
                    <p style={{ fontSize: '.73rem', color: '#92400E' }}>{fmtDate(s.date)} · {s.heure} · {s.places} places</p>
                  </div>
                </div>
                {/* Matière et date pré-remplies : une inscription faite depuis une
                    session ne doit jamais repartir sans sa date d'épreuve. */}
                <a href={`/inscription?matiere=${encodeURIComponent(s.matiere)}&date=${s.date}`}
                  style={{ fontSize: '.75rem', fontWeight: 700, color: '#D97706', background: 'rgba(217,119,6,.12)', padding: '5px 12px', borderRadius: 100, textDecoration: 'none', flexShrink: 0 }}>
                  S&rsquo;inscrire →
                </a>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ── CHECK-LIST DU JOUR J ── */}
      <div id="checklist" style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 26px', scrollMarginTop: 20 }}>
        <div style={{ background: 'linear-gradient(135deg,#1E1145,#2D1B5E)', borderRadius: 20, padding: '28px 28px 20px', color: '#fff', boxShadow: '0 12px 40px rgba(30,17,69,.35)' }}>
          <h3 style={{ fontWeight: 900, fontSize: '1.25rem', marginBottom: 4 }}>✅ Ta check-list pour le jour J</h3>
          <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.7)', marginBottom: 18 }}>
            Tout ce qu&rsquo;il te faut pour passer ton bac blanc dans de vraies conditions d&rsquo;examen.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
            {CHECKLIST.map((item, k) => (
              <div key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: '13px 15px' }}>
                <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>{item.icone}</span>
                <div>
                  <p style={{ fontWeight: 800, fontSize: '.88rem', marginBottom: 2 }}>{item.titre}</p>
                  <p style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.72)', lineHeight: 1.55 }}>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div id="faq" style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 56px', scrollMarginTop: 20 }}>
        <div style={cadre}>
          {titreSection('❓ Questions fréquentes')}
          {FAQ_ITEMS.map((item, k) => {
            const ouverte = faqOuverte === k;
            return (
              <div key={k} style={{ borderBottom: k < FAQ_ITEMS.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <button onClick={() => setFaqOuverte(ouverte ? null : k)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontWeight: 700, fontSize: '.95rem', color: ouverte ? '#7C3AED' : '#111827' }}>{item.q}</span>
                  <span style={{ fontSize: '1.1rem', color: '#9CA3AF', transform: ouverte ? 'rotate(45deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>＋</span>
                </button>
                {ouverte && (
                  <div style={{ padding: '2px 2px 18px', fontSize: '.92rem', color: '#374151', lineHeight: 1.65 }}>
                    {item.r}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
