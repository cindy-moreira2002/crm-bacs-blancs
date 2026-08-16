import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavDirection } from '@/components/direction/NavDirection';
import { gardeAdminPage } from '@/lib/gardeAcces';
import { chargerPaiements } from '@/lib/paiements';
import { chargerPaiementsProfs } from '@/lib/paiementsProfs';
import { ConsolePaiements } from './ConsolePaiements';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Paiements — Les Matinées du Bac',
  robots: { index: false, follow: false },
};

/**
 * /admin/paiements — le point d'entrée « argent ».
 *
 * Trois choses, et elles ne se mélangent pas :
 *   1. la comptabilité complète vit dans le classeur de suivi financier
 *      (encaissements Revolut, factures, Urssaf) — gros bouton ;
 *   2. l'argent qui ENTRE : qui n'a pas encore payé sa matinée, et combien de
 *      relances sont parties ;
 *   3. l'argent qui SORT : ce qu'on doit à chaque prof, coaching et
 *      affiliation (10 € par élève amené par son lien) réunis, avec l'IBAN.
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

  const [etat, etatProfs] = await Promise.all([chargerPaiements(), chargerPaiementsProfs()]);

  return (
    <div className="min-h-screen bg-slate-100">
      <NavDirection />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paiements</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Ce que les familles doivent encore régler, et ce que Les Matinées doivent aux professeurs —
            coaching et affiliation. La comptabilité (rapprochement Revolut, factures, Urssaf) reste
            dans le classeur de suivi financier.
          </p>
        </div>

        {/* --- Le classeur --- */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-bold text-slate-900">Le classeur de suivi financier</h2>
          {etat.classeur_url ? (
            <>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Encaissements Revolut, rapprochement, factures des professeurs, Urssaf. C’est lui qui
                fait foi pour le chiffre d’affaires. Chaque tableau ci-dessous a un bouton{' '}
                <strong>Copier pour le classeur</strong> : le collage tombe directement dans les bonnes
                colonnes.
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
                Puis redéploie : le bouton d’ouverture apparaîtra ici même. En attendant, les boutons
                « Copier pour le classeur » fonctionnent déjà.
              </p>
            </div>
          )}
        </section>

        {/* --- L'alerte qui vide une relance de son sens --- */}
        {!etat.instructions_pretes && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-900">
            <p className="font-bold">Les relances de paiement ne disent pas où payer.</p>
            <p className="mt-1">
              Le réglage <span className="font-mono text-xs">paiement_instructions</span> est vide :
              l’e-mail de relance part sans IBAN ni référence de virement. À remplir dans{' '}
              <Link href="/admin/emails" className="underline font-semibold">
                E-mails → Réglages
              </Link>{' '}
              avant la première relance.
            </p>
          </div>
        )}

        <ConsolePaiements eleves={etat} profs={etatProfs} />
      </div>
    </div>
  );
}
