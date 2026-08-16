'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SESSIONS_PLATEFORME,
  chargerSessionsPubliques,
  matieresDisponibles,
  sessionsPourMatiere,
  labelSession,
  libelleMatiere,
  type Examen,
  type Session,
} from '@/lib/sessions';

// Un formulaire = un seul examen. L'élève arrive déjà depuis l'univers bac OU brevet :
// jamais de bascule ici, c'était la source des inscriptions dans la mauvaise épreuve.
const THEME = {
  bac: {
    titre: 'Inscription Bac Blanc',
    epreuve: 'bac blanc',
    focus: 'focus:ring-purple-500',
    bouton: 'bg-purple-600 hover:bg-purple-700',
  },
  brevet: {
    titre: 'Inscription Brevet Blanc',
    epreuve: 'brevet blanc',
    focus: 'focus:ring-blue-600',
    bouton: 'bg-blue-700 hover:bg-blue-800',
  },
} as const;

export function FormInscription({ examen }: { examen: Examen }) {
  const t = THEME[examen];

  // Les épreuves proposées viennent de la base (`/api/sessions`) : un bac blanc
  // créé depuis /admin/bacs-blancs apparaît ici sans toucher au code. Le tableau
  // en dur ne sert plus que de secours si l'appel échoue.
  const [catalogue, setCatalogue] = useState<Session[]>(SESSIONS_PLATEFORME);
  useEffect(() => {
    let vivant = true;
    chargerSessionsPubliques().then((s) => {
      if (vivant) setCatalogue(s);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const MATIERES = useMemo(() => matieresDisponibles(examen, new Date(), catalogue), [examen, catalogue]);

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [emailParent, setEmailParent] = useState('');
  const [telephone, setTelephone] = useState('');
  const [matiereSaisie, setMatiere] = useState<string>('');
  const [dateEpreuve, setDateEpreuve] = useState('');
  // Le code du prof qui a recommandé les Matinées. Facultatif, mais c'est lui
  // qui déclenche les 10 € d'affiliation : sans champ, le lien `?ref=` d'un
  // prof ne laissait aucune trace et personne ne pouvait être payé.
  const [codeProf, setCodeProf] = useState('');
  const [parrain, setParrain] = useState<{ etat: 'vide' | 'cherche' | 'connu' | 'inconnu'; nom?: string }>({
    etat: 'vide',
  });

  const epreuve = t.epreuve;

  // La matière réellement cochée : celle qu'on a choisie si elle est encore
  // proposée, sinon la première de la liste. Calculée et non stockée — le
  // catalogue arrive de la base après le premier rendu, et un état qu'il
  // faudrait recorriger dans un effet finit toujours par afficher, une frame,
  // une matière que la base ne propose plus.
  const matiere = MATIERES.includes(matiereSaisie) ? matiereSaisie : (MATIERES[0] ?? matiereSaisie);

  // Arrivée depuis une session précise (« Réserver → » du calendrier) :
  // matière et date arrivent dans l'URL et pré-remplissent le formulaire.
  // L'effet se rejoue quand le catalogue arrive de la base : au montage, la
  // matière de l'URL peut n'exister que dans la liste chargée ensuite.
  const prefill = useRef(false);
  useEffect(() => {
    if (prefill.current) return;
    const p = new URLSearchParams(window.location.search);
    const m = p.get('matiere');
    const d = p.get('date');
    if (!m || !MATIERES.includes(m)) return;
    prefill.current = true;
    // setTimeout : ne pas poser d'état pendant le rendu de l'effet (Next 16).
    const t = setTimeout(() => {
      setMatiere(m);
      if (d && sessionsPourMatiere(m, new Date(), catalogue).some(s => s.date === d)) setDateEpreuve(d);
    }, 0);
    return () => clearTimeout(t);
  }, [MATIERES, catalogue]);

  // Arrivée par le lien d'affiliation d'un prof : `?ref=CLAIRE3F7B`. Le code
  // est aussi mémorisé par la vitrine, qui le repasse dans l'URL — l'élève
  // n'a donc rien à recopier, mais il voit et peut corriger ce qui est saisi.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (!ref) return;
    // setTimeout : ne pas poser d'état pendant le rendu de l'effet (Next 16).
    const minuteur = setTimeout(() => setCodeProf(ref.replace(/\s+/g, '').toUpperCase()), 0);
    return () => clearTimeout(minuteur);
  }, []);

  // Vérification du code pendant la frappe : « ✅ Recommandé par Claire M. »
  // vaut mieux qu'un code fautif découvert des semaines plus tard, au moment
  // de payer le prof.
  useEffect(() => {
    const code = codeProf.replace(/\s+/g, '').toUpperCase();
    if (code.length < 4) {
      const remise = setTimeout(() => setParrain({ etat: 'vide' }), 0);
      return () => clearTimeout(remise);
    }
    const minuteur = setTimeout(async () => {
      setParrain({ etat: 'cherche' });
      try {
        const res = await fetch(`/api/affiliation?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        setParrain(data.connu ? { etat: 'connu', nom: data.prof } : { etat: 'inconnu' });
      } catch {
        setParrain({ etat: 'vide' });
      }
    }, 400);
    return () => clearTimeout(minuteur);
  }, [codeProf]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dates de bacs blancs proposées pour la matière cochée
  const sessions = sessionsPourMatiere(matiere, new Date(), catalogue);

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
        body: JSON.stringify({
          nom: `${prenom.trim()} ${nom.trim()}`,
          email,
          email_parent: emailParent,
          telephone,
          matiere,
          date_epreuve: dateEpreuve || null,
          code_affiliation: codeProf.replace(/\s+/g, '').toUpperCase() || null,
        }),
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
        setCodeProf('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Erreur serveur' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur de connexion' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${t.focus} focus:border-transparent`;

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border border-gray-200">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">{t.titre}</h2>

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

        <label className="block text-sm text-gray-600">
          Code du professeur qui t’a recommandé{' '}
          <span className="text-gray-400">(facultatif)</span>
          <input
            type="text"
            placeholder="Ex. CLAIRE3F7B"
            value={codeProf}
            onChange={(e) => setCodeProf(e.target.value.replace(/\s+/g, '').toUpperCase())}
            className={`${inputClass} mt-1 font-mono tracking-wide`}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          {parrain.etat === 'connu' && (
            <span className="mt-1 block text-xs font-semibold text-green-700">
              ✅ Recommandé par {parrain.nom}
            </span>
          )}
          {parrain.etat === 'inconnu' && (
            <span className="mt-1 block text-xs text-amber-700">
              Ce code ne correspond à aucun professeur. Tu peux t’inscrire quand même, mais vérifie
              le lien qu’il t’a envoyé.
            </span>
          )}
          {parrain.etat === 'vide' && (
            <span className="mt-1 block text-xs text-gray-400">
              Laisse vide si tu viens de toi-même.
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={loading}
          className={`w-full ${t.bouton} text-white py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition`}
        >
          {loading ? '⏳ Inscription...' : `✍️ M'inscrire au ${epreuve}`}
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
