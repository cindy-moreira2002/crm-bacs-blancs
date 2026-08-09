'use client';

/**
 * L'écran d'accueil de l'administratrice — deux espaces, un seul endroit.
 *
 * Cindy est à la fois professeure de français et directrice : elle a besoin de
 * voir ce que voient ses profs, ET de piloter l'ensemble. Mélanger les deux
 * donnait un tableau de bord de prof avec trois boutons d'admin dans un coin.
 *
 * Ici, on choisit franchement :
 *   🧭 Direction        — tout suivre (par défaut quand on est admin)
 *   👩‍🏫 Mon espace prof — exactement la page que voit un professeur
 *
 * Un prof simple ne voit jamais l'interrupteur : il n'a qu'un espace.
 */
import { useState } from 'react';
import { TableauDeBordProf } from '@/components/TableauDeBordProf';
import { CockpitDirection } from '@/components/direction/CockpitDirection';
import { OUTILS_DIRECTION } from '@/components/direction/NavDirection';
import Link from 'next/link';
import type { ResumeDirection } from '@/lib/direction';
import type { BlocsSessions, Revenus } from '@/lib/espaceProf';
import type { Professeur } from '@/lib/authProf';

type Vue = 'direction' | 'prof';

export function EspaceUnifie({
  prof,
  revenus,
  blocs,
  lienAffiliation,
  usurpePar,
  resume,
  vueInitiale,
}: {
  prof: Professeur;
  revenus: Revenus;
  blocs: BlocsSessions;
  lienAffiliation: string;
  usurpePar: string | null;
  /** Null pour un prof : il n'a pas de vue Direction. */
  resume: ResumeDirection | null;
  vueInitiale: Vue;
}) {
  const [vue, setVue] = useState<Vue>(resume ? vueInitiale : 'prof');

  const changer = (v: Vue) => {
    setVue(v);
    // L'URL suit la vue : un lien copié rouvre le bon écran, sans recharger.
    const url = new URL(window.location.href);
    url.searchParams.set('vue', v);
    window.history.replaceState(null, '', url.toString());
  };

  const seDeconnecter = async () => {
    await fetch('/api/prof/deconnexion', { method: 'POST' });
    window.location.href = '/devenir-coach';
  };

  // Un prof simple : rien ne change pour lui.
  if (!resume) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <TableauDeBordProf
            prof={prof}
            revenus={revenus}
            blocs={blocs}
            lienAffiliation={lienAffiliation}
            usurpePar={usurpePar}
          />
        </div>
      </div>
    );
  }

  const aFaire = resume.taches.filter((t) => t.urgence === 'rouge').length;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Barre de tête : qui je suis, dans quel espace je suis. */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="mr-auto">
            <p className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
              Les Matinées du Bac
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {prof.prenom} {prof.nom}
              <span className="ml-2 text-xs font-normal text-slate-400">
                administratrice{(prof.matieres ?? []).length ? ` · ${(prof.matieres ?? []).join(', ')}` : ''}
              </span>
            </p>
          </div>

          {/* L'interrupteur des deux espaces. */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            {([
              { cle: 'direction' as Vue, emoji: '🧭', label: 'Direction' },
              { cle: 'prof' as Vue, emoji: '👩‍🏫', label: 'Mon espace prof' },
            ]).map((o) => (
              <button
                key={o.cle}
                onClick={() => changer(o.cle)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  vue === o.cle ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span aria-hidden className="mr-1.5">{o.emoji}</span>
                {o.label}
                {o.cle === 'direction' && aFaire > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px]">
                    {aFaire}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button onClick={seDeconnecter} className="text-xs text-slate-400 hover:text-slate-700 underline">
            Se déconnecter
          </button>
        </div>

        {/* Les outils de la Direction, toujours à portée depuis la vue Direction. */}
        {vue === 'direction' && (
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-1 overflow-x-auto border-t border-slate-100">
            {OUTILS_DIRECTION.filter((o) => o.racine !== '/espace-prof').map((o) => (
              <Link
                key={o.href}
                href={o.href}
                className="px-3 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-900 whitespace-nowrap"
              >
                <span aria-hidden className="mr-1.5">{o.emoji}</span>
                {o.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {vue === 'direction' ? (
          <CockpitDirection resume={resume} />
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="mb-4 rounded-xl bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-900">
              Tu regardes <strong>exactement l’écran que voit un professeur</strong> — le tien, avec tes
              matières et tes revenus. Pour piloter l’ensemble, repasse en{' '}
              <button onClick={() => changer('direction')} className="underline font-semibold">
                Direction
              </button>
              .
            </div>
            <TableauDeBordProf
              prof={prof}
              revenus={revenus}
              blocs={blocs}
              lienAffiliation={lienAffiliation}
              usurpePar={usurpePar}
            />
          </div>
        )}
      </main>
    </div>
  );
}
