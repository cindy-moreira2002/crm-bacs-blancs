'use client';

/**
 * Tableau de bord du prof, en 4 onglets :
 *   Vue d'ensemble · Mes bacs blancs · Sessions disponibles · Mon profil
 *
 * Toutes les données arrivent déjà calculées du serveur : ce composant ne parle
 * à l'API que pour deux actions (s'inscrire comme coach, se déconnecter).
 */
import { useState } from 'react';
import type { BlocsSessions, Revenus, SessionEnrichie } from '@/lib/espaceProf';
import type { Professeur } from '@/lib/authProf';

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

  const copierLien = async () => {
    await navigator.clipboard.writeText(lienAffiliation);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
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
    window.location.href = '/devenir-coach';
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
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <button onClick={seDeconnecter}
              className="text-xs text-purple-200 hover:text-white underline">
              Se déconnecter
            </button>
            {/* Tours de contrôle — réservées à l'administratrice. */}
            {prof.role === 'admin' && (
              <>
                <a href="/admin/bacs-blancs"
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold">
                  📅 Bacs blancs
                </a>
                <a href="/admin/correction"
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold">
                  🎛️ Pilotage correction
                </a>
                <a href="/admin/emails"
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold">
                  📬 E-mails
                </a>
              </>
            )}
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

      {erreur && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 text-red-800 text-sm font-medium">{erreur}</div>
      )}

      {/* --- Vue d'ensemble --- */}
      {onglet === 'ensemble' && (
        <div className="space-y-6">
          {/* Lien d'affiliation */}
          <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-1">Mon lien d’affiliation</h2>
            <p className="text-sm text-gray-500 mb-3">
              Partage-le : chaque élève inscrit par ce lien t’est rattaché.
              {revenus.eleves_parraines > 0 && (
                <> <strong className="text-gray-700">{revenus.eleves_parraines} élève
                {revenus.eleves_parraines > 1 ? 's' : ''}</strong> à ce jour.</>
              )}
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
                    Ouvrir la session →
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
                        Ouvrir la session →
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
          {sessions.disponibles.length ? (
            sessions.disponibles.map((s) => {
              const complet = s.nb_coachs >= s.coachs_recherches;
              return (
                <CarteSession key={s.id} session={s}
                  action={
                    <button
                      onClick={() => seCoacher(s)}
                      disabled={busy === s.id || complet}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy === s.id ? '…' : complet ? 'Coachs au complet' : 'S’inscrire comme coach'}
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
            <p className="text-xs text-gray-500 leading-relaxed">
              Ton mot de passe est chiffré : personne ne peut le relire, pas même
              l’administratrice. Pour le changer ou en cas d’oubli, écris à
              l’administratrice — elle peut t’en définir un nouveau, que tu modifieras ensuite.
            </p>
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
