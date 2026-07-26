'use client';

/**
 * Candidature « Devenir coach » + connexion, dans le même écran.
 *
 * Le mot de passe ne quitte ce composant que vers /api/prof/inscription, en
 * HTTPS. Il n'est ni stocké dans le navigateur, ni renvoyé par l'API.
 */
import { useState } from 'react';
import { MATIERES_ENSEIGNEES } from '@/lib/sessions';

type Onglet = 'candidature' | 'connexion';

const inputClass =
  'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent';

/** Retour visuel simple sur la robustesse du mot de passe. */
function forceMotDePasse(mdp: string): { niveau: 0 | 1 | 2 | 3; texte: string } {
  if (!mdp) return { niveau: 0, texte: '' };
  const assezLong = mdp.length >= 10;
  const lettre = /[a-zA-Z]/.test(mdp);
  const chiffre = /[0-9]/.test(mdp);
  if (!assezLong) return { niveau: 1, texte: 'Trop court — il faut au moins 10 caractères.' };
  if (!lettre || !chiffre) return { niveau: 2, texte: 'Ajoute au moins une lettre et un chiffre.' };
  if (mdp.length >= 14) return { niveau: 3, texte: 'Mot de passe solide.' };
  return { niveau: 3, texte: 'Mot de passe valide.' };
}

export function CandidatureProf() {
  const [onglet, setOnglet] = useState<Onglet>('candidature');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [matieres, setMatieres] = useState<string[]>([]);
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const force = forceMotDePasse(motDePasse);

  const basculerMatiere = (m: string) =>
    setMatieres((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const candidater = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);

    if (matieres.length === 0) {
      setErreur('Choisis au moins une matière enseignée.');
      return;
    }
    if (force.niveau < 3) {
      setErreur(force.texte || 'Choisis un mot de passe plus solide.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne sont pas identiques.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/prof/inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prenom, nom, email, telephone, matieres, motDePasse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error || 'Erreur serveur.');
        return;
      }
      // Le cookie de session est déjà posé par l'API : direction le tableau de bord.
      window.location.href = '/espace-prof';
    } catch {
      setErreur('Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  };

  const seConnecter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setLoading(true);
    try {
      const res = await fetch('/api/prof/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, motDePasse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error || 'Erreur serveur.');
        return;
      }
      window.location.href = '/espace-prof';
    } catch {
      setErreur('Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Onglets */}
      <div className="flex border-b border-gray-200">
        {(['candidature', 'connexion'] as Onglet[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => { setOnglet(o); setErreur(null); }}
            className={`flex-1 py-3.5 text-sm font-semibold transition ${
              onglet === o
                ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {o === 'candidature' ? 'Candidater' : 'J’ai déjà un compte'}
          </button>
        ))}
      </div>

      <div className="p-6">
        {onglet === 'candidature' ? (
          <form onSubmit={candidater} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Prénom" value={prenom}
                onChange={(e) => setPrenom(e.target.value)} className={inputClass} required />
              <input type="text" placeholder="Nom" value={nom}
                onChange={(e) => setNom(e.target.value)} className={inputClass} required />
            </div>

            <input type="email" placeholder="Adresse e-mail" value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputClass} required />

            <input type="tel" placeholder="Téléphone (facultatif)" value={telephone}
              onChange={(e) => setTelephone(e.target.value)} className={inputClass} />

            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">
                Matière(s) enseignée(s)
              </legend>
              <div className="flex flex-wrap gap-2">
                {MATIERES_ENSEIGNEES.map((m) => {
                  const choisie = matieres.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => basculerMatiere(m)}
                      aria-pressed={choisie}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                        choisie
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Tu ne verras que les bacs blancs de ces matières.
              </p>
            </fieldset>

            <div>
              <div className="relative">
                <input
                  type={afficherMdp ? 'text' : 'password'}
                  placeholder="Mot de passe"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  className={`${inputClass} pr-16`}
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setAfficherMdp((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-purple-600 font-medium">
                  {afficherMdp ? 'Masquer' : 'Voir'}
                </button>
              </div>
              {motDePasse && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        force.niveau === 3 ? 'w-full bg-green-500'
                          : force.niveau === 2 ? 'w-2/3 bg-amber-400'
                          : 'w-1/3 bg-red-400'
                      }`}
                    />
                  </div>
                  <p className={`text-xs mt-1 ${force.niveau === 3 ? 'text-green-700' : 'text-amber-600'}`}>
                    {force.texte}
                  </p>
                </div>
              )}
            </div>

            <input
              type={afficherMdp ? 'text' : 'password'}
              placeholder="Confirme le mot de passe"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
              required
            />

            <div className="flex gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <span aria-hidden className="text-lg leading-none">🔐</span>
              <p className="text-xs text-amber-900 leading-relaxed">
                <strong>Conserve ton mot de passe dans un endroit sûr</strong> (gestionnaire de
                mots de passe, carnet fermé). Il est chiffré : personne, pas même
                l’administratrice, ne peut le relire pour te le redonner. En cas d’oubli, il faudra
                en définir un nouveau.
              </p>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 transition">
              {loading ? 'Envoi…' : 'Candidater maintenant'}
            </button>
          </form>
        ) : (
          <form onSubmit={seConnecter} className="space-y-4">
            <input type="email" placeholder="Adresse e-mail" value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputClass}
              autoComplete="email" required />
            <input type="password" placeholder="Mot de passe" value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)} className={inputClass}
              autoComplete="current-password" required />
            <button type="submit" disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 transition">
              {loading ? 'Connexion…' : 'Me connecter'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              Mot de passe oublié ? Écris à l’administratrice : elle peut t’en redéfinir un.
            </p>
          </form>
        )}

        {erreur && (
          <div className="mt-4 p-3 rounded-lg text-sm font-medium bg-red-100 text-red-800">
            {erreur}
          </div>
        )}
      </div>
    </div>
  );
}
