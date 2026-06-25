'use client';

import { useState } from 'react';

type Matiere = 'Français' | 'Philosophie' | 'Mathématiques' | 'Histoire-Géo' | 'SES' | 'Spécialité 1' | 'Spécialité 2';

const MATIERES: Matiere[] = ['Français', 'Philosophie', 'Mathématiques', 'Histoire-Géo', 'SES', 'Spécialité 1', 'Spécialité 2'];

export function FormInscription() {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [emailParent, setEmailParent] = useState('');
  const [telephone, setTelephone] = useState('');
  const [matiere, setMatiere] = useState<Matiere>('Français');
  const [dateEpreuve, setDateEpreuve] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const validatePhone = (p: string) => /^[\d\s\-\+\(\)]{10,}$/.test(p.replace(/\s/g, ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!nom.trim()) {
      setMessage({ type: 'error', text: 'Nom de l\'élève requis' });
      return;
    }
    if (!validateEmail(email)) {
      setMessage({ type: 'error', text: 'Email de l\'élève invalide' });
      return;
    }
    if (!validateEmail(emailParent)) {
      setMessage({ type: 'error', text: 'Email du parent invalide' });
      return;
    }
    if (!validatePhone(telephone)) {
      setMessage({ type: 'error', text: 'Téléphone du parent invalide (min 10 chiffres)' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/inscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, email, email_parent: emailParent, telephone, matiere, date_epreuve: dateEpreuve || null }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: '✅ Inscription confirmée !' });
        setNom('');
        setEmail('');
        setEmailParent('');
        setTelephone('');
        setMatiere('Français');
        setDateEpreuve('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Erreur serveur' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erreur de connexion' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent';

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border border-gray-200">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Inscription Bac Blanc</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Nom de l'élève"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className={inputClass}
          required
        />

        <input
          type="email"
          placeholder="Email de l'élève"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          required
        />

        <input
          type="email"
          placeholder="Email du parent"
          value={emailParent}
          onChange={(e) => setEmailParent(e.target.value)}
          className={inputClass}
          required
        />

        <input
          type="tel"
          placeholder="Téléphone du parent"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          className={inputClass}
          required
        />

        <select
          value={matiere}
          onChange={(e) => setMatiere(e.target.value as Matiere)}
          className={inputClass}
        >
          {MATIERES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label className="block text-sm text-gray-600">
          Date de l&apos;épreuve (bac blanc)
          <input
            type="date"
            value={dateEpreuve}
            onChange={(e) => setDateEpreuve(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 text-white py-2 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? '⏳ Inscription...' : '✍️ M\'inscrire'}
        </button>
      </form>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${
          message.type === 'success'
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
