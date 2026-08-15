'use client';

/**
 * Vue d'ensemble Direction — un écran pour tout suivre.
 *
 * Ce n'est pas une page de plus : c'est le point de départ. Elle répond dans
 * l'ordre à quatre questions, et rien d'autre :
 *   1. Qu'est-ce que je dois faire maintenant ?         (« À faire »)
 *   2. Quels bacs blancs arrivent, et sont-ils prêts ?  (tableau des épreuves)
 *   3. Où en est la machine ?                           (correction, e-mails, Discord)
 *   4. Qui a accès à quoi ?                             (profs)
 *
 * Chaque outil est décrit en une phrase en français : personne ne doit deviner
 * à quoi sert « E-mails » ou « Pilotage correction ».
 */
import { useState } from 'react';
import Link from 'next/link';
import type { ResumeDirection, Tache } from '@/lib/direction';

const TONS: Record<Tache['urgence'], { fond: string; texte: string; puce: string }> = {
  rouge: { fond: 'bg-red-50 border-red-200', texte: 'text-red-900', puce: '🔴' },
  orange: { fond: 'bg-amber-50 border-amber-200', texte: 'text-amber-900', puce: '🟠' },
  info: { fond: 'bg-slate-50 border-slate-200', texte: 'text-slate-700', puce: '⚪️' },
};

function dateCourte(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return {
    jour: d.toLocaleDateString('fr-FR', { day: 'numeric' }),
    mois: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    jourSemaine: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
  };
}

/** « lun 15 août, 10 h 50 » — l'heure d'un envoi, en français lisible. */
function instantCourt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour.replace(/\./g, '')} · ${heure.replace(':', ' h ')}`;
}

function compteARebours(jours: number) {
  if (jours < 0) return 'passé';
  if (jours === 0) return 'aujourd’hui';
  if (jours === 1) return 'demain';
  return `dans ${jours} j`;
}

/** Un grand chiffre avec son libellé. Le vocabulaire du tableau de bord. */
function Chiffre({
  valeur,
  label,
  ton = 'neutre',
  sous,
}: {
  valeur: string | number;
  label: string;
  ton?: 'neutre' | 'alerte' | 'ok';
  sous?: string;
}) {
  const couleur =
    ton === 'alerte' ? 'text-red-600' : ton === 'ok' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div>
      <p className={`text-2xl font-bold tabular-nums leading-none ${couleur}`}>{valeur}</p>
      <p className="text-xs text-slate-500 mt-1.5">{label}</p>
      {sous && <p className="text-[11px] text-slate-400 mt-0.5">{sous}</p>}
    </div>
  );
}

/** Carte d'un outil : ce qu'il fait, ses chiffres, le bouton pour l'ouvrir. */
function CarteOutil({
  emoji,
  titre,
  aQuoiCaSert,
  href,
  libelleLien,
  indisponible,
  children,
}: {
  emoji: string;
  titre: string;
  aQuoiCaSert: string;
  href: string;
  libelleLien: string;
  indisponible?: { raison: string; manquants: string[] };
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <span aria-hidden className="text-2xl leading-none">{emoji}</span>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900">{titre}</h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{aQuoiCaSert}</p>
        </div>
      </div>

      <div className="flex-1">
        {indisponible ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            <p className="font-semibold">Pas encore branché</p>
            <p className="mt-0.5">{indisponible.raison}</p>
            {indisponible.manquants.length > 0 && (
              <p className="mt-1 font-mono text-[11px]">{indisponible.manquants.join(' · ')}</p>
            )}
          </div>
        ) : (
          children
        )}
      </div>

      <Link
        href={href}
        className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700"
      >
        {libelleLien} →
      </Link>
    </section>
  );
}

export function CockpitDirection({ resume: initial }: { resume: ResumeDirection }) {
  const [resume, setResume] = useState(initial);
  const [chargement, setChargement] = useState(false);

  const actualiser = async () => {
    setChargement(true);
    try {
      const r = await fetch('/api/admin/direction/etat', { cache: 'no-store' });
      if (r.ok) setResume((await r.json()) as ResumeDirection);
    } finally {
      setChargement(false);
    }
  };

  const { bacs, correction, paiements, emails, profs, discord, taches } = resume;

  return (
    <div className="space-y-6">
      {/* --- En-tête sobre : c'est une console de pilotage, pas une pub. --- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Direction</p>
          <h1 className="text-2xl font-bold text-slate-900">Tout suivre d’un seul écran</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Les épreuves à préparer, la correction, les messages qui partent, les salles Discord et
            les accès des profs.
          </p>
        </div>
        <button
          onClick={actualiser}
          disabled={chargement}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {chargement ? 'Actualisation…' : '↻ Actualiser'}
        </button>
      </div>

      {/* --- Les quatre chiffres du jour --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Chiffre
            valeur={bacs.disponible ? bacs.a_venir : '—'}
            label="bacs blancs à venir"
            sous={bacs.disponible && bacs.sans_sujet > 0 ? `${bacs.sans_sujet} sans sujet` : undefined}
            ton={bacs.disponible && bacs.sans_sujet > 0 ? 'alerte' : 'neutre'}
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Chiffre
            valeur={correction.disponible ? correction.en_cours : '—'}
            label="copies en cours de correction"
            sous={
              correction.disponible && correction.en_erreur > 0
                ? `${correction.en_erreur} bloquée(s)`
                : correction.disponible
                  ? `${correction.corrigees_7j} corrigée${correction.corrigees_7j > 1 ? 's' : ''} sur 7 j`
                  : undefined
            }
            ton={correction.disponible && correction.en_erreur > 0 ? 'alerte' : 'neutre'}
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Chiffre
            valeur={emails.disponible ? emails.envoyes_7j : '—'}
            label="e-mails partis sur 7 jours"
            sous={
              emails.disponible && !emails.actif
                ? 'envoi à l’arrêt'
                : emails.disponible && emails.derniers_envois.length > 0
                  ? `dernier : ${instantCourt(emails.derniers_envois[0].quand)}`
                  : emails.disponible
                    ? `${emails.programmes} programmés`
                    : undefined
            }
            ton={emails.disponible && !emails.actif ? 'alerte' : 'neutre'}
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Chiffre
            valeur={profs.disponible ? profs.total : '—'}
            label="professeurs inscrits"
            sous={
              profs.disponible && profs.en_attente_validation > 0
                ? `${profs.en_attente_validation} à valider`
                : undefined
            }
            ton={profs.disponible && profs.en_attente_validation > 0 ? 'alerte' : 'neutre'}
          />
        </div>
      </div>

      {/* --- À faire maintenant --- */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-bold text-slate-900 mb-1">À faire maintenant</h2>
        <p className="text-xs text-slate-500 mb-4">
          Tout ce qui bloque quelque chose, du plus urgent au moins urgent.
        </p>
        {taches.length ? (
          <ul className="space-y-2">
            {taches.map((t) => {
              const ton = TONS[t.urgence];
              return (
                <li
                  key={t.cle}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-3.5 ${ton.fond}`}
                >
                  <span aria-hidden className="text-sm">{ton.puce}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${ton.texte}`}>{t.titre}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{t.detail}</p>
                  </div>
                  <Link
                    href={t.lien}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t.libelleLien} →
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            Rien ne bloque : sujets déposés, profs assignés, machine à corriger tranquille.
          </p>
        )}
      </section>

      {/* --- Les prochaines épreuves, ligne par ligne --- */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 pb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">Les prochains bacs blancs</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Une ligne par épreuve : qui vient, qui encadre, et si le sujet est prêt à s’ouvrir.
            </p>
          </div>
          <Link
            href="/admin/bacs-blancs"
            className="text-xs font-semibold text-slate-700 hover:underline whitespace-nowrap"
          >
            Tout ouvrir →
          </Link>
        </div>

        {!bacs.disponible ? (
          <p className="px-5 pb-5 text-sm text-amber-800">{bacs.raison}</p>
        ) : bacs.prochains.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-400">Aucune épreuve programmée pour l’instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Date</th>
                  <th className="text-left px-5 py-2.5 font-medium">Matière</th>
                  <th className="text-left px-5 py-2.5 font-medium">Élèves</th>
                  <th className="text-left px-5 py-2.5 font-medium">Profs</th>
                  <th className="text-left px-5 py-2.5 font-medium">Sujet</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {bacs.prochains.map((b) => {
                  const d = dateCourte(b.date_epreuve);
                  return (
                    <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <span className="font-semibold text-slate-900">
                          {d.jourSemaine} {d.jour} {d.mois}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {compteARebours(b.jours)}
                          {b.heure_debut ? ` · ${b.heure_debut}` : ''}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-800">{b.matiere}</td>
                      <td className="px-5 py-3 text-slate-600 tabular-nums">{b.nb_eleves}</td>
                      <td className="px-5 py-3">
                        {b.nb_profs > 0 ? (
                          <span className="text-slate-600 tabular-nums">{b.nb_profs}</span>
                        ) : (
                          <span className="text-red-600 font-semibold">aucun</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {!b.sujet_pret ? (
                          <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                            à déposer
                          </span>
                        ) : b.publie ? (
                          <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                            ouvert aux élèves
                          </span>
                        ) : b.publication_auto ? (
                          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                            s’ouvre tout seul
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                            déposé, non publié
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <Link
                          href="/admin/bacs-blancs"
                          className="text-xs font-semibold text-slate-700 hover:underline"
                        >
                          Préparer
                        </Link>
                        <span className="text-slate-300 mx-2">·</span>
                        <Link
                          href="/admin/discord"
                          className="text-xs font-semibold text-slate-700 hover:underline"
                        >
                          Salles
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Les cinq outils, expliqués --- */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <CarteOutil
          emoji="📅"
          titre="Bacs blancs & sujets"
          aQuoiCaSert="Organiser l’épreuve : assigner les profs, déposer le sujet en PDF, décider quand il s’ouvre dans l’espace élève, lire les retours des profs après coup."
          href="/admin/bacs-blancs"
          libelleLien="Ouvrir les bacs blancs"
          indisponible={bacs.disponible ? undefined : { raison: bacs.raison, manquants: bacs.manquants }}
        >
          {bacs.disponible && (
            <div className="grid grid-cols-3 gap-3">
              <Chiffre valeur={bacs.a_venir} label="à venir" />
              <Chiffre valeur={bacs.sans_sujet} label="sans sujet" ton={bacs.sans_sujet ? 'alerte' : 'ok'} />
              <Chiffre valeur={bacs.retours_manquants} label="retours attendus" />
            </div>
          )}
        </CarteOutil>

        <CarteOutil
          emoji="🎛️"
          titre="Correction des copies"
          aQuoiCaSert="La chaîne qui lit une copie scannée, la corrige au barème du sujet et fabrique le dossier de l’élève. Ici on voit ce qui tourne, ce qui coince et ce que ça coûte."
          href="/admin/correction"
          libelleLien="Ouvrir le pilotage"
          indisponible={
            correction.disponible ? undefined : { raison: correction.raison, manquants: correction.manquants }
          }
        >
          {correction.disponible && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Chiffre valeur={correction.en_cours} label="en cours" />
                <Chiffre valeur={correction.corrigees_7j} label="corrigées 7 j" />
                <Chiffre
                  valeur={correction.en_erreur}
                  label="bloquées"
                  ton={correction.en_erreur ? 'alerte' : 'ok'}
                />
              </div>
              <p className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-600 leading-relaxed">
                <strong>Le barème d’un sujet</strong> = les points question par question de CE
                sujet-là. Il se saisit une fois, juste avant de corriger ce bac blanc, et il est
                réutilisé si tu redonnes le même sujet. Rien à refaire tant que le sujet ne change
                pas.{' '}
                <Link href="/admin/bareme" className="underline font-semibold">
                  Ouvrir les barèmes
                </Link>
              </p>
            </>
          )}
        </CarteOutil>

        <CarteOutil
          emoji="💶"
          titre="Paiements"
          aQuoiCaSert="Qui a payé, qui n’a pas payé, depuis combien de temps. La comptabilité complète (encaissements, factures des profs, Urssaf) reste dans le classeur de suivi financier, qui s’ouvre d’un bouton."
          href="/admin/paiements"
          libelleLien="Ouvrir les paiements"
          indisponible={
            paiements.disponible ? undefined : { raison: paiements.raison, manquants: paiements.manquants }
          }
        >
          {paiements.disponible && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Chiffre valeur={paiements.payes} label="réglés" />
                <Chiffre
                  valeur={paiements.en_attente}
                  label="en attente"
                  ton={paiements.en_attente ? 'alerte' : 'ok'}
                />
                <Chiffre valeur={paiements.en_retard} label="+ d’une semaine" />
              </div>
              {!paiements.classeur && (
                <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                  Le classeur de suivi financier n’est pas encore relié : une variable à poser sur
                  Vercel et le bouton apparaît.
                </p>
              )}
            </>
          )}
        </CarteOutil>

        <CarteOutil
          emoji="📬"
          titre="E-mails automatiques"
          aQuoiCaSert="L’historique de tous les messages partis tout seuls — élèves, parents, profs : confirmation d’inscription, infos pratiques la veille, dossier de correction prêt. Les relances de paiement y figurent aussi, parce que ce sont des e-mails ; l’argent, lui, se suit dans l’onglet Paiements."
          href="/admin/emails"
          libelleLien="Ouvrir les e-mails"
          indisponible={emails.disponible ? undefined : { raison: emails.raison, manquants: emails.manquants }}
        >
          {emails.disponible && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Chiffre valeur={emails.programmes} label="programmés" />
                <Chiffre valeur={emails.envoyes_7j} label="partis 7 j" />
                <Chiffre
                  valeur={emails.en_erreur + emails.bloques}
                  label="en échec"
                  ton={emails.en_erreur + emails.bloques ? 'alerte' : 'ok'}
                />
              </div>
              {emails.validation_manuelle && (
                <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                  <strong>Tu valides chaque e-mail.</strong> Rien ne part tout seul : les messages
                  sont préparés, puis attendent ton bouton « Valider et envoyer » dans l’onglet
                  Messages.
                  {emails.en_attente > 0 && ` ${emails.en_attente} attendent ton feu vert.`}
                </p>
              )}

              {emails.derniers_envois.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Derniers messages partis
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {emails.derniers_envois.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs text-slate-800 truncate">
                            {e.libelle}
                            {e.test && <span className="text-slate-400"> · test</span>}
                          </span>
                          <span className="block text-[11px] text-slate-500 truncate">
                            → {e.destinataire}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[11px] text-slate-500 tabular-nums">
                            {instantCourt(e.quand)}
                          </span>
                          <span
                            className={`block text-[11px] ${e.delivre ? 'text-emerald-600' : 'text-slate-400'}`}
                          >
                            {e.delivre ? 'reçu' : 'parti'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 text-[11px] text-slate-400">
                  Aucun message n’est encore parti. Le journal se remplit tout seul dès le premier
                  envoi.
                </p>
              )}

              {emails.prochains_envois.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Prochains départs programmés
                  </p>
                  <ul className="mt-2 space-y-1">
                    {emails.prochains_envois.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-baseline justify-between gap-3 text-[11px] text-slate-500"
                      >
                        <span className="truncate">
                          {e.libelle} → {e.destinataire}
                        </span>
                        <span className="shrink-0 tabular-nums">{instantCourt(e.quand)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {emails.programmes} messages attendent leur heure — la liste complète est dans
                    l’onglet « Messages » de la page E-mails.
                  </p>
                </div>
              )}

              {!emails.actif && (
                <p className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-[11px] text-red-800">
                  L’envoi est à l’arrêt : la clé Brevo manque. Les messages sont préparés et rangés
                  dans la file, mais aucun ne part.
                </p>
              )}
            </>
          )}
        </CarteOutil>

        <CarteOutil
          emoji="🎙️"
          titre="Salles Discord"
          aQuoiCaSert="Une salle vocale privée par élève pendant l’épreuve, plus les salons d’informations et d’assistance. On les prépare avant, on les ferme après, on fait le ménage."
          href="/admin/discord"
          libelleLien="Gérer les salles"
          indisponible={
            discord.configure
              ? undefined
              : { raison: 'Le serveur Discord n’est pas encore relié à ce site.', manquants: discord.manquants }
          }
        >
          {discord.configure && (
            <p className="text-xs text-slate-500 leading-relaxed">
              Le serveur est relié. Ouvre la page pour préparer les salles d’un bac blanc,
              les verrouiller à la fin de l’épreuve ou supprimer une catégorie terminée.
            </p>
          )}
        </CarteOutil>

        <CarteOutil
          emoji="👥"
          titre="Profs & accès"
          aQuoiCaSert="Qui peut entrer, et ce qu’il voit. Valider une candidature, renseigner ses matières, lui définir un mot de passe, entrer dans son espace pour vérifier sa vue."
          href="/admin/profs"
          libelleLien="Ouvrir les accès"
          indisponible={profs.disponible ? undefined : { raison: profs.raison, manquants: profs.manquants }}
        >
          {profs.disponible && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Chiffre valeur={profs.total} label="inscrits" />
                <Chiffre
                  valeur={profs.en_attente_validation}
                  label="à valider"
                  ton={profs.en_attente_validation ? 'alerte' : 'ok'}
                />
                <Chiffre valeur={profs.sans_compte} label="sans identifiant" />
              </div>
              {profs.derniers.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {profs.derniers.slice(0, 3).map((p) => (
                    <li key={p.id} className="text-xs text-slate-500 truncate">
                      <span className="text-slate-800 font-medium">{p.nom}</span>
                      {' · '}
                      {p.matieres.join(', ') || 'aucune matière'}
                      {p.statut === 'en_attente' && (
                        <span className="ml-1.5 text-amber-700 font-semibold">à valider</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CarteOutil>

      </div>

      <p className="text-center text-[11px] text-slate-400">
        Chiffres arrêtés à {new Date(resume.genere_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
      </p>
    </div>
  );
}
