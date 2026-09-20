'use client';

/**
 * Les chiffres de la Direction, tenus à jour tout seuls.
 *
 * Un seul sondage pour toute l'application : le fournisseur est posé dans la
 * coque (`CoqueDirection`), et chaque pastille lit le contexte. Sans ça, la
 * barre du haut, la barre du bas et l'accueil feraient trois appels chacun.
 *
 * Trois règles, apprises sur un autre projet :
 *  - **on s'arrête quand l'écran est caché** (`visibilitychange`). Un téléphone
 *    dans une poche ne doit rien consommer ;
 *  - **on redemande tout de suite au retour**, pour que l'écran soit à jour
 *    avant même que l'œil se pose dessus ;
 *  - **on rafraîchit la page quand un chiffre MONTE** (`router.refresh()`), pour
 *    que le contenu suive la pastille — mais jamais quand il descend, sinon
 *    valider un e-mail rechargerait l'écran sous les doigts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

export type Compteurs = {
  aValider: number;
  aFaire: number;
  correctionsBloquees: number;
  dossiersARelire: number;
  paiementsEnAttente: number;
  mainsLevees: number;
  le: string | null;
};

const VIDE: Compteurs = {
  aValider: 0,
  aFaire: 0,
  correctionsBloquees: 0,
  dossiersARelire: 0,
  paiementsEnAttente: 0,
  mainsLevees: 0,
  le: null,
};

const Contexte = createContext<Compteurs>(VIDE);

/** Les chiffres du moment. Utilisable partout sous la coque Direction. */
export function useLive(): Compteurs {
  return useContext(Contexte);
}

const PERIODE_MS = 20_000;

export function LiveDirection({
  children,
  initiaux,
}: {
  children: ReactNode;
  /** Chiffres rendus côté serveur : l'écran n'est jamais vide au premier affichage. */
  initiaux?: Partial<Compteurs>;
}) {
  const [compteurs, setCompteurs] = useState<Compteurs>({ ...VIDE, ...initiaux });
  const router = useRouter();
  const precedents = useRef<Compteurs>({ ...VIDE, ...initiaux });

  const relever = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      const res = await fetch('/api/direction/compteurs', { cache: 'no-store' });
      if (!res.ok) return;
      const recus = (await res.json()) as Partial<Compteurs>;
      const frais: Compteurs = { ...VIDE, ...recus };
      // `aFaire` n'a pas de compteur bon marché : on additionne ce qui bloque.
      frais.aFaire = frais.correctionsBloquees + frais.dossiersARelire + frais.mainsLevees;

      const avant = precedents.current;
      const monte =
        frais.aValider > avant.aValider ||
        frais.correctionsBloquees > avant.correctionsBloquees ||
        frais.dossiersARelire > avant.dossiersARelire ||
        frais.paiementsEnAttente > avant.paiementsEnAttente ||
        frais.mainsLevees > avant.mainsLevees;

      precedents.current = frais;
      setCompteurs(frais);
      if (monte && avant.le) router.refresh();
    } catch {
      // Réseau coupé : on garde les derniers chiffres connus, sans rien casser.
    }
  }, [router]);

  useEffect(() => {
    // Différé d'un tick : un setState synchrone dans le corps d'un effet est
    // refusé par la règle react-hooks de Next 16 (même motif que TableauProfs).
    const premier = setTimeout(relever, 0);
    const minuteur = setInterval(relever, PERIODE_MS);
    const auRetour = () => {
      if (document.visibilityState === 'visible') relever();
    };
    document.addEventListener('visibilitychange', auRetour);
    window.addEventListener('focus', auRetour);
    return () => {
      clearTimeout(premier);
      clearInterval(minuteur);
      document.removeEventListener('visibilitychange', auRetour);
      window.removeEventListener('focus', auRetour);
    };
  }, [relever]);

  return <Contexte.Provider value={compteurs}>{children}</Contexte.Provider>;
}
