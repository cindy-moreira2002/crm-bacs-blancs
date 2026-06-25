'use client';

import { useState, useEffect } from 'react';

type Matiere = 'Français' | 'Philosophie' | 'Mathématiques' | 'Histoire-Géo' | 'SES' | 'Spécialité 1' | 'Spécialité 2';

const MATIERES: Matiere[] = ['Français', 'Philosophie', 'Mathématiques', 'Histoire-Géo', 'SES', 'Spécialité 1', 'Spécialité 2'];

const IMPRESSIONS = ['Très insuffisant', 'Fragile', 'Satisfaisant', 'Bon', 'Très bon'];

const POINTS_FORTS = [
  'Sujet bien compris',
  'Plan structuré et progressif',
  'Problématique claire',
  'Références / exemples précis',
  'Raisonnement rigoureux',
  'Expression soignée',
  'Introduction et conclusion solides',
];

const POINTS_FAIBLES = [
  'Hors-sujet partiel',
  'Paraphrase / manque d\'analyse',
  'Plan déséquilibré ou confus',
  'Manque de références / exemples',
  'Raisonnement incomplet',
  'Problématique faible ou absente',
  'Fautes de langue / expression',
  'Copie inachevée (gestion du temps)',
];

const PDF_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAX_MO = 8;

type FormCopieProps = {
  submitLabel?: string;
  onSubmitted?: () => void;
  onCancel?: () => void;
  initialNom?: string;
  initialEmail?: string;
  initialMatiere?: Matiere;
  // Quand l'élève vient d'une inscription : on masque/verrouille nom, email et matière
  lockEleve?: boolean;
};

export function FormCopie({
  submitLabel, onSubmitted, onCancel,
  initialNom = '', initialEmail = '', initialMatiere, lockEleve = false,
}: FormCopieProps = {}) {
  const [matiere, setMatiere] = useState<Matiere>(initialMatiere ?? 'Français');
  const [eleveNom, setEleveNom] = useState(initialNom);
  const [eleveEmail, setEleveEmail] = useState(initialEmail);
  const [profEmail, setProfEmail] = useState('');
  const [copieTexte, setCopieTexte] = useState('');
  const [fichierBase64, setFichierBase64] = useState('');
  const [fichierType, setFichierType] = useState('');
  const [fichierNom, setFichierNom] = useState('');
  const [impression, setImpression] = useState('');
  const [forts, setForts] = useState<string[]>([]);
  const [faibles, setFaibles] = useState<string[]>([]);
  const [commentaire, setCommentaire] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (document.getElementById('pdfjs-lib')) return;
    const s = document.createElement('script');
    s.id = 'pdfjs-lib';
    s.src = PDF_JS;
    document.body.appendChild(s);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ensurePdfJs = (): Promise<any> => new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.pdfjsLib) return resolve(w.pdfjsLib);
    let tries = 0;
    const t = setInterval(() => {
      if (w.pdfjsLib) { clearInterval(t); resolve(w.pdfjsLib); }
      else if (++tries > 50) { clearInterval(t); reject(new Error('pdf.js non chargé')); }
    }, 100);
  });

  const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const toggle = (list: string[], setList: (v: string[]) => void, val: string) => {
    setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);

    if (file.size > MAX_MO * 1024 * 1024) {
      setMessage({ type: 'error', text: `Fichier trop lourd (max ${MAX_MO} Mo).` });
      return;
    }

    // Toujours stocker le fichier (sert pour le manuscrit lu par vision)
    setFichierNom(file.name);
    setFichierType(file.type);
    setFichierBase64(await toBase64(file));

    // Fichier texte → remplit le texte
    if (file.type === 'text/plain') {
      setCopieTexte(await file.text());
      setMessage({ type: 'success', text: 'Fichier texte chargé.' });
      return;
    }

    // Image (photo de copie manuscrite) → pas d'extraction, l'image suffit
    if (file.type.startsWith('image/')) {
      setMessage({ type: 'success', text: 'Photo de copie chargée. L\'écriture sera lue à la correction (pas besoin de coller le texte).' });
      return;
    }

    // PDF → tente l'extraction de texte (PDF numérique). Si scan, on garde l'image.
    if (file.type === 'application/pdf') {
      setPdfLoading(true);
      try {
        const pdfjsLib = await ensurePdfJs();
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let texte = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          texte += content.items.map((it: any) => it.str).join(' ') + '\n\n';
        }
        texte = texte.trim();
        if (texte.length < 20) {
          setMessage({ type: 'success', text: 'PDF chargé. C\'est un scan (manuscrit) → l\'écriture sera lue à la correction, pas besoin de coller le texte.' });
        } else {
          setCopieTexte(texte);
          setMessage({ type: 'success', text: `PDF lu (${pdf.numPages} page(s)). Vérifie le texte ci-dessous.` });
        }
      } catch (err) {
        setMessage({ type: 'success', text: 'PDF chargé. Le texte sera lu à la correction.' });
      } finally {
        setPdfLoading(false);
      }
      return;
    }

    setMessage({ type: 'error', text: 'Format non supporté. Utilise PDF, photo (jpg/png) ou .txt.' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!eleveNom.trim()) {
      setMessage({ type: 'error', text: 'Nom de l\'élève requis' });
      return;
    }
    // Il faut SOIT un fichier (image/PDF/scan) SOIT du texte collé
    if (!fichierBase64 && copieTexte.trim().length < 20) {
      setMessage({ type: 'error', text: 'Upload une copie (PDF/photo) ou colle le texte.' });
      return;
    }

    setLoading(true);
    try {
      const remarques = { impression, points_forts: forts, points_faibles: faibles, commentaire };
      const res = await fetch('/api/copies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matiere,
          eleve_nom: eleveNom,
          eleve_email: eleveEmail,
          prof_email: profEmail,
          copie_texte: copieTexte,
          fichier_base64: fichierBase64,
          fichier_type: fichierType,
          fichier_nom: fichierNom,
          remarques,
          notes_prof: commentaire,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Copie envoyée. Elle est dans la file à corriger.' });
        setEleveNom(''); setEleveEmail(''); setProfEmail(''); setCopieTexte('');
        setFichierBase64(''); setFichierType(''); setFichierNom('');
        setImpression(''); setForts([]); setFaibles([]); setCommentaire('');
        setMatiere('Français');
        onSubmitted?.();
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
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg border border-gray-200">
      <h2 className="text-2xl font-bold mb-1 text-gray-800">
        {lockEleve && eleveNom ? `Corriger la copie de ${eleveNom}` : 'Déposer une copie à corriger'}
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        {lockEleve
          ? `${matiere}${eleveEmail ? ` — ${eleveEmail}` : ''}. Ajoute la copie et tes remarques.`
          : 'Espace prof — PDF, photo de copie manuscrite, ou texte collé.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {!lockEleve && (
          <>
            <select value={matiere} onChange={(e) => setMatiere(e.target.value as Matiere)} className={inputClass}>
              {MATIERES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>

            <input type="text" placeholder="Nom de l'élève" value={eleveNom}
              onChange={(e) => setEleveNom(e.target.value)} className={inputClass} required />

            <input type="email" placeholder="Email de l'élève (optionnel)" value={eleveEmail}
              onChange={(e) => setEleveEmail(e.target.value)} className={inputClass} />
          </>
        )}

        <input type="email" placeholder="Ton email (prof) — pour être prévenu quand la correction est prête" value={profEmail}
          onChange={(e) => setProfEmail(e.target.value)} className={inputClass} required />

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Copie de l'élève — PDF, photo (manuscrit OK) ou texte</label>
          <input type="file" accept=".pdf,.txt,.jpg,.jpeg,.png" onChange={handleFile}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200" />
          {pdfLoading && <p className="text-sm text-purple-600 mt-2">Lecture du PDF…</p>}
          {fichierNom && <p className="text-sm text-gray-500 mt-2">{fichierNom}</p>}
          <textarea placeholder="Texte de la copie (rempli auto pour un PDF/texte numérique — laisse vide pour une copie manuscrite)"
            value={copieTexte} onChange={(e) => setCopieTexte(e.target.value)} rows={6}
            className={`${inputClass} mt-3`} />
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-200">
          <p className="font-semibold text-gray-800">Tes remarques de prof</p>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Impression générale</label>
            <select value={impression} onChange={(e) => setImpression(e.target.value)} className={inputClass}>
              <option value="">— Choisir —</option>
              {IMPRESSIONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-2">Points forts repérés</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {POINTS_FORTS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={forts.includes(p)} onChange={() => toggle(forts, setForts, p)}
                    className="accent-purple-600 w-4 h-4" />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-2">Points à travailler</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {POINTS_FAIBLES.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={faibles.includes(p)} onChange={() => toggle(faibles, setFaibles, p)}
                    className="accent-purple-600 w-4 h-4" />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Remarque libre (optionnel)</label>
            <textarea placeholder="Contexte du sujet, remarque particulière…" value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)} rows={3} className={inputClass} />
          </div>
        </div>

        <div className="flex gap-3">
          {onCancel && (
            <button type="button" onClick={onCancel}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
              Retour
            </button>
          )}
          <button type="submit" disabled={loading || pdfLoading}
            className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
            {loading ? 'Envoi...' : (submitLabel ?? 'Déposer la copie')}
          </button>
        </div>
      </form>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
