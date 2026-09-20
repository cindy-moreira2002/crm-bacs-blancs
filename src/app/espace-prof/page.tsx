import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TableauDeBordProf } from '@/components/TableauDeBordProf';
import { authManquant, lienAffiliation, profCourant } from '@/lib/authProf';
import { chargerRevenus, chargerSessions, repartirSessions } from '@/lib/espaceProf';

export const dynamic = 'force-dynamic';

/**
 * /espace-prof — l'espace personnel d'UN professeur, et rien d'autre.
 *
 * Depuis le 20/09/2026, la Direction n'habite plus ici : elle a son propre
 * domicile, `/direction`, partagé par plusieurs personnes. La raison est
 * simple : un espace prof est personnel (mes matières, mes revenus, mes
 * copies) alors que la direction se pilote à plusieurs. Les mélanger obligeait
 * à partager un compte pour partager la direction.
 *
 * Cindy garde donc son espace prof à elle, et retrouve la direction d'un clic.
 */
export default async function EspaceProfPage() {
  // Environnement non configuré → message actionnable plutôt qu'une erreur 500.
  const manquants = authManquant();
  if (manquants.length) {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Espace prof non configuré</h1>
          <p className="text-sm text-gray-600 mb-3">
            Variables d’environnement manquantes :
          </p>
          <ul className="text-sm font-mono bg-gray-50 rounded-lg p-3 space-y-1">
            {manquants.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            À renseigner dans Vercel (et dans <code>.env.local</code> en local), puis redéployer.
          </p>
        </div>
      </div>
    );
  }

  const { prof, usurpePar } = await profCourant();
  if (!prof) redirect('/devenir-coach');

  const [sessions, revenus] = await Promise.all([
    chargerSessions(prof),
    chargerRevenus(prof),
  ]);
  const blocs = repartirSessions(prof, sessions);

  // Origine réelle de la requête : le lien d'affiliation doit être cliquable
  // aussi bien depuis matineesdubac.fr que depuis l'URL Vercel.
  const jar = await headers();
  const host = jar.get('host') ?? 'matineesdubac.fr';
  const protocole = host.startsWith('localhost') ? 'http' : 'https';

  // Pendant une usurpation, l'admin regarde l'espace d'un prof : le raccourci
  // vers la direction disparaît, sinon on ne saurait plus de quel espace on
  // parle en cliquant dessus.
  const passerelleDirection = prof.role === 'admin' && !usurpePar;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {passerelleDirection && (
          <Link
            href="/direction"
            className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300"
          >
            <span aria-hidden className="text-xl">🧭</span>
            <span className="text-sm text-slate-700">
              <strong className="font-semibold text-slate-900">Espace direction</strong> — piloter
              les bacs blancs, les e-mails, les paiements.
            </span>
            <span className="ml-auto text-sm text-slate-400">→</span>
          </Link>
        )}
        <TableauDeBordProf
          prof={prof}
          revenus={revenus}
          blocs={blocs}
          lienAffiliation={lienAffiliation(prof.code_affiliation, `${protocole}://${host}`)}
          usurpePar={usurpePar ? `${usurpePar.prenom} ${usurpePar.nom}` : null}
        />
      </div>
    </div>
  );
}
