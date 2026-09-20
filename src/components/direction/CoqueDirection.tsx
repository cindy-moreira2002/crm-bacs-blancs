'use client';

/**
 * La coque de l'espace Direction — ce qui entoure tous les écrans.
 *
 * Elle porte quatre choses, et une seule fois pour toute l'application :
 *  - qui est connecté, et le bouton pour en sortir ;
 *  - la navigation (barre du haut sur ordinateur, barre du bas sur téléphone) ;
 *  - le sondage des compteurs, partagé par toutes les pastilles ;
 *  - l'installation de l'application sur le téléphone (service worker + push).
 *
 * `pb-24 md:pb-0` : sur téléphone, la barre du bas est en position fixe — sans
 * cette réserve, elle recouvrirait le dernier bouton de chaque page.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BarreMobileDirection, NavDirection } from '@/components/direction/NavDirection';
import { LiveDirection, type Compteurs } from '@/components/direction/LiveDirection';
import { PwaDirection } from '@/components/direction/PwaDirection';

export function CoqueDirection({
  prenom,
  nom,
  compteursInitiaux,
  children,
}: {
  prenom: string;
  nom: string;
  compteursInitiaux?: Partial<Compteurs>;
  children: ReactNode;
}) {
  const seDeconnecter = async () => {
    await fetch('/api/prof/deconnexion', { method: 'POST' });
    window.location.href = '/direction';
  };

  return (
    <LiveDirection initiaux={compteursInitiaux}>
      <div className="min-h-screen bg-slate-100 pb-24 md:pb-0">
        <header className="bg-white border-b border-slate-200">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
            <Link href="/direction" className="mr-auto min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
                Les Matinées du Bac
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">
                Direction
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {prenom} {nom}
                </span>
              </p>
            </Link>
            <Link
              href="/espace-prof"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 md:hidden"
            >
              👩‍🏫 Mon espace
            </Link>
            <button
              onClick={seDeconnecter}
              className="text-xs text-slate-400 underline hover:text-slate-700"
            >
              Quitter
            </button>
          </div>
        </header>

        <NavDirection />
        <main>{children}</main>
        <BarreMobileDirection />
        <PwaDirection />
      </div>
    </LiveDirection>
  );
}
