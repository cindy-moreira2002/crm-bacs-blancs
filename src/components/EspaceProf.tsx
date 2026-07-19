'use client';

import { useEffect, useRef, useState } from 'react';
import { DOSSIER_CSS } from '@/lib/dossierStyle';
import { FormCopie } from '@/components/FormCopie';

type Copie = {
  id: string;
  matiere: string;
  eleve_nom: string;
  eleve_email: string | null;
  fichier_nom: string | null;
  statut: string;
  correction_texte: string | null;
  pdf_pret: boolean;
  a_envoyer: boolean;
  envoye: boolean;
  created_at: string;
};

type Inscrit = {
  id: string;
  nom: string;
  email: string | null;
  matiere: string;
  created_at: string;
};

type EnCorrection = { nom: string; email: string; matiere: string };

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

// --- Mode démonstration (URL ?demo=1) : bac blanc de septembre, élèves fictifs.
// N'affecte jamais la prod : activé uniquement par le paramètre d'URL.
const DEMO_INSCRITS: Inscrit[] = [
  { id: 'demo-emma',   nom: 'Emma Rousseau',   email: 'emma.rousseau@exemple.fr',   matiere: 'Français',    created_at: '2026-09-14T09:00:00Z' },
  { id: 'demo-lucas',  nom: 'Lucas Bernard',   email: 'lucas.bernard@exemple.fr',   matiere: 'Français',    created_at: '2026-09-14T09:05:00Z' },
  { id: 'demo-jade',   nom: 'Jade Moreau',     email: 'jade.moreau@exemple.fr',     matiere: 'Français',    created_at: '2026-09-14T09:12:00Z' },
  { id: 'demo-nathan', nom: 'Nathan Lefebvre', email: 'nathan.lefebvre@exemple.fr', matiere: 'Philosophie', created_at: '2026-09-21T09:00:00Z' },
  { id: 'demo-chloe',  nom: 'Chloé Girard',    email: 'chloe.girard@exemple.fr',    matiere: 'Philosophie', created_at: '2026-09-21T09:08:00Z' },
];

export function EspaceProf() {
  const [copies, setCopies] = useState<Copie[]>([]);
  const [inscrits, setInscrits] = useState<Inscrit[]>([]);
  const [active, setActive] = useState<Copie | null>(null);
  const [correction, setCorrection] = useState<EnCorrection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>('');
  const [filtreMatiere, setFiltreMatiere] = useState<string>('');
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('espaceprof_matiere');
    if (saved) setFiltreMatiere(saved);
  }, []);

  const changerFiltre = (m: string) => {
    setFiltreMatiere(m);
    localStorage.setItem('espaceprof_matiere', m);
  };

  const charger = async () => {
    try {
      const demo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';
      if (demo) {
        setCopies([]);
        setInscrits(DEMO_INSCRITS);
        return;
      }
      const [rc, ri] = await Promise.all([
        fetch('/api/copies').then((r) => r.json()),
        fetch('/api/inscriptions').then((r) => r.json()),
      ]);
      setCopies(rc.copies || []);
      setInscrits(ri.inscriptions || []);
      if (active) {
        const maj = (rc.copies || []).find((c: Copie) => c.id === active.id);
        if (maj) setActive(maj);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, []);

  // Retrouve la copie déposée pour un inscrit (par email, sinon par nom + matière)
  const copieDe = (i: Inscrit): Copie | undefined =>
    copies.find((c) =>
      norm(c.matiere) === norm(i.matiere) &&
      ((i.email && norm(c.eleve_email) === norm(i.email)) || norm(c.eleve_nom) === norm(i.nom))
    );

  const genererPdf = async (c: Copie) => {
    if (!c.correction_texte) return;
    setBusy('gen-' + c.id);
    try {
      await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, body: c.correction_texte, filename: `Dossier_${c.eleve_nom}` }),
      });
      await charger();
    } finally { setBusy(''); }
  };

  const envoyerEleve = async (c: Copie) => {
    if (!c.eleve_email) { alert("Pas d'email élève sur cette copie."); return; }
    if (!confirm(`Envoyer le dossier de ${c.eleve_nom} à ${c.eleve_email} ?`)) return;
    setBusy('send-' + c.id);
    try {
      await fetch('/api/copies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, a_envoyer: true }),
      });
      await charger();
    } finally { setBusy(''); }
  };

  const enregistrer = async () => {
    if (!active || !editRef.current) return;
    setBusy('save');
    try {
      const html = editRef.current.innerHTML;
      await fetch('/api/copies', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: active.id, correction_texte: html }),
      });
      setCopies((cs) => cs.map((c) => (c.id === active.id ? { ...c, correction_texte: html, pdf_pret: false } : c)));
    } finally { setBusy(''); }
  };

  const statutEnvoi = (c: Copie) => {
    if (c.envoye) return <span className="text-green-700 text-xs font-medium">Envoyé</span>;
    if (c.a_envoyer) return <span className="text-amber-600 text-xs font-medium">Envoi en cours…</span>;
    return <span className="text-gray-400 text-xs">Pas encore envoyé</span>;
  };

  // --- Vue dépôt/correction d'une copie (élève pré-rempli depuis l'inscription) ---
  if (correction) {
    return (
      <div>
        <style dangerouslySetInnerHTML={{ __html: DOSSIER_CSS }} />
        <FormCopie
          lockEleve
          initialNom={correction.nom}
          initialEmail={correction.email}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialMatiere={correction.matiere as any}
          submitLabel="Générer la correction finale"
          onCancel={() => setCorrection(null)}
          onSubmitted={() => { setCorrection(null); charger(); }}
        />
      </div>
    );
  }

  const toutesLesMatieres = Array.from(new Set(inscrits.map((i) => i.matiere))).sort();

  const inscritsFiltres = filtreMatiere
    ? inscrits.filter((i) => i.matiere === filtreMatiere)
    : inscrits;

  const copiesFiltrees = filtreMatiere
    ? copies.filter((c) => c.matiere === filtreMatiere)
    : copies;

  // Groupe les inscrits par bac blanc (matière)
  const parMatiere = inscritsFiltres.reduce<Record<string, Inscrit[]>>((acc, i) => {
    (acc[i.matiere] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: DOSSIER_CSS }} />

      {/* Filtre matière */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-gray-700">Ma matière :</label>
        <select
          value={filtreMatiere}
          onChange={(e) => changerFiltre(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">— Toutes —</option>
          {toutesLesMatieres.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {filtreMatiere && (
          <span className="text-xs text-gray-400">Filtrée par matière · <button onClick={() => changerFiltre('')} className="text-purple-600 hover:underline">Tout voir</button></span>
        )}
      </div>

      {/* Élèves inscrits, par bac blanc */}
      {loading && <p className="text-gray-500 mb-6">Chargement…</p>}
      {!loading && inscrits.length === 0 && (
        <p className="text-gray-500 mb-6">Aucun élève inscrit pour le moment.</p>
      )}

      {Object.entries(parMatiere).map(([matiere, eleves]) => (
        <div key={matiere} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Bac blanc — {matiere}</h2>
              <p className="text-xs text-gray-500">{eleves.length} élève(s) inscrit(s)</p>
            </div>
          </div>
          <div className="grid gap-3">
            {eleves.map((i) => {
              const c = copieDe(i);
              return (
                <div key={i.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-4">
                  {/* Nom + email */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-base">{i.nom}</p>
                    <p className="text-xs text-gray-400 truncate">{i.email || '—'}</p>
                  </div>
                  {/* Copie */}
                  <div className="text-xs text-center min-w-[90px]">
                    {c && c.fichier_nom
                      ? <a href={`/api/copies/fichier?id=${c.id}`} target="_blank" rel="noreferrer"
                          className="text-purple-600 hover:underline">Voir copie</a>
                      : <span className="text-gray-300">Pas de copie</span>}
                  </div>
                  {/* Salon visio */}
                  <a
                    href={`https://meet.jit.si/matineesdubac-${i.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Rejoindre le salon
                  </a>
                  {/* Correction */}
                  {c && c.statut === 'corrigée'
                    ? <button onClick={() => setActive(c)}
                        className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 flex-shrink-0">
                        Ouvrir correction
                      </button>
                    : <button
                        onClick={() => setCorrection({ nom: i.nom, email: i.email || '', matiere: i.matiere })}
                        className="text-xs px-3 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 flex-shrink-0">
                        Corriger →
                      </button>}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Suivi des corrections déposées : statut, PDF, envoi */}
      {copiesFiltrees.length > 0 && (
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800">Suivi des corrections</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white text-gray-500">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Élève</th>
                <th className="text-left px-5 py-2 font-medium">Matière</th>
                <th className="text-left px-5 py-2 font-medium">Correction</th>
                <th className="text-left px-5 py-2 font-medium">PDF</th>
                <th className="text-left px-5 py-2 font-medium">Envoi à l'élève</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {copiesFiltrees.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{c.eleve_nom}</td>
                  <td className="px-5 py-3 text-gray-600">{c.matiere}</td>
                  <td className="px-5 py-3">
                    {c.statut === 'corrigée'
                      ? <span className="text-green-700 text-xs">Corrigée</span>
                      : <span className="text-amber-600 text-xs">À corriger</span>}
                  </td>
                  <td className="px-5 py-3">
                    {c.statut !== 'corrigée' ? <span className="text-gray-300 text-xs">—</span>
                      : c.pdf_pret
                        ? <a href={`/api/copies/pdf?id=${c.id}`} className="text-purple-600 text-xs font-medium hover:underline">Télécharger</a>
                        : <button onClick={() => genererPdf(c)} disabled={busy !== ''}
                            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50">
                            {busy === 'gen-' + c.id ? '…' : 'Générer'}
                          </button>}
                  </td>
                  <td className="px-5 py-3">
                    {!c.pdf_pret ? <span className="text-gray-300 text-xs">—</span>
                      : c.envoye || c.a_envoyer ? statutEnvoi(c)
                        : <button onClick={() => envoyerEleve(c)} disabled={busy !== ''}
                            className="text-xs px-3 py-1 rounded bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50">
                            {busy === 'send-' + c.id ? '…' : 'Envoyer'}
                          </button>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {c.statut === 'corrigée' &&
                      <button onClick={() => setActive(c)} className="text-xs text-purple-600 hover:underline">Ouvrir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Éditeur du dossier de correction */}
      {active && active.correction_texte && (
        <div>
          <div className="flex items-center gap-3 mb-3 bg-white rounded-xl shadow border border-gray-200 p-3">
            <span className="text-sm text-gray-600 mr-auto">{active.eleve_nom} — clique dans le dossier pour modifier.</span>
            <button onClick={enregistrer} disabled={busy !== ''}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button onClick={() => genererPdf(active)} disabled={busy !== ''}
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
              {busy === 'gen-' + active.id ? '…' : '(Re)générer le PDF'}
            </button>
            <button onClick={() => setActive(null)} className="text-gray-400 hover:text-gray-700 text-sm">Fermer</button>
          </div>
          <div className="bg-gray-100 rounded-xl p-4 overflow-auto">
            <div ref={editRef} className="dossier" contentEditable suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: active.correction_texte }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">Après modification : Enregistrer, puis (Re)générer le PDF pour mettre à jour la version envoyée.</p>
        </div>
      )}
    </div>
  );
}
