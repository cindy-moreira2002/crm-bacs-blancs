'use client';

/**
 * La console du prof pour UN bac blanc — tout ce dont il a besoin le jour J,
 * sur un seul écran, sans rien aller chercher ailleurs.
 *
 * Ce qui a changé, et pourquoi :
 *  · les trois adresses qu'il ouvrait à la main (bloc Discord, grille de
 *    correction, dossier des copies) sont en haut, toujours visibles ;
 *  · UN écran, sans onglets, et chaque chose une seule fois : une seule liste
 *    d'élèves, qui porte tout — la salle, la copie, le statut, la note ;
 *  · la grille n'est plus un lien de démonstration : c'est le classeur commun,
 *    et quand il n'est pas renseigné l'écran le DIT au lieu d'afficher un lien
 *    qui ne mène nulle part ;
 *  · les mains levées arrivent ici. Un élève seul dans sa salle vocale n'avait
 *    aucun moyen d'appeler un prof qui surveillait ailleurs ; il en a deux
 *    maintenant, et les deux atterrissent dans le bandeau rouge ci-dessous ;
 *  · le document de chaque élève se colle sur sa ligne, une fois, et se
 *    rouvre d'un clic à la correction.
 *
 * Le rafraîchissement des appels est un simple sondage toutes les dix secondes.
 * Pas de flux temps réel : une fonction Vercel ne peut pas tenir une connexion
 * ouverte pendant trois heures d'épreuve, et dix secondes de retard sur une
 * main levée ne se voient pas.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IconeDiscord, LiaisonDiscord } from '@/components/LiaisonDiscord';
import { SujetEtRetour } from '@/components/SujetEtRetour';
import type { CodeEpreuve } from '@/lib/ecritureAcces';
import type { EleveSession, SessionEnrichie } from '@/lib/espaceProf';

/** Toutes les dix secondes : assez pour ne pas faire attendre un élève. */
const CADENCE_APPELS_MS = 10_000;

type AppelOuvert = {
  id: string;
  inscription_id: string;
  motif: string;
  source: string;
  cree_le: string;
  eleve_nom: string;
  salon_url: string | null;
};

/**
 * L'état de la copie d'un élève, UNE pastille pour deux circuits.
 *
 * Le pipeline de correction passe devant : c'est par lui que tout arrive
 * aujourd'hui (dépôt, transcription, correction, dossier). La table `copies`
 * du CRM, l'ancien dépôt manuel, reste consultée derrière — tant qu'elle sert
 * encore, une copie qui n'est passée que par elle doit continuer de s'afficher.
 *
 * Avant, seule la seconde était lue : une copie corrigée par le pipeline
 * restait « Copie attendue » indéfiniment sous les yeux du professeur.
 */
function statutEleve(e: EleveSession): { texte: string; classe: string } {
  const c = e.correction;
  if (c) {
    if (c.dossier_pret) return { texte: 'Dossier prêt', classe: 'bg-blue-100 text-blue-800' };
    if (c.statut.startsWith('corrected')) return { texte: 'Corrigée', classe: 'bg-purple-100 text-purple-800' };
    if (c.statut.endsWith('_failed')) return { texte: 'Échec — à redéposer', classe: 'bg-red-100 text-red-700' };
    return { texte: 'Correction en cours', classe: 'bg-amber-100 text-amber-800' };
  }
  if (!e.copie) return { texte: 'Copie attendue', classe: 'bg-gray-100 text-gray-600' };
  if (e.copie.envoye) return { texte: 'Dossier envoyé', classe: 'bg-green-100 text-green-800' };
  if (e.copie.pdf_pret) return { texte: 'Dossier prêt', classe: 'bg-blue-100 text-blue-800' };
  if (e.copie.statut === 'corrigée') return { texte: 'Corrigée', classe: 'bg-purple-100 text-purple-800' };
  return { texte: 'À corriger', classe: 'bg-amber-100 text-amber-800' };
}

/** « depuis 3 min » — calculé dans le navigateur, donc toujours à jour. */
function depuis(iso: string, maintenant: number): string {
  const minutes = Math.floor((maintenant - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes === 1) return 'depuis 1 min';
  if (minutes < 60) return `depuis ${minutes} min`;
  return `depuis ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Un des trois grands boutons du bandeau. Sans adresse, il ne disparaît pas :
 * il reste, éteint, avec la phrase qui dit quoi faire pour l'allumer. Un bouton
 * absent laisse croire que la fonction n'existe pas.
 */
function GrandBouton({
  href,
  emoji,
  titre,
  sousTitre,
  manque,
  couleur,
}: {
  href: string | null;
  emoji: string;
  titre: string;
  sousTitre: string;
  manque: string;
  couleur: string;
}) {
  if (!href) {
    return (
      <div className="flex-1 min-w-[220px] rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
        <p className="font-semibold text-gray-500">
          <span aria-hidden className="mr-2">{emoji}</span>{titre}
        </p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{manque}</p>
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`flex-1 min-w-[220px] rounded-2xl p-4 text-white shadow-sm transition-transform hover:-translate-y-0.5 ${couleur}`}
    >
      <p className="font-semibold">
        <span aria-hidden className="mr-2">{emoji}</span>{titre}
      </p>
      <p className="text-xs opacity-90 mt-1 leading-relaxed">{sousTitre}</p>
    </a>
  );
}

/**
 * Le Google Doc d'un élève — celui qu'il reçoit à son inscription.
 *
 * Il vit à côté du lien de l'application d'écriture, et non à sa place : les
 * deux cohabitent le temps que l'application d'écriture soit finie. Le jour où
 * l'un des deux gagne, il n'y aura qu'un composant à retirer.
 */
function DocEleve({
  eleve,
  sessionId,
  onChange,
}: {
  eleve: EleveSession;
  sessionId: string;
  onChange: (url: string | null) => void;
}) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(eleve.copie_doc_url ?? '');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const enregistrer = async () => {
    setBusy(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/prof/sessions/${sessionId}/eleves`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscription_id: eleve.id, copie_doc_url: valeur }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? 'Erreur.');
        return;
      }
      onChange(data.copie_doc_url ?? null);
      setEdition(false);
    } finally {
      setBusy(false);
    }
  };

  if (edition) {
    return (
      <div className="flex flex-col gap-1.5 w-full sm:w-80">
        <div className="flex gap-2">
          <input
            autoFocus
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
            placeholder="https://docs.google.com/document/…"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 text-sm"
          />
          <button
            onClick={enregistrer}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? '…' : 'OK'}
          </button>
          <button
            onClick={() => { setEdition(false); setValeur(eleve.copie_doc_url ?? ''); }}
            className="px-2 py-2 text-gray-400 text-sm"
          >
            ✕
          </button>
        </div>
        {erreur && <p className="text-xs text-red-600">{erreur}</p>}
      </div>
    );
  }

  if (!eleve.copie_doc_url) {
    return (
      <button
        onClick={() => setEdition(true)}
        className="text-xs text-gray-400 hover:text-purple-600 underline decoration-dotted flex-shrink-0"
      >
        ＋ son Google Doc
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 flex-shrink-0">
      <a
        href={eleve.copie_doc_url}
        target="_blank"
        rel="noreferrer"
        title="Le Google Doc de cet élève."
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-300 bg-blue-50 text-blue-800 text-sm font-semibold hover:bg-blue-100"
      >
        📄 Son Doc
      </a>
      <button onClick={() => setEdition(true)} title="Changer le lien" className="text-gray-300 hover:text-gray-500 text-sm">
        ✎
      </button>
    </span>
  );
}

/**
 * Les codes de l'épreuve — un par élève, à dicter au début.
 *
 * Un seul endroit pour les codes : ils ne sont pas repris sur la ligne de
 * l'élève, sinon il y aurait deux vérités à comparer le jour J. Le bloc reste
 * replié tant qu'on ne l'ouvre pas — il ne sert que dix minutes, au début.
 *
 * « Débloquer » est le filet de sécurité : un code ne sert qu'une fois, donc un
 * ordinateur qui plante en pleine épreuve laisserait l'élève dehors. Le
 * professeur le libère, l'élève le ressaisit sur son nouveau poste.
 */
function CodesEpreuve({ sessionId }: { sessionId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [codes, setCodes] = useState<CodeEpreuve[] | null>(null);
  const [moi, setMoi] = useState<CodeEpreuve | null>(null);
  const [actif, setActif] = useState(true);
  const [encours, setEncours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const res = await fetch(`/api/prof/sessions/${sessionId}/codes`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      actif: boolean;
      moi: CodeEpreuve | null;
      codes: CodeEpreuve[];
    };
    setActif(data.actif);
    setMoi(data.moi ?? null);
    setCodes(data.codes ?? []);
  }, [sessionId]);

  async function debloquer(code: string) {
    if (!confirm(`Débloquer le code ${code} ?\n\nL’élève pourra le saisir à nouveau, sur un autre appareil.`)) return;
    setEncours(code);
    const res = await fetch(`/api/prof/sessions/${sessionId}/codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    setEncours(null);
    if (res.ok) void charger();
    else alert('Déblocage impossible. Réessaie dans un instant.');
  }

  if (!actif) return null;

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        // Les codes se chargent à l'ouverture du bloc, pas au rendu de la
        // console : ils ne servent qu'au début de l'épreuve, et les demander
        // créerait les codes d'un bac blanc qu'on ne fait qu'entrouvrir.
        onClick={() => {
          const prochain = !ouvert;
          setOuvert(prochain);
          if (prochain) void charger();
        }}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-bold text-gray-900">🔑 Codes de l’épreuve</span>
        <span className="text-sm text-gray-500">
          {ouvert ? 'Masquer' : 'Mon code, et celui de chaque élève'}
        </span>
      </button>

      {ouvert && (
        <div className="px-5 pb-5">
          {/* Mon code d'abord : c'est celui dont le professeur a besoin pour
              lui-même, et il n'est écrit nulle part ailleurs. */}
          {moi && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-900">Mon code de surveillance</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <code className="rounded-lg bg-white px-3 py-1.5 text-lg font-bold tracking-widest text-blue-900 border border-blue-200">
                  {moi.code}
                </code>
                <span className="text-sm text-blue-900/80">
                  {moi.ouvert_le ? `ouvert à ${heureCourte(moi.ouvert_le)}` : 'pas encore ouvert'}
                </span>
              </div>
              <p className="mt-2 text-sm text-blue-900/80">
                À saisir une fois, sur l’ordinateur d’où tu suis les copies. Il
                les ouvre <strong>toutes</strong>, et reste valable jusqu’au soir.
              </p>
            </div>
          )}

          <p className="mb-3 text-sm text-gray-600">
            Chaque élève a son code, et il le trouve déjà dans son espace élève —
            tu n’as rien à dicter. Il ne s’ouvre qu’une fois, sur un seul
            appareil, et reste valable toute la journée, même si son téléphone
            s’éteint. Tu le retrouves ici s’il l’a perdu.
          </p>
          {codes === null ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : codes.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun code pour ce bac blanc.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {codes.map((c) => (
                <div key={c.code} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="font-semibold text-gray-900 flex-1 min-w-[9rem]">
                    {c.eleve_nom ?? c.copie_id}
                  </span>
                  <code className="rounded-lg bg-gray-100 px-3 py-1.5 text-base font-bold tracking-widest text-gray-900">
                    {c.code}
                  </code>
                  <span className="text-sm text-gray-500 min-w-[9rem]">
                    {c.ouvert_le ? `ouvert à ${heureCourte(c.ouvert_le)}` : 'pas encore ouvert'}
                    {c.liberations > 0 && ` · débloqué ${c.liberations}×`}
                  </span>
                  <button
                    onClick={() => debloquer(c.code)}
                    disabled={!c.ouvert_le || encours === c.code}
                    title={
                      c.ouvert_le
                        ? 'L’élève pourra ressaisir son code sur un autre appareil.'
                        : 'Rien à débloquer : ce code n’a pas encore servi.'
                    }
                    className="px-3 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {encours === c.code ? '…' : 'Débloquer'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Sa copie dans l'application d'écriture. Rien à coller : l'adresse se déduit
 * du même code signé que l'espace de l'élève, donc les deux ouvrent
 * exactement la même copie.
 */
function LienEcriture({ eleve }: { eleve: EleveSession }) {
  if (!eleve.ecriture_url) return null;
  // Copie rendue : le bouton le dit et l'heure aussi. C'est le seul endroit où
  // le professeur a besoin de l'information — inutile d'en faire une liste de
  // plus, la ligne de l'élève porte déjà tout.
  const rendue = eleve.copie_rendue_le;
  return (
    <a
      href={eleve.ecriture_url}
      target="_blank"
      rel="noreferrer"
      title={
        rendue
          ? `Copie rendue à ${heureCourte(rendue)} — à relire et annoter.`
          : 'Sa copie dans l’application d’écriture, en direct.'
      }
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold flex-shrink-0 ${
        rendue
          ? 'border-green-600 bg-green-600 text-white hover:bg-green-700'
          : 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
      }`}
    >
      {rendue ? `✅ Copie rendue · ${heureCourte(rendue)}` : '✍️ Son écriture'}
    </a>
  );
}

/** « 12 h 04 » — l'heure telle qu'on l'écrit sur une copie. */
function heureCourte(iso: string): string {
  try {
    return new Date(iso)
      .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      .replace(':', ' h ');
  } catch {
    return '';
  }
}

/**
 * Le bip d'une main levée — deux notes courtes, volume bas.
 *
 * Écrit à la main avec l'API audio du navigateur plutôt qu'avec un fichier son :
 * pas de fichier à héberger, pas de téléchargement, et un son qui ne peut pas
 * être « le bip d'une autre application » que le prof aurait déjà entendu.
 *
 * Ne réveille le contexte audio qu'au premier besoin : un navigateur refuse de
 * jouer un son avant que la personne ait interagi avec la page, et insister
 * remplirait la console d'erreurs pour rien.
 */
function jouerBip() {
  try {
    const Contexte =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexte) return;

    const ctx = new Contexte();
    const jouer = (frequence: number, debut: number) => {
      const oscillateur = ctx.createOscillator();
      const volume = ctx.createGain();
      oscillateur.type = 'sine';
      oscillateur.frequency.value = frequence;
      // Une enveloppe douce : un créneau brut « claque » et fait sursauter.
      volume.gain.setValueAtTime(0.0001, ctx.currentTime + debut);
      volume.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + debut + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + debut + 0.18);
      oscillateur.connect(volume).connect(ctx.destination);
      oscillateur.start(ctx.currentTime + debut);
      oscillateur.stop(ctx.currentTime + debut + 0.2);
    };

    jouer(880, 0);
    jouer(1174, 0.16);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // Son refusé par le navigateur : le bandeau rouge reste, lui.
  }
}

const CLE_SON = 'mdb_console_son';

/** Le réglage du bip, tel qu'il est dans CE navigateur. */
function lireSon(): boolean {
  try {
    return localStorage.getItem(CLE_SON) !== 'non';
  } catch {
    // Navigation privée : on garde le son, c'est le comportement utile.
    return true;
  }
}

function ecrireSon(actif: boolean) {
  try {
    localStorage.setItem(CLE_SON, actif ? 'oui' : 'non');
  } catch {}
  window.dispatchEvent(new Event('mdb-son-change'));
}

function abonnerAuSon(rappel: () => void) {
  window.addEventListener('mdb-son-change', rappel);
  return () => window.removeEventListener('mdb-son-change', rappel);
}

export function SessionProf({
  session,
  eleves: elevesInitiaux,
  dateLisible,
  creneau,
}: {
  session: SessionEnrichie;
  eleves: EleveSession[];
  dateLisible: string;
  creneau: string;
}) {
  const [eleves, setEleves] = useState(elevesInitiaux);

  // La grille vit dans un état local : créer sa copie doit changer le bouton
  // sous les yeux du prof, sans recharger la page.
  const [grille, setGrille] = useState({
    url: session.grille_url,
    origine: session.grille_origine,
    titre: session.grille_titre,
    aCreer: session.classeur_a_creer,
  });
  const [creation, setCreation] = useState(false);
  const [erreurClasseur, setErreurClasseur] = useState<string | null>(null);

  const creerMonClasseur = async () => {
    setCreation(true);
    setErreurClasseur(null);
    try {
      const res = await fetch(`/api/prof/sessions/${session.id}/classeur`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErreurClasseur(data.error ?? 'Erreur.');
        return;
      }
      setGrille({ url: data.classeur.url, origine: 'mienne', titre: data.classeur.nom, aCreer: false });
      window.open(data.classeur.url, '_blank', 'noreferrer');
    } catch {
      setErreurClasseur('Pas de réseau. Réessaie.');
    } finally {
      setCreation(false);
    }
  };
  const [appels, setAppels] = useState<AppelOuvert[]>(
    elevesInitiaux
      .filter((e) => e.appel)
      .map((e) => ({
        id: e.appel!.id,
        inscription_id: e.id,
        motif: e.appel!.motif,
        source: 'espace',
        cree_le: e.appel!.cree_le,
        eleve_nom: e.nom,
        salon_url: e.salon_url,
      })),
  );
  // Une horloge à part : sans elle, « depuis 3 min » resterait figé entre deux
  // sondages, et un prof croirait que l'élève vient d'appeler.
  const [maintenant, setMaintenant] = useState(() => Date.now());

  // Le son est allumé par défaut, et le choix du prof est retenu sur SON
  // navigateur. Un prof qui surveille dans Discord en plein écran n'a plus à
  // revenir voir la console « au cas où ».
  //
  // Lu directement dans le navigateur plutôt que recopié dans un état : le
  // serveur, lui, ne connaît pas ce choix, et React sait gérer cet écart-là
  // proprement quand on le lui déclare.
  const son = useSyncExternalStore(abonnerAuSon, lireSon, () => true);
  const basculerSon = () => {
    const apres = !lireSon();
    ecrireSon(apres);
    if (apres) jouerBip(); // le prof entend tout de suite ce qu'il vient d'activer
  };

  // Les appels déjà signalés : le bip ne sonne QUE pour une main nouvellement
  // levée. Sans cette mémoire, il sonnerait toutes les dix secondes tant que
  // l'élève attend — c'est-à-dire exactement quand le prof est occupé avec lui.
  const dejaSignales = useRef(new Set(appels.map((a) => a.id)));

  const relireAppels = useCallback(async () => {
    try {
      const res = await fetch(`/api/prof/appels?session=${session.id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const liste: AppelOuvert[] = data.appels ?? [];

      const nouveaux = liste.filter((a) => !dejaSignales.current.has(a.id));
      if (nouveaux.length && lireSon()) jouerBip();
      dejaSignales.current = new Set(liste.map((a) => a.id));

      setAppels(liste);
    } catch {
      // Réseau coupé le temps d'un sondage : on garde l'affichage précédent
      // plutôt que de faire disparaître une main levée.
    }
  }, [session.id]);

  useEffect(() => {
    const horloge = setInterval(() => setMaintenant(Date.now()), 30_000);
    const sondage = setInterval(relireAppels, CADENCE_APPELS_MS);
    // Un premier sondage tout de suite après l'affichage — pas pendant : la
    // page s'ouvre avec les appels déjà connus du serveur, et rafraîchir
    // pendant le rendu ferait cascader les re-rendus pour rien.
    const premier = setTimeout(relireAppels, 0);
    return () => { clearInterval(horloge); clearInterval(sondage); clearTimeout(premier); };
  }, [relireAppels]);

  const cestRegle = async (appelId: string) => {
    // Optimiste : le bandeau se vide tout de suite, le serveur suit.
    setAppels((liste) => liste.filter((a) => a.id !== appelId));
    await fetch('/api/prof/appels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appel_id: appelId }),
    });
    relireAppels();
  };

  // Le titre de l'onglet porte le nombre d'élèves qui attendent : c'est ce que
  // voit un prof qui a Discord en plein écran et la console derrière.
  // Réappliqué après CHAQUE rendu, volontairement sans liste de dépendances :
  // Next pose le titre de la page à la fin de l'hydratation, donc plus tard
  // qu'un effet monté une seule fois — le nôtre serait écrasé et ne
  // reviendrait jamais.
  useEffect(() => {
    const base = `${session.matiere} — ma console`;
    document.title = appels.length ? `(${appels.length}) ✋ ${base}` : base;
  });

  // Les compteurs comptent les DEUX circuits, comme les pastilles des lignes :
  // sinon l'en-tête annonçait « 0 copie déposée » au-dessus d'une liste
  // d'élèves dont le dossier était prêt.
  const avecCopie = eleves.filter((e) => e.copie || e.correction);
  const corrigees = eleves.filter(
    (e) => e.copie?.statut === 'corrigée' || e.correction?.statut.startsWith('corrected'),
  );
  const appelParEleve = new Map(appels.map((a) => [a.inscription_id, a]));

  return (
    <div>
      <a href="/espace-prof" className="text-sm text-purple-600 hover:underline">
        ← Retour au tableau de bord
      </a>

      {/* En-tête : la date en grand, puis les trois adresses du jour J. */}
      <header className="mt-3 mb-5 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide">
          {session.matiere}
        </p>
        <h1 className="text-3xl font-bold text-gray-900 capitalize mt-1">{dateLisible}</h1>
        <p className="text-gray-500 mt-1">{creneau}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm">
          <span className="text-gray-700"><strong>{eleves.length}</strong> élève{eleves.length > 1 ? 's' : ''} inscrit{eleves.length > 1 ? 's' : ''}</span>
          <span className="text-gray-700"><strong>{avecCopie.length}</strong> copie{avecCopie.length > 1 ? 's' : ''} déposée{avecCopie.length > 1 ? 's' : ''}</span>
          <span className="text-gray-700"><strong>{corrigees.length}</strong> corrigée{corrigees.length > 1 ? 's' : ''}</span>
          {/* Toujours accessible, pas seulement quand un élève appelle : le prof
              doit pouvoir vérifier le son AVANT l'épreuve, pas pendant. */}
          <button
            onClick={basculerSon}
            title={son ? 'Un petit bip à chaque main levée. Clique pour le couper.' : 'Le bip est coupé. Clique pour l’entendre.'}
            className="sm:ml-auto text-xs font-semibold text-gray-500 hover:text-purple-700"
          >
            {son ? '🔔 Bip activé' : '🔕 Bip coupé'}
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mt-5">
          <GrandBouton
            href={session.categorie_url}
            emoji="🎧"
            titre="Salles Discord de l’épreuve"
            sousTitre="Entre dans le bloc, puis passe d’une salle d’élève à l’autre."
            manque="Les salles ne sont pas encore préparées. Elles se créent depuis l’administration, onglet Discord, bouton « Préparer les salles »."
            couleur="bg-indigo-600 hover:bg-indigo-700"
          />
          <GrandBouton
            href={grille.url}
            emoji="📊"
            titre={grille.origine === 'mienne' ? 'Mon classeur de correction' : 'Grille de correction'}
            sousTitre={
              grille.origine === 'mienne'
                ? `Ta copie pour ce bac blanc — tous tes élèves dedans. (${grille.titre})`
                : grille.origine === 'session'
                  ? 'Le classeur préparé pour ce bac blanc — tous tes élèves dedans.'
                  : grille.origine === 'matiere'
                    ? `Le modèle de ta matière.${grille.titre ? ` (${grille.titre})` : ''} Crée ta copie ci-dessous.`
                    : 'Classeur de secours — aucun classeur propre à cette matière.'
            }
            manque={`Le classeur de correction de cette matière n’existe pas encore${grille.titre ? ` (« ${grille.titre} »)` : ''}. En attendant, un classeur de secours peut être posé dans l’administration → Bacs blancs → « Réglages du jour J ».`}
            couleur="bg-green-600 hover:bg-green-700"
          />
          <GrandBouton
            href={session.dossier_url}
            emoji="📁"
            titre="Dossier des copies"
            sousTitre="Toutes les copies des élèves, au même endroit."
            manque="Aucun dossier renseigné. À poser une seule fois dans l’administration → Bacs blancs → « Réglages du jour J »."
            couleur="bg-blue-600 hover:bg-blue-700"
          />
        </div>

        {/* Tant que le prof n'a pas SA copie, le modèle de la matière reste
            ouvrable — mais on lui propose la copie, qui est ce qu'il doit
            vraiment remplir. Un clic, jamais automatique : on crée un fichier
            dans le Drive. */}
        {grille.aCreer && grille.origine !== 'mienne' && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                Tu n’as pas encore ton classeur pour ce bac blanc.
              </p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                Il sera intitulé « Bac blanc — {session.matiere} — {dateLisible} — ton nom »,
                partagé avec toi, et rangé dans l’archive. Le classeur de la matière, lui,
                reste un modèle vierge.
              </p>
              {erreurClasseur && <p className="text-xs text-red-600 mt-1.5">{erreurClasseur}</p>}
            </div>
            <button
              onClick={creerMonClasseur}
              disabled={creation}
              className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"
            >
              {creation ? 'Création…' : '📋 Créer mon classeur'}
            </button>
          </div>
        )}
      </header>

      {/* Les mains levées : au-dessus de tout le reste.
          Un élève qui attend passe avant ce que le prof était en train de faire. */}
      {appels.length > 0 && (
        <section className="mb-5 rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-bold text-red-800 uppercase tracking-wide">
              ✋ {appels.length} élève{appels.length > 1 ? 's' : ''} attend{appels.length > 1 ? 'ent' : ''} ton aide
            </h2>
            <button
              onClick={basculerSon}
              title={son ? 'Couper le bip' : 'Rallumer le bip'}
              className="text-xs font-semibold text-red-700 hover:text-red-900 flex-shrink-0"
            >
              {son ? '🔔 Son activé' : '🔕 Son coupé'}
            </button>
          </div>
          <div className="space-y-2">
            {appels.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-red-200 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">
                    {a.motif === 'technique' ? '🛠️ ' : '✋ '}{a.eleve_nom}
                  </p>
                  <p className="text-xs text-red-600">
                    {a.motif === 'technique' ? 'Souci technique' : 'Besoin d’aide'} · {depuis(a.cree_le, maintenant)}
                  </p>
                </div>
                {a.salon_url && (
                  <a
                    href={a.salon_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex-shrink-0"
                  >
                    <IconeDiscord />
                    Le rejoindre
                  </a>
                )}
                <button
                  onClick={() => cestRegle(a.id)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 flex-shrink-0"
                >
                  ✓ C’est réglé
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mb-5">
        <LiaisonDiscord pourquoi="C’est ce qui t’ouvre la zone Équipe et les salles de tes élèves : sans compte relié, tu vois les liens mais tu ne peux pas entrer." />
      </div>

      <CodesEpreuve sessionId={session.id} />

      {/* --- Mes élèves : UNE seule liste, et tout y est ---------------
          Il y avait un onglet « Copies » qui reprenait les mêmes élèves avec
          les mêmes liens : deux endroits pour la même chose, donc deux endroits
          à consulter et un doute sur lequel fait foi. La note et la copie
          déposée ont rejoint la ligne de l'élève, et l'onglet a disparu. */}
      <section className="mb-6">
        {/* Pas de compteurs ici : ils sont déjà dans l'en-tête, trois lignes
            plus haut. Les répéter n'ajoute rien et fait douter de la source. */}
        <h2 className="font-bold text-gray-900 mb-3">Mes élèves</h2>

        {eleves.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
            Aucun élève inscrit sur ce bac blanc pour l’instant.
          </div>
        ) : (
          <div className="space-y-3">
            {eleves.map((e) => {
              const s = statutEleve(e);
              const appel = appelParEleve.get(e.id);
              return (
                <div
                  key={e.id}
                  className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                    appel ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">
                      {appel && <span className="mr-1.5">{appel.motif === 'technique' ? '🛠️' : '✋'}</span>}
                      {e.nom}
                      {/* La note du pipeline d'abord — et on dit d'où elle
                          vient : « ta » note, ou celle que l'IA propose en
                          attendant la grille du professeur. */}
                      {e.correction?.note != null ? (
                        <span
                          className="ml-2 text-sm font-bold text-purple-700"
                          title={
                            e.correction.note_source === 'professeur'
                              ? 'Note de ta grille — c’est elle qui fait foi.'
                              : 'Note proposée par la correction automatique, en attendant ta grille.'
                          }
                        >
                          {e.correction.note}/20
                          {e.correction.note_source !== 'professeur' && (
                            <span className="ml-1 font-normal text-gray-400">(provisoire)</span>
                          )}
                        </span>
                      ) : (
                        e.copie?.note != null && (
                          <span className="ml-2 text-sm font-bold text-purple-700">{e.copie.note}/20</span>
                        )
                      )}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {e.email || '—'}
                      {e.copie?.fichier_nom && (
                        <>
                          {' · '}
                          <a
                            href={`/api/copies/fichier?id=${e.copie.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-purple-500 hover:underline"
                          >
                            copie déposée
                          </a>
                        </>
                      )}
                    </p>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${s.classe}`}>
                    {s.texte}
                  </span>

                  {/* Le dossier de l'élève, quand il est fabriqué : c'est
                      exactement la page que l'élève reçoit, sujet compris. Sans
                      ce bouton, le professeur faisait produire un dossier
                      qu'aucun de ses écrans ne lui montrait. */}
                  {e.correction?.dossier_url && (
                    <a
                      href={e.correction.dossier_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Le dossier de correction, tel que l’élève le voit."
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 flex-shrink-0"
                    >
                      📘 Son dossier
                    </a>
                  )}

                  <LienEcriture eleve={e} />

                  <DocEleve
                    eleve={e}
                    sessionId={session.id}
                    onChange={(url) =>
                      setEleves((liste) =>
                        // On recalcule aussi ce que le bouton ouvre : sans ça, la
                        // ligne garderait l'ancien lien jusqu'au rechargement.
                        liste.map((x) =>
                          x.id === e.id
                            ? {
                                ...x,
                                copie_doc_url: url,
                                doc_url: url ?? x.ecriture_url,
                                doc_origine: url ? 'colle' : x.ecriture_url ? 'ecriture' : 'aucun',
                              }
                            : x,
                        ),
                      )
                    }
                  />

                  {/* Pas de salle attribuée = pas de lien. Un bouton qui ouvre une
                      page Discord vide vaut moins qu'une phrase qui dit pourquoi. */}
                  {e.salon_url ? (
                    <a
                      href={e.salon_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex-shrink-0"
                    >
                      <IconeDiscord />
                      Sa salle
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400 flex-shrink-0" title="Les salles se créent depuis l’administration, avant l’épreuve.">
                      Salle pas encore créée
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* --- Le sujet, puis le questionnaire de fin de session ----------- */}
      <SujetEtRetour sessionId={session.id} />

      {/* --- Après l'épreuve ---------------------------------------------
          Trois liens, discrets : on ne remet PAS le bouton de la grille ici,
          il est déjà en haut de l'écran. Chaque chose une fois. */}
      <section className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Après l’épreuve</h2>
        <p className="text-sm text-gray-600 mb-4">
          Ta grille remplie se dépose ici en CSV : les élèves et les critères sont reconnus
          tout seuls, et les corrections sont préremplies.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={`/espace-prof/session/${session.id}/import`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">
            📥 Importer ma grille remplie
          </a>
          <a href={`/espace-prof/deposer?session=${session.id}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50">
            📄 Déposer une copie
          </a>
          <a href="/espace-prof/corrections"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50">
            🗂️ Suivi des dossiers
          </a>
        </div>
      </section>
    </div>
  );
}
