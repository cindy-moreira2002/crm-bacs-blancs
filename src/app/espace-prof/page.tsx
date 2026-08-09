import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EspaceUnifie } from '@/components/direction/EspaceUnifie';
import { authManquant, lienAffiliation, profCourant } from '@/lib/authProf';
import { chargerResumeDirection } from '@/lib/direction';
import { chargerRevenus, chargerSessions, repartirSessions } from '@/lib/espaceProf';

export const dynamic = 'force-dynamic';

/**
 * /espace-prof — un seul écran, deux espaces.
 *
 * Pour un professeur : son tableau de bord, inchangé.
 * Pour l'administratrice : la vue Direction d'abord (tout suivre), et son
 * propre espace prof à un clic — `?vue=prof` ouvre directement celui-ci.
 *
 * Le résumé Direction n'est calculé que si la personne est administratrice :
 * un prof ne paie pas le coût de requêtes qu'il n'a pas le droit de lire.
 */
export default async function EspaceProfPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
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

  // Pendant une usurpation, l'admin regarde l'espace d'un prof : pas de vue
  // Direction, sinon on ne saurait plus de quel espace on parle.
  const estDirection = prof.role === 'admin' && !usurpePar;

  const [sessions, revenus, resume] = await Promise.all([
    chargerSessions(prof),
    chargerRevenus(prof),
    estDirection ? chargerResumeDirection() : Promise.resolve(null),
  ]);
  const blocs = repartirSessions(prof, sessions);

  const { vue } = await searchParams;

  // Origine réelle de la requête : le lien d'affiliation doit être cliquable
  // aussi bien depuis matineesdubac.fr que depuis l'URL Vercel.
  const jar = await headers();
  const host = jar.get('host') ?? 'matineesdubac.fr';
  const protocole = host.startsWith('localhost') ? 'http' : 'https';

  return (
    <EspaceUnifie
      prof={prof}
      revenus={revenus}
      blocs={blocs}
      lienAffiliation={lienAffiliation(prof.code_affiliation, `${protocole}://${host}`)}
      usurpePar={usurpePar ? `${usurpePar.prenom} ${usurpePar.nom}` : null}
      resume={resume}
      vueInitiale={vue === 'prof' ? 'prof' : 'direction'}
    />
  );
}
