'use client';

/**
 * Barre de navigation de la Direction.
 *
 * Posée en haut de chaque console d'administration, elle fait de pages qui
 * vivaient chacune dans leur coin une seule interface : on voit où on est, et
 * on passe d'un outil à l'autre sans repasser par un menu.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Les sept écrans de la Direction, dans l'ordre où on s'en sert.
 *
 * Les barèmes n'y figurent pas : ils appartiennent à la correction (on saisit
 * le barème d'un sujet juste avant de corriger ce sujet-là), et on y accède
 * depuis /admin/correction. Un onglet de plus ici les aurait fait passer pour
 * un réglage permanent, ce qu'ils ne sont pas.
 */
export const OUTILS_DIRECTION = [
  { href: '/espace-prof?vue=direction', racine: '/espace-prof', emoji: '🧭', label: 'Vue d’ensemble' },
  { href: '/admin/a-faire', racine: '/admin/a-faire', emoji: '✅', label: 'À faire' },
  { href: '/admin/bacs-blancs', racine: '/admin/bacs-blancs', emoji: '📅', label: 'Bacs blancs & sujets' },
  { href: '/admin/correction', racine: '/admin/correction', emoji: '🎛️', label: 'Correction' },
  { href: '/admin/paiements', racine: '/admin/paiements', emoji: '💶', label: 'Paiements' },
  { href: '/admin/emails', racine: '/admin/emails', emoji: '📬', label: 'E-mails' },
  { href: '/admin/discord', racine: '/admin/discord', emoji: '🎙️', label: 'Salles Discord' },
  { href: '/admin/profs', racine: '/admin/profs', emoji: '👥', label: 'Profs & accès' },
];

export function NavDirection() {
  const chemin = usePathname();

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-4 overflow-x-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap py-3">
          Direction
        </span>
        <nav className="flex items-center gap-1">
          {OUTILS_DIRECTION.map((o) => {
            const actif = chemin === o.racine;
            return (
              <Link
                key={o.href}
                href={o.href}
                className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  actif
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span aria-hidden className="mr-1.5">{o.emoji}</span>
                {o.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/espace-prof?vue=prof"
          className="ml-auto text-xs text-slate-500 hover:text-slate-800 whitespace-nowrap py-3"
        >
          👩‍🏫 Mon espace prof →
        </Link>
      </div>
    </div>
  );
}
