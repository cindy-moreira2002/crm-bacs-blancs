import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavDirection } from '@/components/direction/NavDirection';
import { gardeAdminPage } from '@/lib/gardeAcces';
import { chargerPaiements } from '@/lib/paiements';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Paiements — Les Matinées du Bac',
  robots: { index: false, follow: false },
};

const euros = (n: number) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const jourCourt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

/**
 * /admin/paiements — le point d'entrée « argent ».
 *
 * Deux choses seulement, et elles ne se mélangent pas :
 *   1. la comptabilité complète vit dans le classeur de suivi financier
 *      (encaissements Revolut, factures des profs, Urssaf) — gros bouton ;
 *   2. le CRM, lui, sait qui n'a pas encore payé et combien de relances sont
 *      parties — c'est le tableau du bas.
 *
 * Les relances de paiement restent des e-mails : elles apparaissent donc aussi
 * dans /admin/emails, qui est l'historique de TOUS les messages. Ici on parle
 * d'argent, là-bas de courrier.
 */
export default async function PagePaiements() {
  const garde = await gardeAdminPage();
  if (garde.etat === 'anonyme') redirect('/devenir-coach');
  if (garde.etat !== 'ok') {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {garde.etat === 'config' ? 'Page non configurée' : 'Accès réservé'}
          </h1>
          {garde.etat === 'config' ? (
            <ul className="text-sm font-mono bg-gray-50 rounded-lg p-3 space-y-1">
              {garde.manquants.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <Link href="/espace-prof" className="text-sm text-purple-700 hover:underline">
              ← Retour à mon espace
            </Link>
          )}
        </div>
      </div>
    );
  }

  const etat = await chargerPaiements();

  return (
    <div className="min-h-screen bg-slate-100">
      <NavDirection />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paiements</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            La comptabilité (encaissements, factures des profs, Urssaf) se tient dans le classeur de
            suivi financier. Le site, lui, sait <strong>qui n’a pas encore payé</strong> et relance
            tout seul.
          </p>
        </div>

        {/* --- Le classeur --- */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-bold text-slate-900">Le classeur de suivi financier</h2>
          {etat.classeur_url ? (
            <>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Encaissements Revolut, rapprochement, factures des professeurs, Urssaf. C’est lui qui
                fait foi pour le chiffre d’affaires.
              </p>
              <a
                href={etat.classeur_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-5 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700"
              >
                📊 Ouvrir le classeur de suivi financier ↗
              </a>
            </>
          ) : (
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
              <p className="font-semibold">L’adresse du classeur n’est pas encore renseignée.</p>
              <p className="mt-1">
                Ouvre le classeur dans Google Sheets, copie l’adresse de la barre du navigateur,
                et pose-la une seule fois dans Vercel → Settings → Environment Variables
                (Production et Preview) :
              </p>
              <p className="mt-2 font-mono text-xs bg-white rounded-lg p-3 border border-amber-200">
                SUIVI_FINANCIER_URL = https://docs.google.com/spreadsheets/d/…/edit
              </p>
              <p className="mt-2 text-xs">
                Puis redéploie : le bouton d’ouverture apparaîtra ici même.
              </p>
            </div>
          )}
        </section>

        {/* --- Les chiffres du CRM --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { valeur: etat.total_inscriptions, label: 'inscriptions au total' },
            { valeur: etat.payes, label: 'paiements encaissés' },
            { valeur: etat.en_attente, label: 'en attente de paiement', alerte: etat.en_attente > 0 },
            { valeur: euros(etat.encaisse), label: 'encaissé (montants saisis)' },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-5">
              <p
                className={`text-2xl font-bold tabular-nums leading-none ${
                  c.alerte ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {c.valeur}
              </p>
              <p className="text-xs text-slate-500 mt-1.5">{c.label}</p>
            </div>
          ))}
        </div>

        {/* --- Qui n'a pas payé --- */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 pb-3">
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

          {etat.lignes.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-400">
              Personne en attente : tout le monde a réglé.
            </p>
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
                          <span className="block text-xs text-slate-400">
                            {jourCourt(l.date_epreuve)}
                          </span>
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
      </div>
    </div>
  );
}
