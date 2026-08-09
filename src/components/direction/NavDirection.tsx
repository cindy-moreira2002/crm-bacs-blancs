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

export const OUTILS_DIRECTION = [
  { href: '/espace-prof?vue=direction', racine: '/espace-prof', emoji: '🧭', label: 'Vue d’ensemble' },
  { href: '/admin/bacs-blancs', racine: '/admin/bacs-blancs', emoji: '📅', label: 'Bacs blancs & sujets' },
  { href: '/admin/correction', racine: '/admin/correction', emoji: '🎛️', label: 'Correction' },
  { href: '/admin/emails', racine: '/admin/emails', emoji: '📬', label: 'E-mails' },
  { href: '/admin/discord', racine: '/admin/discord', emoji: '🎙️', label: 'Salles Discord' },
  { href: '/admin/profs', racine: '/admin/profs', emoji: '👥', label: 'Profs & accès' },
  { href: '/admin/bareme', racine: '/admin/bareme', emoji: '📐', label: 'Barèmes' },
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
