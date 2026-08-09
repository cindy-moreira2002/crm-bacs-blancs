import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NavDirection } from '@/components/direction/NavDirection';
import { gardeAdminPage } from '@/lib/gardeAcces';
import { CLIENT_ID, GUILD_ID, discordManquant, urlInvitationBot } from '@/lib/discord/config';
import { PanneauDiscord } from './PanneauDiscord';
import { SallesBacsBlancs } from './SallesBacsBlancs';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Discord — Les Matinées du Bac',
};

/**
 * /admin/discord — la tour de contrôle des salles Discord.
 *
 * Réservée à l'administratrice. Cette page est le point d'entrée unique : tout
 * ce qui concerne Discord (configuration, préparation des salles, envoi des
 * accès, verrouillage, suppression) se pilote d'ici, sans jamais avoir à
 * ouvrir Discord ou Vercel — sauf pour les rares réglages qui n'existent que
 * là-bas, et pour lesquels un lien direct est fourni.
 */
export default async function PageDiscord() {
  const garde = await gardeAdminPage();

  if (garde.etat === 'config') {
    return (
      <Encadre titre="Page non configurée" ton="amber">
        <p className="text-sm text-gray-600 mb-3">Variables d’environnement manquantes :</p>
        <ul className="text-sm font-mono bg-gray-50 rounded-lg p-3 space-y-1">
          {garde.manquants.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Encadre>
    );
  }
  if (garde.etat === 'anonyme') redirect('/devenir-coach');
  if (garde.etat === 'refuse') {
    return (
      <Encadre titre="Accès réservé" ton="red">
        <p className="text-sm text-gray-600">Cette page est réservée à l’administratrice.</p>
        <Link href="/espace-prof" className="inline-block mt-4 text-sm text-purple-700 hover:underline">
          ← Retour à mon espace
        </Link>
      </Encadre>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <NavDirection />
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">Salles Discord</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pendant le bac blanc, chaque élève a sa salle vocale privée : le coach y entre pour
          l’aider, personne d’autre ne peut ni la voir ni l’écouter.
        </p>
      </div>
      <div className="max-w-4xl mx-auto px-4 pb-6">
        <SallesBacsBlancs />
      </div>
      <PanneauDiscord
        manquants={discordManquant()}
        guildId={GUILD_ID}
        clientId={CLIENT_ID}
        urlInvitation={urlInvitationBot()}
      />
    </div>
  );
}

function Encadre({
  titre,
  ton,
  children,
}: {
  titre: string;
  ton: 'amber' | 'red';
  children: React.ReactNode;
}) {
  const bordure = ton === 'amber' ? 'border-amber-200' : 'border-red-200';
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className={`max-w-lg mx-auto bg-white rounded-2xl border ${bordure} p-6 shadow-sm`}>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{titre}</h1>
        {children}
      </div>
    </div>
  );
}
