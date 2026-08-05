'use client';

/**
 * Formulaire de création du compte admin : prénom, nom, mot de passe choisi
 * par l'administratrice (jamais visible de quiconque d'autre). Succès →
 * session ouverte côté serveur → direction la page de pilotage.
 */
import { useState } from 'react';

export function FormulaireAccesAdmin({ jeton, email }: { jeton: string; email: string }) {
  const [prenom, setPrenom] = useState('Cindy');
  const [nom, setNom] = useState('');
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [voir, setVoir] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const controleLocal = (): string | null => {
    if (!prenom.trim() || !nom.trim()) return 'Prénom et nom sont obligatoires.';
    if (mdp.length < 10) return 'Le mot de passe doit faire au moins 10 caractères.';
    if (!/[a-zA-Z]/.test(mdp)) return 'Le mot de passe doit contenir au moins une lettre.';
    if (!/[0-9]/.test(mdp)) return 'Le mot de passe doit contenir au moins un chiffre.';
    if (mdp !== mdp2) return 'Les deux mots de passe ne correspondent pas.';
    return null;
  };

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    const probleme = controleLocal();
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch('/api/admin/acces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton, prenom: prenom.trim(), nom: nom.trim(), motDePasse: mdp }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
      window.location.href = '/admin/correction';
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inconnue');
      setEnvoi(false);
    }
  };

  const champ =
    'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400';

  return (
    <form onSubmit={envoyer} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Adresse e-mail</label>
        <p className="text-sm font-semibold text-gray-900 bg-gray-50 rounded-xl px-3 py-2.5">{email}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="prenom" className="block text-xs font-medium text-gray-500 mb-1">
            Prénom
          </label>
          <input id="prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} className={champ} />
        </div>
        <div>
          <label htmlFor="nom" className="block text-xs font-medium text-gray-500 mb-1">
            Nom
          </label>
          <input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} className={champ} placeholder="Moreira" />
        </div>
      </div>

      <div>
        <label htmlFor="mdp" className="block text-xs font-medium text-gray-500 mb-1">
          Ton mot de passe <span className="text-gray-400">(10 caractères min., une lettre, un chiffre)</span>
        </label>
        <div className="relative">
          <input
            id="mdp"
            type={voir ? 'text' : 'password'}
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
            className={champ}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setVoir(!voir)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
          >
            {voir ? 'cacher' : 'voir'}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="mdp2" className="block text-xs font-medium text-gray-500 mb-1">
          Confirme-le
        </label>
        <input
          id="mdp2"
          type={voir ? 'text' : 'password'}
          value={mdp2}
          onChange={(e) => setMdp2(e.target.value)}
          className={champ}
          autoComplete="new-password"
        />
      </div>

      {erreur && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{erreur}</p>}

      <button
        type="submit"
        disabled={envoi}
        className="w-full rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 text-sm transition-colors"
      >
        {envoi ? 'Création en cours…' : 'Créer mon accès et ouvrir le pilotage'}
      </button>
    </form>
  );
}
