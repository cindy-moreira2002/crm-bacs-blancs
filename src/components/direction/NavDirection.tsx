'use client';

/**
 * Les écrans de la Direction — une seule liste, deux affichages.
 *
 * Sur ordinateur : une barre d'onglets en haut (`NavDirection`).
 * Sur téléphone  : une barre fixe en bas (`BarreMobileDirection`), parce que
 * le pouce n'atteint pas le haut de l'écran.
 *
 * Les deux lisent `OUTILS_DIRECTION` : ajouter une console, c'est ajouter une
 * ligne ici, et elle apparaît aux deux endroits.
 */
import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLive } from '@/components/direction/LiveDirection';

/**
 * Les dix écrans de la Direction, dans l'ordre où l'on s'en sert.
 *
 * `compteur` nomme le chiffre temps réel à coller sur l'onglet (voir
 * /api/direction/compteurs). Les barèmes n'y figurent pas : ils appartiennent à la
 * correction (on saisit le barème d'un sujet juste avant de corriger ce
 * sujet-là), et on y accède depuis /direction/correction.
 */
export const OUTILS_DIRECTION: {
  href: string;
  racine: string;
  emoji: string;
  label: string;
  court: string;
  compteur?: 'aValider' | 'aFaire' | 'correctionsBloquees' | 'paiementsEnAttente';
  /** Visible dans la barre du bas : quatre au maximum, le cinquième est « Plus ». */
  mobile?: boolean;
}[] = [
  { href: '/direction', racine: '/direction', emoji: '🧭', label: 'Vue d’ensemble', court: 'Accueil', mobile: true },
  { href: '/direction/a-valider', racine: '/direction/a-valider', emoji: '📬', label: 'À valider', court: 'À valider', compteur: 'aValider', mobile: true },
  { href: '/direction/a-faire', racine: '/direction/a-faire', emoji: '✅', label: 'À faire', court: 'À faire', compteur: 'aFaire', mobile: true },
  { href: '/direction/bacs-blancs', racine: '/direction/bacs-blancs', emoji: '📅', label: 'Bacs blancs & sujets', court: 'Bacs', mobile: true },
  { href: '/direction/emails', racine: '/direction/emails', emoji: '📮', label: 'Console e-mails', court: 'E-mails' },
  { href: '/direction/correction', racine: '/direction/correction', emoji: '🎛️', label: 'Correction', court: 'Correction', compteur: 'correctionsBloquees' },
  { href: '/direction/paiements', racine: '/direction/paiements', emoji: '💶', label: 'Paiements', court: 'Paiements', compteur: 'paiementsEnAttente' },
  { href: '/direction/codes', racine: '/direction/codes', emoji: '🏷️', label: 'Codes promo', court: 'Codes' },
  { href: '/direction/discord', racine: '/direction/discord', emoji: '🎙️', label: 'Salles Discord', court: 'Discord' },
  { href: '/direction/profs', racine: '/direction/profs', emoji: '👥', label: 'Profs & accès', court: 'Profs' },
];

/** La pastille rouge d'un onglet — rien du tout quand il n'y a rien à faire. */
function Pastille({ valeur }: { valeur: number }) {
  if (!valeur) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-[18px] justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
      {valeur > 99 ? '99+' : valeur}
    </span>
  );
}

export function NavDirection() {
  const chemin = usePathname();
  const live = useLive();

  return (
    <div className="hidden border-b border-slate-200 bg-white md:block">
      <div className="mx-auto flex max-w-7xl items-center gap-4 overflow-x-auto px-4">
        <nav className="flex items-center gap-1">
          {OUTILS_DIRECTION.map((o) => {
            const actif = chemin === o.racine;
            return (
              <Link
                key={o.href}
                href={o.href}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
                  actif
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span aria-hidden className="mr-1.5">{o.emoji}</span>
                {o.label}
                {o.compteur && <Pastille valeur={live[o.compteur]} />}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/espace-prof"
          className="ml-auto whitespace-nowrap py-3 text-xs text-slate-500 hover:text-slate-800"
        >
          👩‍🏫 Mon espace prof →
        </Link>
      </div>
    </div>
  );
}

/**
 * La barre du bas, sur téléphone.
 *
 * `pb-[env(safe-area-inset-bottom)]` : sur iPhone, la barre gestuelle mange
 * les derniers pixels — sans cette marge, le dernier onglet n'est pas tapable.
 */
export function BarreMobileDirection() {
  const chemin = usePathname();
  const live = useLive();
  const [plusOuvert, setPlusOuvert] = useState(false);
  const onglets = OUTILS_DIRECTION.filter((o) => o.mobile);
  const reste = OUTILS_DIRECTION.filter((o) => !o.mobile);

  return (
    <>
      {plusOuvert && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setPlusOuvert(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Les autres consoles
            </p>
            <div className="grid grid-cols-2 gap-2">
              {reste.map((o) => (
                <Link
                  key={o.href}
                  href={o.href}
                  onClick={() => setPlusOuvert(false)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700"
                >
                  <span aria-hidden>{o.emoji}</span>
                  {o.court}
                  {o.compteur && <Pastille valeur={live[o.compteur]} />}
                </Link>
              ))}
              <Link
                href="/espace-prof"
                onClick={() => setPlusOuvert(false)}
                className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-3 text-sm font-medium text-purple-800"
              >
                <span aria-hidden>👩‍🏫</span>
                Mon espace prof
              </Link>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex">
          {onglets.map((o) => {
            const actif = chemin === o.racine;
            const valeur = o.compteur ? live[o.compteur] : 0;
            return (
              <Link
                key={o.href}
                href={o.href}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  actif ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                <span aria-hidden className="text-lg leading-none">{o.emoji}</span>
                {o.court}
                {valeur > 0 && (
                  <span className="absolute right-[18%] top-1 min-w-[16px] rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
                    {valeur > 9 ? '9+' : valeur}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            onClick={() => setPlusOuvert((v) => !v)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              plusOuvert ? 'text-slate-900' : 'text-slate-400'
            }`}
          >
            <span aria-hidden className="text-lg leading-none">⋯</span>
            Plus
          </button>
        </div>
      </nav>
    </>
  );
}
