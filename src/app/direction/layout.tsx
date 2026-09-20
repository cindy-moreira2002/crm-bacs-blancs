import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { CoqueDirection } from '@/components/direction/CoqueDirection';
import { profConnecte } from '@/lib/authProf';
import { chargerCompteurs } from '@/lib/direction/compteurs';

export const dynamic = 'force-dynamic';

/**
 * Le manifeste n'est déclaré QUE sur /direction, pas dans la coque du site.
 * Sinon un élève venu s'inscrire se verrait proposer d'installer
 * « Direction MDB » sur son téléphone.
 */
export const metadata: Metadata = {
  title: 'Direction — Les Matinées du Bac',
  manifest: '/direction.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Direction MDB',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icons/direction-apple-180.png',
    icon: '/icons/direction-192.png',
  },
};

/** `viewportFit: cover` : sans lui, la barre du bas flotte au-dessus du vide. */
export const viewport: Viewport = {
  themeColor: '#2d1b4d',
  viewportFit: 'cover',
};

/**
 * La coque commune de /direction.
 *
 * Volontairement SANS contrôle d'accès : chaque page garde le sien (elles le
 * faisaient déjà, et c'est le bon endroit — une page protège sa donnée). Ce
 * fichier ne décide donc jamais qui entre ; il décide seulement d'afficher, ou
 * non, la navigation autour du contenu.
 *
 * Cette nuance a une conséquence utile : /direction/acces, la page où
 * l'administratrice choisit son tout premier mot de passe, s'affiche nue —
 * personne n'y est encore connecté, une barre de navigation vers des écrans
 * interdits n'aurait aucun sens.
 */
export default async function LayoutDirection({ children }: { children: ReactNode }) {
  const moi = await profConnecte();
  if (!moi || moi.role !== 'admin') return <>{children}</>;

  // Les compteurs sont rendus côté serveur : la première image de l'écran
  // porte déjà les bons chiffres, avant même le premier sondage.
  const compteurs = await chargerCompteurs();

  return (
    <CoqueDirection
      prenom={moi.prenom}
      nom={moi.nom}
      compteursInitiaux={{
        ...compteurs,
        aFaire:
          compteurs.correctionsBloquees + compteurs.dossiersARelire + compteurs.mainsLevees,
      }}
    >
      {children}
    </CoqueDirection>
  );
}
