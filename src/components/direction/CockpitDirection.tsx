'use client';

/**
 * Vue Direction — un tableau de pilotage, pas un mode d'emploi.
 *
 * Elle ne remplace aucun onglet : E-mails, Paiements, Discord, Correction,
 * Bacs blancs et Profs restent les endroits où l'on COMPREND. Ici, on décide.
 * Trois questions, dans cet ordre :
 *
 *   1. Qu'est-ce qui bloque aujourd'hui ?        → « À faire maintenant »
 *   2. Quels bacs blancs sont prêts ?            → « Vrais bacs blancs »
 *   3. Qu'est-ce qu'il reste à tester ?          → « Sessions de test »
 *
 * Règle de tri de l'information, appliquée partout dans ce fichier :
 *   • ça explique le fonctionnement  → bloc « Comprendre », replié par défaut ;
 *   • ça aide à décider maintenant   → visible, en libellé court ;
 *   • ça rassure sans rien déclencher → réduit à un chiffre, ou masqué.
 *
 * Et la séparation essais / vraies sessions n'est pas cosmétique : un essai
 * daté avant novembre 2026 n'aura pas lieu. Le mélanger aux vraies échéances
 * ferait passer pour urgent un bac blanc qui n'existe pas.
 */
import { useState } from 'react';
import Link from 'next/link';
import type { CaseEtat, LigneBac, ResumeDirection, Tache } from '@/lib/direction';

const TONS: Record<Tache['urgence'], { fond: string; texte: string; puce: string }> = {
  rouge: { fond: 'bg-red-50 border-red-200', texte: 'text-red-900', puce: '🔴' },
  orange: { fond: 'bg-amber-50 border-amber-200', texte: 'text-amber-900', puce: '🟠' },
  info: { fond: 'bg-slate-50 border-slate-200', texte: 'text-slate-700', puce: '⚪️' },
};

/** Les quatre couleurs d'une case de la grille. Une seule échelle, partout. */
const COULEUR_CASE: Record<CaseEtat['etat'], string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  attention: 'bg-amber-50 text-amber-900 border-amber-200',
  bloque: 'bg-red-50 text-red-800 border-red-200',
  neutre: 'bg-slate-50 text-slate-500 border-slate-200',
};

function dateCourte(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return {
    jour: d.toLocaleDateString('fr-FR', { day: 'numeric' }),
    mois: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    jourSemaine: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
  };
}

/** « lun 15 août · 10 h 50 » — l'heure d'un envoi, en français lisible. */
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

const euros = (n: number) => `${n.toLocaleString('fr-FR')} €`;

// --- Briques ----------------------------------------------------------

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
      <p className="text-xs text-slate-500 mt-1.5 leading-snug">{label}</p>
      {sous && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sous}</p>}
    </div>
  );
}

/** Une case de la grille : un état, un mot, une couleur. */
function Pastille({ c }: { c: CaseEtat }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${COULEUR_CASE[c.etat]}`}
    >
      {c.libelle}
    </span>
  );
}

/**
 * Le bloc « comprendre » : tout ce qui explique le fonctionnement vit ici,
 * replié. C'est le seul endroit de cette page où l'on a le droit d'être long.
 */
function Comprendre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[11px] font-semibold text-slate-400 hover:text-slate-700 select-none">
        <span className="group-open:hidden">▸ {titre}</span>
        <span className="hidden group-open:inline">▾ {titre}</span>
      </summary>
      <div className="mt-2 text-[11px] text-slate-500 leading-relaxed space-y-2">{children}</div>
    </details>
  );
}

/**
 * Une carte de « Santé des opérations » : deux ou trois chiffres, un bouton.
 * Jamais de paragraphe — ce qui doit être expliqué l'est dans l'onglet.
 */
function CarteSante({
  emoji,
  titre,
  href,
  indisponible,
  alerte,
  children,
}: {
  emoji: string;
  titre: string;
  href: string;
  indisponible?: { raison: string; manquants: string[] };
  /** Une ligne d'alerte courte, quand quelque chose cloche vraiment. */
  alerte?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-slate-900 text-sm">
          <span aria-hidden className="mr-1.5">{emoji}</span>
          {titre}
        </h3>
        <Link href={href} className="text-xs font-semibold text-slate-500 hover:text-slate-900 whitespace-nowrap">
          ouvrir →
        </Link>
      </div>

      <div className="flex-1">
        {indisponible ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
            <p className="font-semibold">Pas encore branché</p>
            <p className="mt-0.5">{indisponible.raison}</p>
            {indisponible.manquants.length > 0 && (
              <p className="mt-1 font-mono">{indisponible.manquants.join(' · ')}</p>
            )}
          </div>
        ) : (
          children
        )}
      </div>

      {!indisponible && alerte && (
        <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-800">
          {alerte}
        </p>
      )}
    </section>
  );
}

/**
 * La grille de préparation. Une ligne par bac blanc, une colonne par pièce à
 * poser. On lit de gauche à droite jusqu'à la première case rouge : c'est là
 * qu'est le travail, et le bouton de droite y mène.
 */
function GrilleBacs({
  lignes,
  vide,
}: {
  lignes: LigneBac[];
  vide: string;
}) {
  if (!lignes.length) {
    return (
      <p className="px-5 pb-5 text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl mx-5 mb-5 p-5 text-center">
        {vide}
      </p>
    );
  }

  const COLONNES: { cle: keyof LigneBac; titre: string }[] = [
    { cle: 'sujet', titre: 'Sujet' },
    { cle: 'prof', titre: 'Prof' },
    { cle: 'discord', titre: 'Discord' },
    { cle: 'emails', titre: 'E-mails' },
    { cle: 'paiement', titre: 'Paiement' },
    { cle: 'correction', titre: 'Correction' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[1000px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Date</th>
            <th className="text-left px-4 py-2.5 font-medium">Matière</th>
            <th className="text-left px-3 py-2.5 font-medium">Élèves</th>
            {COLONNES.map((c) => (
              <th key={c.titre} className="text-left px-3 py-2.5 font-medium">
                {c.titre}
              </th>
            ))}
            <th className="text-left px-3 py-2.5 font-medium">Statut</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            const d = dateCourte(l.date_epreuve);
            return (
              <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50 align-middle">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="font-semibold text-slate-900">
                    {d.jourSemaine} {d.jour} {d.mois}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {l.test ? 'essai' : compteARebours(l.jours)}
                    {l.heure_debut ? ` · ${l.heure_debut}` : ''}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{l.matiere}</td>
                <td className="px-3 py-2.5 text-slate-600 tabular-nums">{l.nb_eleves}</td>
                {COLONNES.map((c) => (
                  <td key={c.titre} className="px-3 py-2.5">
                    <Pastille c={l[c.cle] as CaseEtat} />
                  </td>
                ))}
                <td className="px-3 py-2.5">
                  <Pastille c={{ etat: l.global.etat, libelle: l.global.libelle }} />
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Link
                    href={l.action.href}
                    className="text-xs font-semibold text-slate-700 hover:underline"
                  >
                    {l.action.label} →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- L'écran ----------------------------------------------------------

export function CockpitDirection({ resume: initial }: { resume: ResumeDirection }) {
  const [resume, setResume] = useState(initial);
  const [chargement, setChargement] = useState(false);
  const [toutAfficher, setToutAfficher] = useState(false);

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

  const rouges = taches.filter((t) => t.urgence === 'rouge');
  const oranges = taches.filter((t) => t.urgence === 'orange');
  const infos = taches.filter((t) => t.urgence === 'info');
  const visibles = toutAfficher ? taches : [...rouges, ...oranges];

  return (
    <div className="space-y-6">
      {/* --- En-tête : ce que cet écran promet, en une ligne. --- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Direction</p>
          <h1 className="text-2xl font-bold text-slate-900">Qu’est-ce qui bloque aujourd’hui ?</h1>
        </div>
        <button
          onClick={actualiser}
          disabled={chargement}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {chargement ? 'Actualisation…' : '↻ Actualiser'}
        </button>
      </div>

      {/* --- Les quatre chiffres du jour. Rien de plus. --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Chiffre
            valeur={bacs.disponible ? bacs.a_venir : '—'}
            label="vrais bacs blancs à venir"
            sous={
              bacs.disponible
                ? bacs.a_venir === 0
                  ? `les vrais commencent en ${bacs.premiere_vraie_session}`
                  : `${bacs.tests_a_venir} essais en parallèle`
                : undefined
            }
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Chiffre
            valeur={rouges.length}
            label="blocages rouges"
            ton={rouges.length ? 'alerte' : 'ok'}
            sous={rouges.length ? rouges[0].titre : 'rien ne bloque'}
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Chiffre
            valeur={taches.length}
            label="actions à faire"
            sous={`${oranges.length} à surveiller · ${infos.length} pour info`}
          />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Chiffre
            valeur={emails.disponible ? emails.envoyes_7j : '—'}
            label="e-mails partis sur 7 jours"
            ton={emails.disponible && !emails.actif ? 'alerte' : 'neutre'}
            sous={
              emails.disponible && !emails.actif
                ? 'envoi à l’arrêt'
                : emails.disponible && emails.derniers_envois.length > 0
                  ? `dernier : ${instantCourt(emails.derniers_envois[0].quand)}`
                  : emails.disponible
                    ? 'aucun départ pour l’instant'
                    : undefined
            }
          />
        </div>
      </div>

      {/* --- A. À faire maintenant --- */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-slate-900">À faire maintenant</h2>
          {infos.length > 0 && (
            <button
              onClick={() => setToutAfficher((v) => !v)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              {toutAfficher ? 'Masquer' : `Voir aussi ${infos.length} points pour info`}
            </button>
          )}
        </div>

        {visibles.length ? (
          <ul className="space-y-2">
            {visibles.map((t) => {
              const ton = TONS[t.urgence];
              return (
                <li
                  key={t.cle}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-3 ${ton.fond}`}
                >
                  <span aria-hidden className="text-sm leading-none pt-0.5">{ton.puce}</span>
                  <div className="flex-1 min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        {t.domaine}
                      </span>
                      {t.contexte === 'test' && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 border border-slate-300 rounded px-1">
                          essai
                        </span>
                      )}
                    </p>
                    <p className={`text-sm font-semibold ${ton.texte}`}>{t.titre}</p>
                    <p className="text-xs text-slate-600">Impact : {t.impact}</p>
                    {t.detail && <p className="text-[11px] text-slate-400 truncate">{t.detail}</p>}
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
            Rien ne bloque.
          </p>
        )}
      </section>

      {/* --- B. Sessions de test --- */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">
              🧪 Sessions de test
              {bacs.disponible && bacs.tests.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {bacs.tests.length} session{bacs.tests.length > 1 ? 's' : ''}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Vérifier la chaîne, pas tenir une échéance.
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
        ) : (
          <>
            <GrilleBacs
              lignes={bacs.tests}
              vide="Aucune session d’essai en base."
            />
            <div className="px-5 py-3 border-t border-slate-100">
              <Comprendre titre="Pourquoi ces sessions sont à part">
                <p>
                  Les vrais bacs blancs ne commencent qu’en{' '}
                  <strong>{bacs.premiere_vraie_session}</strong>. Tout ce qui est daté avant a été
                  créé pour faire tourner la chaîne de bout en bout : sujet, inscription, e-mails,
                  Discord, correction, paiement, dépôt de copie. Une session d’essai n’a pas
                  d’échéance — la seule question qui vaut ici est « est-ce que ça marche ? ».
                </p>
                <p>
                  À purger avant la mise en service, pour ne pas abîmer la réputation d’expéditeur
                  chez Brevo.
                </p>
              </Comprendre>
            </div>
          </>
        )}
      </section>

      {/* --- C. Vrais bacs blancs --- */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">
              🎓 Vrais bacs blancs
              {bacs.disponible && bacs.a_venir > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {bacs.a_venir} à venir
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Les sessions vendues, et ce qui leur manque.</p>
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
        ) : (
          <GrilleBacs
            lignes={bacs.vrais}
            vide={`Aucune vraie session pour l’instant — les premières sont prévues en ${bacs.premiere_vraie_session}.`}
          />
        )}
      </section>

      {/* --- D. Santé des opérations : des chiffres, un bouton, rien d'autre. --- */}
      <section>
        <h2 className="font-bold text-slate-900 mb-3">Santé des opérations</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <CarteSante
            emoji="📬"
            titre="E-mails"
            href="/admin/emails"
            indisponible={emails.disponible ? undefined : { raison: emails.raison, manquants: emails.manquants }}
            alerte={
              emails.disponible && !emails.actif
                ? 'Envoi à l’arrêt : clé Brevo manquante.'
                : emails.disponible && emails.reglages_bloquants.length > 0
                  ? `Réglage vide : ${emails.reglages_bloquants.join(', ')}.`
                  : undefined
            }
          >
            {emails.disponible && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Chiffre
                    valeur={emails.en_attente}
                    label={emails.validation_manuelle ? 'attendent mon feu vert' : 'en attente'}
                    ton={emails.en_attente ? 'alerte' : 'ok'}
                  />
                  <Chiffre valeur={emails.programmes} label="programmés" />
                  <Chiffre
                    valeur={emails.en_erreur + emails.bloques}
                    label="en échec"
                    ton={emails.en_erreur + emails.bloques ? 'alerte' : 'ok'}
                  />
                </div>
                <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
                  <li>
                    Validation manuelle :{' '}
                    <strong className={emails.validation_manuelle ? 'text-emerald-700' : 'text-amber-700'}>
                      {emails.validation_manuelle ? 'active' : 'désactivée'}
                    </strong>
                  </li>
                  {emails.inscriptions_sans_date > 0 && (
                    <li>{emails.inscriptions_sans_date} inscriptions sans date</li>
                  )}
                  {emails.adresses_test > 0 && <li>{emails.adresses_test} adresses fictives</li>}
                </ul>
              </>
            )}
          </CarteSante>

          <CarteSante
            emoji="💶"
            titre="Paiements"
            href="/admin/paiements"
            indisponible={
              paiements.disponible ? undefined : { raison: paiements.raison, manquants: paiements.manquants }
            }
            alerte={
              paiements.disponible && !paiements.instructions_pretes && paiements.en_attente > 0
                ? 'Relances bloquées : aucune instruction de paiement.'
                : undefined
            }
          >
            {paiements.disponible && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Chiffre
                    valeur={paiements.en_attente}
                    label="en attente"
                    ton={paiements.en_attente ? 'alerte' : 'ok'}
                  />
                  <Chiffre valeur={euros(paiements.attendu)} label="à encaisser" />
                  <Chiffre valeur={paiements.en_retard} label="+ d’une semaine" />
                </div>
                {!paiements.classeur && (
                  <p className="mt-3 text-[11px] text-slate-400">Classeur financier non relié.</p>
                )}
              </>
            )}
          </CarteSante>

          <CarteSante
            emoji="🎙️"
            titre="Discord"
            href="/admin/discord"
            indisponible={
              discord.configure
                ? undefined
                : { raison: 'Le serveur Discord n’est pas encore relié.', manquants: discord.manquants }
            }
            alerte={discord.erreur ?? undefined}
          >
            {discord.configure && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Chiffre
                    valeur={discord.salles_a_creer}
                    label="sessions sans salles"
                    ton={discord.salles_a_creer ? 'alerte' : 'ok'}
                  />
                  <Chiffre
                    valeur={discord.liens_manquants}
                    label="sans liens déposés"
                    ton={discord.liens_manquants ? 'alerte' : 'ok'}
                  />
                  <Chiffre valeur={discord.comptes_non_relies} label="comptes élève à relier" />
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  Serveur :{' '}
                  <strong className="text-emerald-700">{discord.serveur ?? 'relié'}</strong>
                  {discord.categories_orphelines > 0 && (
                    <> · {discord.categories_orphelines} catégories à nettoyer</>
                  )}
                </p>
              </>
            )}
          </CarteSante>

          <CarteSante
            emoji="👥"
            titre="Profs"
            href="/admin/profs"
            indisponible={profs.disponible ? undefined : { raison: profs.raison, manquants: profs.manquants }}
          >
            {profs.disponible && (
              <div className="grid grid-cols-3 gap-3">
                <Chiffre
                  valeur={profs.en_attente_validation}
                  label="à valider"
                  ton={profs.en_attente_validation ? 'alerte' : 'ok'}
                />
                <Chiffre
                  valeur={bacs.disponible ? bacs.sans_prof : '—'}
                  label="bacs sans prof"
                  ton={bacs.disponible && bacs.sans_prof ? 'alerte' : 'ok'}
                />
                <Chiffre valeur={profs.sans_compte} label="sans identifiant" />
              </div>
            )}
          </CarteSante>

          <CarteSante
            emoji="🎛️"
            titre="Correction"
            href="/admin/correction"
            indisponible={
              correction.disponible ? undefined : { raison: correction.raison, manquants: correction.manquants }
            }
          >
            {correction.disponible && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Chiffre
                    valeur={correction.en_erreur}
                    label="copies bloquées"
                    ton={correction.en_erreur ? 'alerte' : 'ok'}
                  />
                  <Chiffre
                    valeur={correction.jamais_testees}
                    label="matières jamais testées"
                    ton={correction.jamais_testees ? 'alerte' : 'ok'}
                  />
                  <Chiffre valeur={correction.en_cours} label="en cours" />
                </div>
                {correction.matieres.length > 0 && (
                  <ul className="mt-3 space-y-0.5 text-[11px]">
                    {correction.matieres.slice(0, 8).map((m) => (
                      <li key={m.matiere} className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-700 whitespace-nowrap">{m.label}</span>
                        <span
                          className={`truncate text-right ${
                            m.etat === 'bloque'
                              ? 'text-red-700 font-semibold'
                              : m.etat === 'attention'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {m.resume}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CarteSante>

          <CarteSante
            emoji="📅"
            titre="Bacs blancs & sujets"
            href="/admin/bacs-blancs"
            indisponible={bacs.disponible ? undefined : { raison: bacs.raison, manquants: bacs.manquants }}
          >
            {bacs.disponible && (
              <div className="grid grid-cols-3 gap-3">
                <Chiffre valeur={bacs.a_venir} label="vrais à venir" />
                <Chiffre
                  valeur={bacs.sans_sujet}
                  label="sans sujet"
                  ton={bacs.sans_sujet ? 'alerte' : 'ok'}
                />
                <Chiffre valeur={bacs.retours_manquants} label="retours attendus" />
              </div>
            )}
          </CarteSante>
        </div>
      </section>

      {/* --- Le mode d'emploi, replié : il ne sert pas à décider. --- */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <Comprendre titre="À quoi sert chaque onglet">
          <p>
            <strong>Bacs blancs & sujets</strong> — organiser l’épreuve : assigner les profs,
            déposer le sujet en PDF, décider quand il s’ouvre dans l’espace élève, lire les retours
            des profs après coup.
          </p>
          <p>
            <strong>Correction</strong> — la chaîne qui lit une copie scannée, la corrige au barème
            et fabrique le dossier de l’élève. Le barème d’un sujet se saisit une fois, juste avant
            de corriger ce sujet-là, et se réutilise si le sujet revient.{' '}
            <Link href="/admin/bareme" className="underline font-semibold">
              Ouvrir les barèmes
            </Link>
          </p>
          <p>
            <strong>Paiements</strong> — qui a payé, qui n’a pas payé, depuis combien de temps. La
            comptabilité complète reste dans le classeur de suivi financier.
          </p>
          <p>
            <strong>E-mails</strong> — l’historique de tous les messages partis, élèves, parents et
            profs. Les relances de paiement y figurent aussi : ce sont des e-mails ; l’argent, lui,
            se suit dans Paiements.
          </p>
          <p>
            <strong>Discord</strong> — une salle vocale privée par élève pendant l’épreuve, plus les
            salons d’informations et d’assistance. On les prépare avant, on les ferme après.
          </p>
          <p>
            <strong>Profs & accès</strong> — qui peut entrer, et ce qu’il voit. Valider une
            candidature, renseigner ses matières, lui définir un mot de passe, entrer dans son
            espace pour vérifier sa vue.
          </p>
        </Comprendre>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Chiffres arrêtés à{' '}
        {new Date(resume.genere_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
      </p>
    </div>
  );
}
