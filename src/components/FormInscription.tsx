'use client';

import { useEffect, useState } from 'react';
import { matieresDisponibles, sessionsPourMatiere, labelSession, libelleMatiere, type Examen } from '@/lib/sessions';

const MATIERES_BAC = matieresDisponibles('bac');
const MATIERES_BREVET = matieresDisponibles('brevet');
const matieresDe = (e: Examen) => (e === 'brevet' ? MATIERES_BREVET : MATIERES_BAC);

export function FormInscription() {
  const [examen, setExamen] = useState<Examen>('bac');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [emailParent, setEmailParent] = useState('');
  const [telephone, setTelephone] = useState('');
  const [matiere, setMatiere] = useState<string>(MATIERES_BAC[0] ?? '');
  const [dateEpreuve, setDateEpreuve] = useState('');

  const MATIERES = matieresDe(examen);
  const epreuve = examen === 'brevet' ? 'brevet blanc' : 'bac blanc';

  // Bascule bac ↔ brevet : on repart sur la première matière de l'univers choisi.
  const changerExamen = (e: Examen) => {
    setExamen(e);
    setMatiere(matieresDe(e)[0] ?? '');
    setDateEpreuve('');
  };

  // Arrivée depuis une session précise (« S'inscrire → » du site ou de l'espace élève) :
  // examen, matière et date arrivent dans l'URL et pré-remplissent le formulaire.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ex: Examen = p.get('examen') === 'brevet' ? 'brevet' : 'bac';
    const dispo = matieresDe(ex);
    setExamen(ex);
    const m = p.get('matiere');
    const d = p.get('date');
    if (m && dispo.includes(m)) {
      setMatiere(m);
      if (d && sessionsPourMatiere(m).some(s => s.date === d)) setDateEpreuve(d);
    } else {
      setMatiere(dispo[0] ?? '');
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dates de bacs blancs proposées pour la matière cochée
  const sessions = sessionsPourMatiere(matiere);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const validatePhone = (p: string) => /^[\d\s\-\+\(\)]{10,}$/.test(p.replace(/\s/g, ''));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!prenom.trim()) {
      setMessage({ type: 'error', text: 'Prénom de l\'élève requis' });
      return;
    }
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
    if (sessions.length > 0 && !dateEpreuve) {
      setMessage({ type: 'error', text: `Choisis une date de ${epreuve}` });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/inscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: `${prenom.trim()} ${nom.trim()}`, email, email_parent: emailParent, telephone, matiere, date_epreuve: dateEpreuve || null }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: '✅ Inscription confirmée !' });
        setPrenom('');
        setNom('');
        setEmail('');
        setEmailParent('');
        setTelephone('');
        setMatiere(MATIERES[0] ?? '');
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
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        {examen === 'brevet' ? 'Inscription Brevet Blanc' : 'Inscription Bac Blanc'}
      </h2>

      {/* Bascule Bac ↔ Brevet — même logique que l'interrupteur du site vitrine */}
      <div className="flex gap-1 p-1 mb-6 bg-gray-100 rounded-full">
        {(['bac', 'brevet'] as Examen[]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => changerExamen(e)}
            disabled={matieresDe(e).length === 0}
            className={`flex-1 py-2 rounded-full text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
              examen === e ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {e === 'bac' ? '🎓 Le Bac' : '📘 Le Brevet'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Prénom de l'élève"
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          className={inputClass}
          required
        />

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

        <label className="block text-sm text-gray-600">
          Matière
          <select
            value={matiere}
            onChange={(e) => { setMatiere(e.target.value); setDateEpreuve(''); }}
            className={`${inputClass} mt-1`}
          >
            {MATIERES.map((m) => (
              <option key={m} value={m}>
                {libelleMatiere(m)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-gray-600">
          Prochaine date de {epreuve}
          <select
            value={dateEpreuve}
            onChange={(e) => setDateEpreuve(e.target.value)}
            className={`${inputClass} mt-1`}
            disabled={sessions.length === 0}
          >
            <option value="">
              {sessions.length === 0 ? 'Aucune date ouverte pour cette matière' : '— Choisis une date —'}
            </option>
            {sessions.map((s) => (
              <option key={s.date} value={s.date}>
                {labelSession(s)}
              </option>
            ))}
          </select>
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
