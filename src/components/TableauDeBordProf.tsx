'use client';

/**
 * Tableau de bord du prof, en 4 onglets :
 *   Vue d'ensemble · Mes bacs blancs · Sessions disponibles · Mon profil
 *
 * Toutes les données arrivent déjà calculées du serveur : ce composant ne parle
 * à l'API que pour deux actions (s'inscrire comme coach, se déconnecter).
 */
import { useState } from 'react';
import { LiaisonDiscord } from '@/components/LiaisonDiscord';
import type { BlocsSessions, Revenus, SessionEnrichie } from '@/lib/espaceProf';
import type { Professeur } from '@/lib/authProf';
import { GAIN_PAR_ELEVE, GAIN_PAR_MATINEE, SEUIL_COACH } from '@/lib/reglesProf';

type Onglet = 'ensemble' | 'mes-bacs' | 'disponibles' | 'profil';

const ONGLETS: { cle: Onglet; label: string; emoji: string }[] = [
  { cle: 'ensemble', label: 'Vue d’ensemble', emoji: '📊' },
  { cle: 'mes-bacs', label: 'Mes bacs blancs', emoji: '🗓️' },
  { cle: 'disponibles', label: 'Sessions disponibles', emoji: '🔎' },
  { cle: 'profil', label: 'Mon profil', emoji: '👤' },
];

const euros = (n: number) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function dateCourte(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return {
    jour: d.toLocaleDateString('fr-FR', { day: 'numeric' }),
    mois: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    jourSemaine: d.toLocaleDateString('fr-FR', { weekday: 'long' }),
    annee: d.getFullYear(),
  };
}

const creneau = (s: SessionEnrichie) => (s.heure_fin ? `${s.heure_debut} — ${s.heure_fin}` : s.heure_debut);

const LIBELLE_STATUT: Record<string, { texte: string; classe: string }> = {
  ouverte: { texte: 'Inscriptions ouvertes', classe: 'bg-green-100 text-green-800' },
  complete: { texte: 'Complet', classe: 'bg-amber-100 text-amber-800' },
  en_cours: { texte: 'En cours', classe: 'bg-blue-100 text-blue-800' },
  terminee: { texte: 'Terminé', classe: 'bg-gray-100 text-gray-600' },
  annulee: { texte: 'Annulé', classe: 'bg-red-100 text-red-700' },
};

function Statut({ statut }: { statut: string }) {
  const s = LIBELLE_STATUT[statut] ?? { texte: statut, classe: 'bg-gray-100 text-gray-600' };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${s.classe}`}>{s.texte}</span>;
}

/** Carte d'une session : la date d'abord, en très gros, comme demandé. */
function CarteSession({
  session,
  action,
}: {
  session: SessionEnrichie;
  action?: React.ReactNode;
}) {
  const d = dateCourte(session.date_epreuve);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
      {/* Date, en grand */}
      <div className="flex-shrink-0 w-20 text-center rounded-xl bg-purple-50 border border-purple-100 py-3">
        <div className="text-3xl font-bold text-purple-700 leading-none">{d.jour}</div>
        <div className="text-sm font-semibold text-purple-600 uppercase">{d.mois}</div>
        <div className="text-[11px] text-purple-400">{d.annee}</div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h3 className="text-lg font-bold text-gray-900">{session.matiere}</h3>
          <Statut statut={session.statut} />
        </div>
        <p className="text-sm text-gray-500 capitalize">
          {d.jourSemaine} · {creneau(session)}
        </p>
        <div className="flex gap-4 mt-2 text-sm">
          <span className="text-gray-700">
            <strong>{session.nb_eleves}</strong> élève{session.nb_eleves > 1 ? 's' : ''} inscrit
            {session.nb_eleves > 1 ? 's' : ''}
          </span>
          <span className="text-gray-400">
            {session.nb_coachs}/{session.coachs_recherches} coach
            {session.coachs_recherches > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Les règles du jeu, en haut de la vue d'ensemble : ce que le prof doit
 * savoir avant tout le reste (reprend les slides « Ambassadeur » et
 * « Devenir coach »). La jauge dit où il en est.
 */
function ReglesDuJeu({ inscrits, code }: { inscrits: number; code: string }) {
  const debloque = inscrits >= SEUIL_COACH;
  const pct = Math.min(100, Math.round((inscrits / SEUIL_COACH) * 100));
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h2 className="font-bold text-gray-900 mb-4">Comment ça marche</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Étape 1 · Ambassadeur</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{GAIN_PAR_ELEVE} € <span className="text-base font-semibold">net</span></p>
          <p className="text-sm text-gray-700">par élève inscrit grâce à toi</p>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
            <li>• Tes élèves s’inscrivent avec ton lien ou ton code <span className="font-mono font-semibold">{code}</span>.</li>
            <li>• Les {GAIN_PAR_ELEVE} € te sont dus dès que l’élève a réglé sa matinée.</li>
            <li>• Aucun plafond : 6 élèves sur une matinée = {6 * GAIN_PAR_ELEVE} € en plus.</li>
          </ul>
        </div>

        <div className="rounded-xl bg-purple-50 border border-purple-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-purple-700">Étape 2 · Coach bac blanc</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{GAIN_PAR_MATINEE} € <span className="text-base font-semibold">net minimum</span></p>
          <p className="text-sm text-gray-700">par matinée de 3 à 4 h, soit environ 20 €/h</p>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
            <li>• S’ouvre dès que <strong>{SEUIL_COACH} élèves</strong> se sont inscrits avec ton code.</li>
            <li>• Temps pleinement payé : aucun trajet, aucune prospection, aucune gestion des familles.</li>
            <li>• Les {GAIN_PAR_ELEVE} € par élève recommandé s’ajoutent aux {GAIN_PAR_MATINEE} €.</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-800">
            {debloque ? '✅ Tu peux coacher des bacs blancs' : '🔒 Accès coach'}
          </span>
          <span className="font-mono text-gray-600">{Math.min(inscrits, SEUIL_COACH)}/{SEUIL_COACH} élèves</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${debloque ? 'bg-green-500' : 'bg-purple-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {debloque
            ? 'Choisis ton bac blanc dans l’onglet « Sessions disponibles ».'
            : `Encore ${SEUIL_COACH - inscrits} élève${SEUIL_COACH - inscrits > 1 ? 's' : ''} à faire inscrire avec ton code pour débloquer les sessions de coach.`}
        </p>
      </div>
    </section>
  );
}

/** Formulaire « Changer mon mot de passe » (onglet Mon profil). */
function ChangerMotDePasse() {
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setEtat(null);
    try {
      const res = await fetch('/api/prof/mot-de-passe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ancien, nouveau }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEtat({ ok: false, texte: data.error || 'Erreur.' });
        return;
      }
      setAncien('');
      setNouveau('');
      setEtat({ ok: true, texte: 'Mot de passe changé ✓' });
    } catch {
      setEtat({ ok: false, texte: 'Erreur de connexion.' });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={valider} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-xs text-gray-600">
        Mot de passe actuel
        <input type="password" required autoComplete="current-password" value={ancien}
          onChange={(e) => setAncien(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg" />
      </label>
      <label className="text-xs text-gray-600">
        Nouveau (10 caractères, lettres et chiffres)
        <input type="password" required minLength={10} autoComplete="new-password" value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          className="mt-1 w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg" />
      </label>
      <button type="submit" disabled={envoi}
        className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
        {envoi ? '…' : 'Changer'}
      </button>
      {etat && (
        <p className={`sm:col-span-3 text-xs font-medium ${etat.ok ? 'text-green-700' : 'text-red-700'}`}>{etat.texte}</p>
      )}
    </form>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
      {texte}
    </div>
  );
}

export function TableauDeBordProf({
  prof,
  revenus,
  blocs,
  lienAffiliation,
  usurpePar,
}: {
  prof: Professeur;
  revenus: Revenus;
  blocs: BlocsSessions;
  lienAffiliation: string;
  usurpePar: string | null;
}) {
  const [onglet, setOnglet] = useState<Onglet>('ensemble');
  const [sessions, setSessions] = useState(blocs);
  const [busy, setBusy] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const prochaine = sessions.aVenir[0] ?? null;
  // Même règle que l'API (/api/prof/sessions) : l'admin n'y est pas soumise.
  const coachDebloque = prof.role === 'admin' || revenus.eleves_parraines >= SEUIL_COACH;

  const copierLien = async () => {
    await navigator.clipboard.writeText(lienAffiliation);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  };

  // Le code seul, pour l'élève qui s'inscrit sans passer par le lien (il le
  // recopie dans le formulaire). Sans lui, un prof qui parle de vive voix à un
  // élève n'avait rien à lui donner d'autre qu'une longue adresse.
  const [codeCopie, setCodeCopie] = useState(false);
  const copierCode = async () => {
    await navigator.clipboard.writeText(prof.code_affiliation);
    setCodeCopie(true);
    setTimeout(() => setCodeCopie(false), 2000);
  };

  const seCoacher = async (session: SessionEnrichie) => {
    setBusy(session.id);
    setErreur(null);
    try {
      const res = await fetch('/api/prof/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, action: 'inscrire' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error || 'Erreur.');
        return;
      }
      // Optimiste : la session bascule de « disponibles » vers « mes bacs blancs ».
      setSessions((s) => ({
        ...s,
        disponibles: s.disponibles.filter((x) => x.id !== session.id),
        aVenir: [...s.aVenir, { ...session, je_coache: true, nb_coachs: session.nb_coachs + 1 }].sort(
          (a, b) => a.date_epreuve.localeCompare(b.date_epreuve),
        ),
      }));
      setOnglet('mes-bacs');
    } catch {
      setErreur('Erreur de connexion.');
    } finally {
      setBusy('');
    }
  };

  const seDeconnecter = async () => {
    await fetch('/api/prof/deconnexion', { method: 'POST' });
    window.location.href = '/devenir-coach?connexion';
  };

  const quitterUsurpation = async () => {
    await fetch('/api/admin/voir-comme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professeurId: null }),
    });
    window.location.reload();
  };

  return (
    <div>
      {/* Bandeau d'usurpation — toujours visible tant que l'admin est dans l'espace d'un prof. */}
      {usurpePar && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-red-600 text-white px-4 py-3 text-sm">
          <span aria-hidden>👁️</span>
          <span className="flex-1">
            Tu es <strong>{usurpePar}</strong> et tu consultes l’espace de {prof.prenom} {prof.nom}.
          </span>
          <button onClick={quitterUsurpation}
            className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 font-semibold">
            Revenir chez moi
          </button>
        </div>
      )}

      {/* Bandeau revenus + stats */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 mb-6 shadow-lg">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-purple-200 text-sm">Bonjour</p>
            <h1 className="text-2xl font-bold">{prof.prenom} {prof.nom}</h1>
            <p className="text-purple-200 text-sm mt-0.5">
              {(prof.matieres ?? []).join(' · ') || 'Aucune matière renseignée'}
            </p>
          </div>
          {/* Les consoles d'administration ne vivent plus ici : elles ont leur
              propre espace, /direction, partagé par l'équipe de direction. */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <button
              onClick={seDeconnecter}
              className="text-xs text-purple-200 hover:text-white underline"
            >
              Se déconnecter
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Revenus totaux', valeur: euros(revenus.total) },
            { label: 'Affiliation', valeur: euros(revenus.affiliation) },
            { label: 'Coaching', valeur: euros(revenus.coaching) },
            { label: 'Reste à percevoir', valeur: euros(revenus.a_payer) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white/10 px-4 py-3">
              <p className="text-purple-200 text-xs">{s.label}</p>
              <p className="text-xl font-bold mt-0.5">{s.valeur}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-gray-200">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            onClick={() => setOnglet(o.cle)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition border-b-2 ${
              onglet === o.cle
                ? 'text-purple-700 border-purple-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <span aria-hidden className="mr-1.5">{o.emoji}</span>
            {o.label}
            {o.cle === 'disponibles' && sessions.disponibles.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs">
                {sessions.disponibles.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Le compte Discord du prof — hors des onglets, donc visible quel que
          soit celui qui est ouvert. C'est la porte de la zone Équipe et de
          toutes les salles d'élèves : la reléguer dans un onglet reviendrait à
          la cacher. Le bloc disparaît de lui-même une fois le compte relié. */}
      <div className="mb-4">
        <LiaisonDiscord pourquoi="C’est ce qui t’ouvre la zone Équipe et les salles de tes élèves : sans compte relié, tu vois les liens mais tu ne peux pas entrer." />
      </div>

      {erreur && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 text-red-800 text-sm font-medium">{erreur}</div>
      )}

      {/* --- Vue d'ensemble --- */}
      {onglet === 'ensemble' && (
        <div className="space-y-6">
          <ReglesDuJeu inscrits={revenus.eleves_parraines} code={prof.code_affiliation} />

          {/* Lien d'affiliation */}
          <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-1">Mon lien d’affiliation</h2>
            <p className="text-sm text-gray-500 mb-3">
              Partage-le : chaque élève inscrit par ce lien t’est rattaché, et te rapporte{' '}
              <strong className="text-gray-700">10 €</strong> dès qu’il a réglé sa matinée.
              {revenus.eleves_parraines > 0 && (
                <> <strong className="text-gray-700">{revenus.eleves_parraines} élève
                {revenus.eleves_parraines > 1 ? 's' : ''}</strong> à ce jour.</>
              )}
              {' '}Un élève qui s’inscrit sans passer par le lien peut aussi taper ton code{' '}
              <span className="font-mono text-gray-700">{prof.code_affiliation}</span> dans le
              formulaire.
            </p>
            <div className="flex gap-2">
              <input readOnly value={lienAffiliation}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-700" />
              <button onClick={copierLien}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 whitespace-nowrap">
                {copie ? 'Copié ✓' : 'Copier'}
              </button>
            </div>

            {/* Le code seul, en gros : c'est ce qu'on dicte au téléphone. */}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-purple-50 border border-purple-200 p-3">
              <div>
                <p className="text-xs font-semibold text-purple-800">Mon code</p>
                <p className="text-2xl font-bold font-mono tracking-wider text-purple-900 leading-tight">
                  {prof.code_affiliation}
                </p>
              </div>
              <button onClick={copierCode}
                className="px-3 py-1.5 rounded-lg border border-purple-300 bg-white text-xs font-semibold text-purple-800 hover:bg-purple-100">
                {codeCopie ? 'Copié ✓' : 'Copier le code'}
              </button>
              <p className="text-xs text-purple-800 sm:ml-auto sm:max-w-xs">
                À dicter à un élève qui s’inscrit sans passer par ton lien : il le tape dans le champ
                « Code du professeur qui t’a recommandé ».
              </p>
            </div>
          </section>

          {/* Prochaine session */}
          <section>
            <h2 className="font-bold text-gray-900 mb-3">Ma prochaine matinée</h2>
            {prochaine ? (
              <CarteSession
                session={prochaine}
                action={
                  <a href={`/espace-prof/session/${prochaine.id}`}
                    className="inline-block px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">
                    Ouvrir ma console →
                  </a>
                }
              />
            ) : (
              <Vide texte="Tu n’es inscrit sur aucun bac blanc à venir. Va voir l’onglet « Sessions disponibles »." />
            )}
          </section>

          {/* Alertes */}
          <section>
            <h2 className="font-bold text-gray-900 mb-3">À terminer</h2>
            {(() => {
              const alertes: string[] = [];
              if ((prof.matieres ?? []).length === 0) {
                alertes.push('Aucune matière renseignée : tu ne verras aucun bac blanc disponible.');
              }
              if (prof.statut_candidature === 'en_attente') {
                alertes.push('Ta candidature est en cours de validation par l’administratrice.');
              }
              if (sessions.aVenir.length === 0 && sessions.disponibles.length > 0) {
                alertes.push(
                  `${sessions.disponibles.length} bac${sessions.disponibles.length > 1 ? 's' : ''} blanc${sessions.disponibles.length > 1 ? 's' : ''} cherche${sessions.disponibles.length > 1 ? 'nt' : ''} un coach dans tes matières.`,
                );
              }
              if (revenus.a_payer > 0) {
                alertes.push(`${euros(revenus.a_payer)} en attente de versement.`);
              }
              return alertes.length ? (
                <ul className="space-y-2">
                  {alertes.map((a) => (
                    <li key={a} className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-sm text-amber-900">
                      <span aria-hidden>⚠️</span>{a}
                    </li>
                  ))}
                </ul>
              ) : (
                <Vide texte="Rien à signaler — tout est à jour." />
              );
            })()}
          </section>
        </div>
      )}

      {/* --- Mes bacs blancs --- */}
      {onglet === 'mes-bacs' && (
        <div className="space-y-8">
          <section>
            <h2 className="font-bold text-gray-900 mb-3">Mes prochains bacs blancs</h2>
            {sessions.aVenir.length ? (
              <div className="space-y-3">
                {sessions.aVenir.map((s) => (
                  <CarteSession key={s.id} session={s}
                    action={
                      <a href={`/espace-prof/session/${s.id}`}
                        className="inline-block px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">
                        Ouvrir ma console →
                      </a>
                    }
                  />
                ))}
              </div>
            ) : (
              <Vide texte="Aucun bac blanc à venir pour l’instant." />
            )}
          </section>

          <section>
            <h2 className="font-bold text-gray-900 mb-3">Bacs blancs passés</h2>
            {sessions.passees.length ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-5 py-2.5 font-medium">Date</th>
                        <th className="text-left px-5 py-2.5 font-medium">Matière</th>
                        <th className="text-left px-5 py-2.5 font-medium">Élèves</th>
                        <th className="text-left px-5 py-2.5 font-medium">Gagné</th>
                        <th className="px-5 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.passees.map((s) => {
                        const d = dateCourte(s.date_epreuve);
                        return (
                          <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-5 py-3 font-medium text-gray-800">
                              {d.jour} {d.mois} {d.annee}
                            </td>
                            <td className="px-5 py-3 text-gray-600">{s.matiere}</td>
                            <td className="px-5 py-3 text-gray-600">{s.nb_eleves}</td>
                            <td className="px-5 py-3 font-semibold text-gray-800">{euros(s.remuneration)}</td>
                            <td className="px-5 py-3 text-right">
                              <a href={`/espace-prof/session/${s.id}`}
                                className="text-purple-600 text-xs font-medium hover:underline">
                                Voir les corrections
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <Vide texte="Aucun bac blanc passé pour le moment." />
            )}
          </section>
        </div>
      )}

      {/* --- Sessions disponibles --- */}
      {onglet === 'disponibles' && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500 mb-1">
            Uniquement les bacs blancs de tes matières : {(prof.matieres ?? []).join(', ') || '—'}.
          </p>
          {!coachDebloque && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
              🔒 Pour t’inscrire comme coach, fais d’abord inscrire <strong>{SEUIL_COACH} élèves</strong> avec
              ton code <span className="font-mono font-semibold">{prof.code_affiliation}</span> — tu en es
              à {revenus.eleves_parraines}/{SEUIL_COACH}. Tu peux déjà regarder les dates.
            </div>
          )}
          {sessions.disponibles.length ? (
            sessions.disponibles.map((s) => {
              const complet = s.nb_coachs >= s.coachs_recherches;
              return (
                <CarteSession key={s.id} session={s}
                  action={
                    <button
                      onClick={() => seCoacher(s)}
                      disabled={busy === s.id || complet || !coachDebloque}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy === s.id ? '…' : complet ? 'Coachs au complet' : !coachDebloque ? `🔒 ${revenus.eleves_parraines}/${SEUIL_COACH} élèves` : 'S’inscrire comme coach'}
                    </button>
                  }
                />
              );
            })
          ) : (
            <Vide texte="Aucun bac blanc ouvert dans tes matières pour le moment." />
          )}
        </section>
      )}

      {/* --- Mon profil --- */}
      {onglet === 'profil' && (
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 max-w-2xl">
          <dl className="space-y-4">
            {[
              ['Prénom', prof.prenom],
              ['Nom', prof.nom],
              ['E-mail', prof.email],
              ['Téléphone', prof.telephone || '—'],
              ['Matières enseignées', (prof.matieres ?? []).join(', ') || '—'],
              ['Code d’affiliation', prof.code_affiliation],
              ['Candidature', prof.statut_candidature.replace('_', ' ')],
              ['Compte', prof.statut_compte],
              ['Inscrit le', new Date(prof.created_at).toLocaleDateString('fr-FR')],
            ].map(([label, valeur]) => (
              <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 border-b border-gray-100 pb-3 last:border-0">
                <dt className="text-sm text-gray-500 sm:w-52 flex-shrink-0">{label}</dt>
                <dd className="text-sm font-medium text-gray-900">{valeur}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
            <h3 className="font-semibold text-gray-800 text-sm mb-1">Mot de passe</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Ton mot de passe est chiffré : personne ne peut le relire, pas même
              l’administratrice. En cas d’oubli, écris-lui : elle t’en définit un nouveau.
            </p>
            {!usurpePar && <ChangerMotDePasse />}
          </div>

          <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
            <h3 className="font-semibold text-gray-800 text-sm mb-1">Modifier mes informations</h3>
            <p className="text-xs text-gray-500">
              Pour ajouter une matière ou corriger tes coordonnées, contacte l’administratrice.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
