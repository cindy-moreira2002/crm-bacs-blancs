'use client';

/**
 * Tour de contrôle Discord (côté client).
 *
 * Deux boutons seulement, et ils font des choses différentes :
 *  - « Contrôle rapide » lit la configuration sans rien créer ;
 *  - « Vérification complète » crée un vrai salon privé puis le supprime.
 *    C'est le seul moyen de prouver que la chaîne fonctionne de bout en bout.
 *
 * Chaque contrôle en échec affiche quoi faire pour le corriger, avec le lien
 * qui mène directement au bon écran : l'administratrice ne doit jamais avoir à
 * chercher où cliquer.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type EtatControle = 'ok' | 'echec' | 'alerte' | 'ignore';

type Controle = {
  cle: string;
  libelle: string;
  etat: EtatControle;
  detail: string;
  remede?: string;
};

type Rapport = {
  configure: boolean;
  manquants: string[];
  controles: Controle[];
  pret: boolean;
  serveur: string | null;
  verifieLe: string;
};

const APPARENCE: Record<EtatControle, { puce: string; fond: string; texte: string; mot: string }> = {
  ok: { puce: '✅', fond: 'bg-emerald-50 border-emerald-200', texte: 'text-emerald-900', mot: 'OK' },
  echec: { puce: '❌', fond: 'bg-red-50 border-red-200', texte: 'text-red-900', mot: 'à corriger' },
  alerte: { puce: '⚠️', fond: 'bg-amber-50 border-amber-200', texte: 'text-amber-900', mot: 'à surveiller' },
  ignore: { puce: '⏭️', fond: 'bg-gray-50 border-gray-200', texte: 'text-gray-600', mot: 'non testé' },
};

function heure(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function PanneauDiscord({
  manquants,
  guildId,
  clientId,
  urlInvitation,
  permissionsAttendues,
}: {
  manquants: string[];
  guildId: string;
  clientId: string;
  urlInvitation: string | null;
  permissionsAttendues: string;
}) {
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [occupe, setOccupe] = useState<'rapide' | 'complet' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const verifier = useCallback(async (complet: boolean) => {
    setOccupe(complet ? 'complet' : 'rapide');
    setErreur(null);
    try {
      const r = await fetch('/api/admin/discord/verification', {
        method: complet ? 'POST' : 'GET',
      });
      const data = await r.json();
      if (!r.ok) {
        setErreur(data?.error ?? 'La vérification a échoué.');
        return;
      }
      setRapport(data as Rapport);
    } catch {
      setErreur('Impossible de joindre le serveur.');
    } finally {
      setOccupe(null);
    }
  }, []);

  // Contrôle rapide au chargement. Le setTimeout évite la règle Next 16 qui
  // interdit de modifier l'état de façon synchrone dans un effet.
  useEffect(() => {
    const t = setTimeout(() => void verifier(false), 0);
    return () => clearTimeout(t);
  }, [verifier]);

  const echecs = rapport?.controles.filter((c) => c.etat === 'echec') ?? [];
  const alertes = rapport?.controles.filter((c) => c.etat === 'alerte') ?? [];

  return (
    <div className="px-4 pb-10">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* ---------- En-tête ---------- */}
        <header>
          <h2 className="text-lg font-bold text-gray-900">Réglages techniques du serveur</h2>
          <p className="text-sm text-gray-600 mt-1">
            À vérifier une fois au début, puis chaque fois qu’un doute apparaît : c’est ce qui
            permet aux salles ci-dessus d’être créées.
          </p>
        </header>

        {/* ---------- Bandeau d'état ---------- */}
        <BandeauEtat
          manquants={manquants}
          rapport={rapport}
          echecs={echecs.length}
          alertes={alertes.length}
          occupe={occupe !== null}
        />

        {/* ---------- Actions ---------- */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-1">Vérifier la configuration</h2>
          <p className="text-sm text-gray-600 mb-4">
            La vérification complète crée un vrai salon privé sur le serveur, contrôle que
            personne d’autre ne peut le voir, puis le supprime. C’est la seule preuve que
            tout fonctionne — le reste n’est qu’une lecture de réglages.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void verifier(true)}
              disabled={occupe !== null}
              className="px-4 py-2.5 rounded-xl bg-purple-700 text-white font-semibold text-sm hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {occupe === 'complet' ? 'Vérification en cours…' : '🔍 Vérification complète'}
            </button>
            <button
              onClick={() => void verifier(false)}
              disabled={occupe !== null}
              className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {occupe === 'rapide' ? 'Lecture…' : 'Contrôle rapide'}
            </button>
          </div>
          {erreur && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {erreur}
            </p>
          )}
        </section>

        {/* ---------- Détail des contrôles ---------- */}
        {rapport && (
          <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-bold text-gray-900">Détail des contrôles</h2>
              <span className="text-xs text-gray-500">vérifié à {heure(rapport.verifieLe)}</span>
            </div>
            <ul className="space-y-2">
              {rapport.controles.map((c) => (
                <LigneControle key={c.cle} controle={c} />
              ))}
            </ul>
          </section>
        )}

        {/* ---------- Liens utiles ---------- */}
        <LiensUtiles
          guildId={guildId}
          clientId={clientId}
          urlInvitation={urlInvitation}
          permissionsAttendues={permissionsAttendues}
        />

        {/* ---------- Où préparer, maintenant que c'est en place ---------- */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-3">Préparer un bac blanc</h2>
          <p className="text-sm text-gray-600">
            Cela se fait <strong>en haut de cette page</strong>, dans « Les salles des bacs
            blancs » : un bloc par bac blanc, avec « Préparer les salles », « Fermer les
            salles » et « Supprimer ». Les réglages ci-dessus ne servent qu’à ce que ces
            boutons aboutissent.
          </p>
        </section>
      </div>
    </div>
  );
}

// --- Briques ---------------------------------------------------------

function BandeauEtat({
  manquants,
  rapport,
  echecs,
  alertes,
  occupe,
}: {
  manquants: string[];
  rapport: Rapport | null;
  echecs: number;
  alertes: number;
  occupe: boolean;
}) {
  if (manquants.length) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="font-bold text-amber-900">Discord n’est pas encore branché</p>
        <p className="text-sm text-amber-800 mt-1">
          Variables manquantes dans Vercel : <span className="font-mono">{manquants.join(', ')}</span>.
          Tant qu’elles ne sont pas posées, les boutons Discord n’apparaissent nulle part et
          le salon visio actuel continue de fonctionner normalement.
        </p>
      </div>
    );
  }
  if (!rapport) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-600">{occupe ? 'Lecture de la configuration…' : 'Aucun contrôle effectué.'}</p>
      </div>
    );
  }
  if (echecs > 0) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="font-bold text-red-900">
          {echecs} point{echecs > 1 ? 's' : ''} à corriger avant d’utiliser Discord
        </p>
        <p className="text-sm text-red-800 mt-1">
          Chaque ligne rouge ci-dessous indique quoi faire. Relance la vérification après correction.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <p className="font-bold text-emerald-900">
        Configuration Discord opérationnelle{rapport.serveur ? ` — serveur « ${rapport.serveur} »` : ''}
      </p>
      <p className="text-sm text-emerald-800 mt-1">
        {alertes > 0
          ? `${alertes} point${alertes > 1 ? 's' : ''} à surveiller, rien de bloquant.`
          : 'Tous les contrôles passent.'}
      </p>
    </div>
  );
}

function LigneControle({ controle }: { controle: Controle }) {
  const a = APPARENCE[controle.etat];
  return (
    <li className={`rounded-xl border p-3 ${a.fond}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-base leading-6">{a.puce}</span>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-sm ${a.texte}`}>
            {controle.libelle} <span className="font-normal opacity-70">— {a.mot}</span>
          </p>
          <p className="text-sm text-gray-700 mt-0.5">{controle.detail}</p>
          {controle.remede && (
            <p className="text-sm text-gray-600 mt-2 bg-white/70 border border-white rounded-lg p-2">
              <span className="font-semibold">À faire : </span>
              {controle.remede}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function LiensUtiles({
  guildId,
  clientId,
  urlInvitation,
  permissionsAttendues,
}: {
  guildId: string;
  clientId: string;
  urlInvitation: string | null;
  /* Calculé sur le serveur et transmis en texte : lib/discord/config n'est
     jamais importé côté navigateur, il lit le token du bot. */
  permissionsAttendues: string;
}) {
  const liens: { titre: string; sous: string; href: string; externe: boolean }[] = [
    ...(guildId
      ? [{
          titre: '💬 Ouvrir le serveur Discord',
          sous: 'Les Matinées du Bac',
          href: `https://discord.com/channels/${guildId}`,
          externe: true,
        }]
      : []),
    ...(clientId
      ? [{
          titre: '🛠️ Portail développeur Discord',
          sous: 'Token, clé secrète, redirections',
          href: `https://discord.com/developers/applications/${clientId}/information`,
          externe: true,
        }]
      : []),
    ...(urlInvitation
      ? [{
          // Le sous-titre porte le nombre exact : c'est ce qu'on lit en bas de
          // l'écran Discord pour vérifier qu'aucune case n'a bougé, et c'est ce
          // qui distingue cette carte des autres liens de la grille.
          titre: '🤖 Réinviter le bot',
          sous: `Les 7 permissions à jour — ${permissionsAttendues}`,
          href: urlInvitation,
          externe: true,
        }]
      : []),
    {
      titre: '🔑 Variables d’environnement',
      sous: 'Vercel — secrets Discord',
      href: 'https://vercel.com/cindy-moreira2026/espaces-matineesdubac/settings/environment-variables',
      externe: true,
    },
    { titre: '📧 E-mails automatiques', sous: 'File d’envoi et réglages', href: '/admin/emails', externe: false },
    { titre: '📝 Pilotage de la correction', sous: 'Copies, barèmes, coûts', href: '/admin/correction', externe: false },
  ];

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h2 className="font-bold text-gray-900 mb-3">Aller directement à…</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {liens.map((l) =>
          l.externe ? (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-gray-200 p-3 hover:border-purple-300 hover:bg-purple-50/40 transition"
            >
              <p className="font-semibold text-sm text-gray-900">{l.titre}</p>
              <p className="text-xs text-gray-500 mt-0.5">{l.sous}</p>
            </a>
          ) : (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-xl border border-gray-200 p-3 hover:border-purple-300 hover:bg-purple-50/40 transition"
            >
              <p className="font-semibold text-sm text-gray-900">{l.titre}</p>
              <p className="text-xs text-gray-500 mt-0.5">{l.sous}</p>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
