'use client';

/**
 * La console Paiements — trois questions, trois onglets.
 *
 *   👨‍🎓 Élèves      : qui doit encore régler sa matinée ;
 *   💸 Profs         : quel virement faire, à qui, et sur quel IBAN ;
 *   🔗 Parrainages   : quel élève est arrivé avec le lien de quel prof.
 *
 * L'argent des élèves ENTRE, celui des profs SORT : les mélanger dans un seul
 * tableau donnait un total qui ne voulait rien dire. Chaque onglet a son
 * bouton « copier pour le classeur », qui met le tableau au format d'un
 * collage direct dans Google Sheets (colonnes séparées par des tabulations).
 */
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { EtatPaiements } from '@/lib/paiements';
import type { EtatPaiementsProfs, ProfAPayer } from '@/lib/paiementsProfs';

const euros = (n: number) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

const jourCourt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');

type Onglet = 'eleves' | 'profs' | 'parrainages';

const LIBELLE_PAIEMENT: Record<string, string> = {
  paye: '✅ payé',
  en_attente: '⏳ en attente',
  offert: '🎁 offert',
  rembourse: '↩️ remboursé',
  annulee: '✖️ annulée',
};

/** Un tableau prêt à coller dans Google Sheets (une tabulation par colonne). */
function versTsv(entetes: string[], lignes: (string | number)[][]): string {
  const propre = (v: string | number) => String(v ?? '').replace(/[\t\n\r]+/g, ' ');
  return [entetes.join('\t'), ...lignes.map((l) => l.map(propre).join('\t'))].join('\n');
}

function BoutonCopier({
  entetes,
  lignes,
  libelle = 'Copier pour le classeur',
}: {
  entetes: string[];
  lignes: (string | number)[][];
  libelle?: string;
}) {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos');

  const copier = async () => {
    const tsv = versTsv(entetes, lignes);
    try {
      await navigator.clipboard.writeText(tsv);
      setEtat('copie');
    } catch {
      setEtat('echec');
    }
    setTimeout(() => setEtat('repos'), 2500);
  };

  const telecharger = () => {
    // Le point-virgule et le BOM : c'est ce qu'attend un tableur français,
    // sinon tout atterrit dans la colonne A.
    const csv =
      '﻿' +
      [entetes, ...lignes]
        .map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
        .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `paiements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={copier}
        disabled={lignes.length === 0}
        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        {etat === 'copie' ? '✅ Copié — colle dans le Sheet' : etat === 'echec' ? '⚠️ Copie refusée' : `📋 ${libelle}`}
      </button>
      <button
        onClick={telecharger}
        disabled={lignes.length === 0}
        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        ⬇️ CSV
      </button>
    </div>
  );
}

export function ConsolePaiements({
  eleves,
  profs,
}: {
  eleves: EtatPaiements;
  profs: EtatPaiementsProfs;
}) {
  const [onglet, setOnglet] = useState<Onglet>('eleves');
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  const appeler = (corps: Record<string, unknown>) => {
    setErreur(null);
    demarrer(async () => {
      try {
        const res = await fetch('/api/admin/paiements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corps),
        });
        const data = await res.json();
        if (!res.ok) setErreur(data.error ?? 'Action impossible');
        else router.refresh();
      } catch {
        setErreur('Connexion impossible');
      }
    });
  };

  const ONGLETS: { cle: Onglet; label: string; compteur?: number }[] = [
    { cle: 'eleves', label: '👨‍🎓 Élèves', compteur: eleves.en_attente },
    { cle: 'profs', label: '💸 Virements aux profs', compteur: profs.profs.filter((p) => p.a_virer > 0).length },
    { cle: 'parrainages', label: '🔗 Parrainages', compteur: profs.parrainages.length },
  ];

  return (
    <>
      {/* --- Les chiffres, argent qui entre / argent qui sort --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Carte valeur={euros(eleves.encaisse)} label="encaissé auprès des familles" />
        <Carte
          valeur={euros(eleves.attendu)}
          label={`à encaisser (${eleves.en_attente} en attente)`}
          alerte={eleves.en_attente > 0}
        />
        <Carte valeur={euros(profs.total_a_virer)} label="à virer aux profs" accent />
        <Carte
          valeur={euros(profs.total_affiliation_due)}
          label={`dont affiliation (${euros(profs.montant_affiliation)} / élève)`}
        />
      </div>

      {erreur && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">{erreur}</div>
      )}

      {!profs.virements_prets && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          <p className="font-bold">Les IBAN ne sont pas encore stockables.</p>
          <p className="mt-1">
            Joue le script <span className="font-mono text-xs">supabase/sql/47_affiliation.sql</span> dans
            le SQL Editor du projet CRM : il ajoute les colonnes IBAN et l’unicité qui empêche de payer
            deux fois la même affiliation.
          </p>
        </div>
      )}

      {/* --- Les onglets --- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1 border-b border-slate-200 px-3 overflow-x-auto">
          {ONGLETS.map((o) => (
            <button
              key={o.cle}
              onClick={() => setOnglet(o.cle)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                onglet === o.cle
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {o.label}
              {o.compteur ? (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-600">
                  {o.compteur}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className={enCours ? 'opacity-60 pointer-events-none' : ''}>
          {onglet === 'eleves' && <OngletEleves etat={eleves} />}
          {onglet === 'profs' && <OngletProfs etat={profs} appeler={appeler} />}
          {onglet === 'parrainages' && <OngletParrainages etat={profs} appeler={appeler} />}
        </div>
      </div>
    </>
  );
}

function Carte({
  valeur,
  label,
  alerte,
  accent,
}: {
  valeur: string;
  label: string;
  alerte?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
      }`}
    >
      <p
        className={`text-2xl font-bold tabular-nums leading-none ${
          accent ? 'text-white' : alerte ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {valeur}
      </p>
      <p className={`text-xs mt-1.5 ${accent ? 'text-slate-300' : 'text-slate-500'}`}>{label}</p>
    </div>
  );
}

// ------------------------------------------------------------- ÉLÈVES ---

function OngletEleves({ etat }: { etat: EtatPaiements }) {
  return (
    <section>
      <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">En attente de paiement</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Les relances partent toutes seules par e-mail. La colonne « relances » dit combien sont
            déjà parties — l’historique complet est dans{' '}
            <Link href="/admin/emails" className="underline">
              E-mails
            </Link>
            .
          </p>
        </div>
        <BoutonCopier
          entetes={['Élève', 'E-mail', 'Matière', 'Date', 'Inscrit le', 'Jours', 'Montant', 'Relances']}
          lignes={etat.lignes.map((l) => [
            l.nom,
            l.email ?? '',
            l.matiere ?? '',
            jourCourt(l.date_epreuve),
            jourCourt(l.inscrit_le),
            l.jours_depuis,
            l.montant ?? etat.montant_defaut,
            l.relances,
          ])}
        />
      </div>

      {etat.lignes.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-slate-400">Personne en attente : tout le monde a réglé.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium">Élève</th>
                <th className="text-left px-5 py-2.5 font-medium">Matinée</th>
                <th className="text-left px-5 py-2.5 font-medium">Inscrit le</th>
                <th className="text-left px-5 py-2.5 font-medium">Depuis</th>
                <th className="text-left px-5 py-2.5 font-medium">Montant</th>
                <th className="text-left px-5 py-2.5 font-medium">Relances</th>
              </tr>
            </thead>
            <tbody>
              {etat.lignes.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{l.nom}</p>
                    <p className="text-xs text-slate-500">{l.email ?? '—'}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {l.matiere ?? '—'}
                    {l.date_epreuve && (
                      <span className="block text-xs text-slate-400">{jourCourt(l.date_epreuve)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{jourCourt(l.inscrit_le)}</td>
                  <td
                    className={`px-5 py-3 tabular-nums ${
                      l.jours_depuis > 7 ? 'text-red-600 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    {l.jours_depuis} j
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {l.montant ? euros(l.montant) : <span className="text-slate-400">non saisi</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-600 tabular-nums">{l.relances}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// -------------------------------------------------------------- PROFS ---

function OngletProfs({
  etat,
  appeler,
}: {
  etat: EtatPaiementsProfs;
  appeler: (corps: Record<string, unknown>) => void;
}) {
  const aVirer = etat.profs.filter((p) => p.a_virer > 0);

  return (
    <section>
      <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">Ce qu’on doit aux professeurs</h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Deux sources : le <strong>coaching</strong> d’un bac blanc et l’<strong>affiliation</strong> (
            {euros(etat.montant_affiliation)} par élève amené, dus le jour où cet élève paie). Coche
            « viré » une fois le virement parti : la ligne bascule dans « déjà versé ».
          </p>
        </div>
        <BoutonCopier
          libelle="Copier les virements"
          entetes={['Professeur', 'E-mail', 'IBAN', 'Titulaire', 'À virer', 'Dont coaching', 'Dont affiliation']}
          lignes={aVirer.map((p) => [
            p.nom_complet,
            p.email,
            p.iban ?? '',
            p.titulaire_compte ?? '',
            p.a_virer,
            p.coaching_du,
            p.affiliation_due,
          ])}
        />
      </div>

      {etat.profs.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-slate-400">
          Aucun professeur n’a encore de somme en jeu : ni coaching, ni élève parrainé.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {etat.profs.map((p) => (
            <FicheProf key={p.id} prof={p} appeler={appeler} />
          ))}
        </div>
      )}
    </section>
  );
}

function FicheProf({
  prof,
  appeler,
}: {
  prof: ProfAPayer;
  appeler: (corps: Record<string, unknown>) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [iban, setIban] = useState(prof.iban ?? '');
  const [titulaire, setTitulaire] = useState(prof.titulaire_compte ?? '');
  const dues = prof.lignes.filter((l) => l.statut === 'a_payer');
  const versees = prof.lignes.filter((l) => l.statut === 'paye');

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{prof.nom_complet}</p>
          <p className="text-xs text-slate-500">
            {prof.email} · code <span className="font-mono">{prof.code_affiliation}</span> ·{' '}
            {prof.eleves_parraines} élève{prof.eleves_parraines > 1 ? 's' : ''} parrainé
            {prof.eleves_parraines > 1 ? 's' : ''} payé{prof.eleves_parraines > 1 ? 's' : ''}
            {prof.eleves_en_attente > 0 && ` · ${prof.eleves_en_attente} en attente de paiement`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p
              className={`text-xl font-bold tabular-nums leading-none ${
                prof.a_virer > 0 ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {euros(prof.a_virer)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              à virer{prof.deja_verse > 0 && ` · ${euros(prof.deja_verse)} déjà versés`}
            </p>
          </div>
          <button
            onClick={() => setOuvert((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {ouvert ? 'Replier' : 'Détail'}
          </button>
        </div>
      </div>

      {ouvert && (
        <div className="mt-4 space-y-4">
          {/* Où virer */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">Coordonnées de virement</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                placeholder="IBAN (FR76…)"
                className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-mono"
              />
              <input
                value={titulaire}
                onChange={(e) => setTitulaire(e.target.value)}
                placeholder="Titulaire du compte"
                className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
              />
              <button
                onClick={() =>
                  appeler({
                    action: 'virement',
                    professeur_id: prof.id,
                    iban,
                    titulaire_compte: titulaire,
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Enregistrer
              </button>
            </div>
          </div>

          {/* Coaching prévu, pas encore dû */}
          {prof.coaching_prevu.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">
                Coaching prévu — pas encore dans le dû
              </p>
              <ul className="space-y-1.5">
                {prof.coaching_prevu.map((c) => (
                  <li key={`${c.session_id}-${c.professeur_id}`} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-600">
                      {c.session}
                      {!c.passee && <span className="ml-2 text-xs text-slate-400">(épreuve à venir)</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-slate-700">{euros(c.montant)}</span>
                      <button
                        onClick={() =>
                          appeler({
                            action: 'coaching_du',
                            session_id: c.session_id,
                            professeur_id: c.professeur_id,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        Ajouter au dû
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Le détail du dû */}
          <LignesRevenus titre="À virer" lignes={dues} appeler={appeler} cible="paye" />
          {versees.length > 0 && (
            <LignesRevenus titre="Déjà versé" lignes={versees} appeler={appeler} cible="a_payer" />
          )}
        </div>
      )}
    </div>
  );
}

function LignesRevenus({
  titre,
  lignes,
  appeler,
  cible,
}: {
  titre: string;
  lignes: ProfAPayer['lignes'];
  appeler: (corps: Record<string, unknown>) => void;
  cible: 'paye' | 'a_payer';
}) {
  if (!lignes.length) {
    return <p className="text-sm text-slate-400">Rien à virer pour l’instant.</p>;
  }
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <p className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50">{titre}</p>
      <ul className="divide-y divide-slate-100">
        {lignes.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="text-slate-800">{l.libelle ?? l.type}</span>
              <span className="block text-xs text-slate-400">
                {l.type === 'affiliation' ? 'Affiliation' : 'Coaching'}
                {l.session ? ` · ${l.session}` : ''} · {jourCourt(l.cree_le)}
              </span>
            </span>
            <span className="flex items-center gap-3 whitespace-nowrap">
              <span className="tabular-nums text-slate-800">{euros(l.montant)}</span>
              <button
                onClick={() => appeler({ action: 'revenu_statut', revenu_id: l.id, statut: cible })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                  cible === 'paye'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {cible === 'paye' ? '✅ Viré' : 'Remettre à virer'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -------------------------------------------------------- PARRAINAGES ---

const ETAT_PRIME: Record<string, { texte: string; classe: string }> = {
  a_payer: { texte: 'à virer au prof', classe: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  paye: { texte: 'déjà viré', classe: 'bg-slate-100 text-slate-600 border-slate-200' },
  en_attente_eleve: {
    texte: 'en attente du paiement de l’élève',
    classe: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  code_inconnu: { texte: 'code inconnu', classe: 'bg-red-50 text-red-800 border-red-200' },
};

function OngletParrainages({
  etat,
  appeler,
}: {
  etat: EtatPaiementsProfs;
  appeler: (corps: Record<string, unknown>) => void;
}) {
  return (
    <section>
      <div className="p-5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">Élèves arrivés par le lien d’un prof</h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Chaque prof a un lien personnel (<span className="font-mono">…/inscription?ref=SONCODE</span>),
            visible dans son espace. L’élève peut aussi taper le code à la main dans le formulaire. Les{' '}
            {euros(etat.montant_affiliation)} ne deviennent dus qu’une fois l’élève payé.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => appeler({ action: 'rattraper' })}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Recrée les lignes d’affiliation manquantes pour les élèves déjà payés"
          >
            🔁 Rattraper les manquants
          </button>
          <BoutonCopier
            libelle="Copier les parrainages"
            entetes={['Élève', 'E-mail', 'Matière', 'Date', 'Code', 'Prof', 'Paiement élève', 'Prime']}
            lignes={etat.parrainages.map((p) => [
              p.eleve,
              p.email ?? '',
              p.matiere ?? '',
              jourCourt(p.date_epreuve),
              p.code,
              p.prof ?? '(code inconnu)',
              LIBELLE_PAIEMENT[p.paiement_eleve] ?? p.paiement_eleve,
              ETAT_PRIME[p.etat_prime]?.texte ?? p.etat_prime,
            ])}
          />
        </div>
      </div>

      {etat.parrainages.length === 0 ? (
        <div className="px-5 pb-6 text-sm text-slate-500">
          <p className="text-slate-400">Aucun élève n’est encore arrivé par un lien de prof.</p>
          <p className="mt-2">
            Le lien de chaque prof se trouve dans son espace (« Mon lien d’affiliation ») et dans{' '}
            <Link href="/admin/profs" className="underline">
              Profs &amp; accès
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium">Élève</th>
                <th className="text-left px-5 py-2.5 font-medium">Matinée</th>
                <th className="text-left px-5 py-2.5 font-medium">Amené par</th>
                <th className="text-left px-5 py-2.5 font-medium">Paiement de l’élève</th>
                <th className="text-left px-5 py-2.5 font-medium">
                  Prime ({euros(etat.montant_affiliation)})
                </th>
              </tr>
            </thead>
            <tbody>
              {etat.parrainages.map((p) => {
                const badge = ETAT_PRIME[p.etat_prime];
                return (
                  <tr key={p.inscription_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{p.eleve}</p>
                      <p className="text-xs text-slate-500">{p.email ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.matiere ?? '—'}
                      <span className="block text-xs text-slate-400">{jourCourt(p.date_epreuve)}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {p.prof ?? <span className="text-red-600">code inconnu</span>}
                      <span className="block text-xs font-mono text-slate-400">{p.code}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {LIBELLE_PAIEMENT[p.paiement_eleve] ?? p.paiement_eleve}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.classe}`}>
                        {badge.texte}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
