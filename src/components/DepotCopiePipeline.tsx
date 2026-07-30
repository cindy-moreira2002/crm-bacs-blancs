'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Sujet = {
  id: string;
  track: string;
  exercise_type: string;
  matiere: string | null;
  libelle: string;
  rubric_id: string | null;
};

type Statut = {
  id: string;
  statut: string;
  erreur: string | null;
  echec: boolean;
  corrigee: boolean;
  note: number | null;
  /** Barème de l'épreuve : 20 le plus souvent, 10 en histoire-géo, 4 ou 6 sur
   *  certaines parties d'épreuve composée de SES. */
  bareme: number | null;
  eleve: string | null;
  dossier_id: string | null;
};

const MAX_MO = 25;

/** Etapes affichees au prof, dans l'ordre. */
const ETAPES: { cle: string; label: string; statuts: string[] }[] = [
  { cle: 'depot', label: 'Copie reçue', statuts: ['uploaded'] },
  { cle: 'lecture', label: 'Lecture de la copie', statuts: ['transcribing'] },
  { cle: 'transcrite', label: 'Copie transcrite', statuts: ['transcribed', 'transcription_review'] },
  { cle: 'correction', label: 'Correction', statuts: ['correcting'] },
  { cle: 'corrigee', label: 'Copie notée', statuts: ['corrected', 'corrected_review'] },
  { cle: 'dossier', label: 'Dossier de l’élève', statuts: [] },
];

function indexEtape(statut: string, dossierPret: boolean): number {
  if (dossierPret) return ETAPES.length - 1;
  const i = ETAPES.findIndex((e) => e.statuts.includes(statut));
  return i === -1 ? 0 : i;
}

export function DepotCopiePipeline() {
  const [sujets, setSujets] = useState<Sujet[]>([]);
  const [sujetsErreur, setSujetsErreur] = useState<string | null>(null);
  const [sujetId, setSujetId] = useState('');

  const [eleveNom, setEleveNom] = useState('');
  const [eleveEmail, setEleveEmail] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [glisse, setGlisse] = useState(false);

  const [envoi, setEnvoi] = useState(false);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [statut, setStatut] = useState<Statut | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dossierDemande, setDossierDemande] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // --- Chargement des bacs blancs disponibles -------------------------------
  useEffect(() => {
    let annule = false;
    fetch('/api/pipeline/sujets')
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        if (d.error) {
          setSujetsErreur(
            d.manquants?.length
              ? `Configuration incomplète côté serveur (${d.manquants.join(', ')}).`
              : d.error,
          );
        }
        setSujets(d.sujets ?? []);
        if (d.sujets?.length === 1) setSujetId(d.sujets[0].id);
      })
      .catch(() => !annule && setSujetsErreur('Impossible de charger les bacs blancs.'));
    return () => { annule = true; };
  }, []);

  // --- Suivi de l'avancement -----------------------------------------------
  const sujet = sujets.find((s) => s.id === sujetId) ?? null;
  const dossierPret = Boolean(statut?.dossier_id);
  const termine = dossierPret;

  useEffect(() => {
    if (!correctionId || termine) return;
    let annule = false;

    const tick = async () => {
      try {
        const r = await fetch(`/api/pipeline/correction/${correctionId}`, { cache: 'no-store' });
        const d = await r.json();
        if (annule || d.error) return;
        setStatut(d);
      } catch {
        /* le prochain passage retentera */
      }
    };

    tick();
    const t = setInterval(tick, 5000);
    return () => { annule = true; clearInterval(t); };
  }, [correctionId, termine]);

  // Correction prete -> on genere le dossier automatiquement (une seule fois).
  useEffect(() => {
    if (!correctionId || !statut?.corrigee || statut.dossier_id || dossierDemande) return;
    setDossierDemande(true);
    fetch(`/api/pipeline/correction/${correctionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dossier' }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.error) setErreur(d.error); })
      .catch(() => setErreur('Le dossier n’a pas pu être lancé.'));
  }, [correctionId, statut, dossierDemande]);

  // --- Depot ---------------------------------------------------------------
  const choisirFichier = (f: File | null) => {
    setErreur(null);
    if (!f) return;
    if (f.size > MAX_MO * 1024 * 1024) {
      setErreur(`Fichier trop lourd (max ${MAX_MO} Mo).`);
      return;
    }
    setFichier(f);
  };

  const deposer = useCallback(async () => {
    setErreur(null);

    if (!sujet) return setErreur('Choisis le bac blanc.');
    if (!sujet.rubric_id) return setErreur("Ce bac blanc n'a pas de barème actif. Préviens l'administrateur.");
    if (!eleveNom.trim()) return setErreur("Indique le nom de l'élève.");
    if (!fichier) return setErreur('Ajoute la copie (PDF ou photo).');

    setEnvoi(true);
    try {
      // 1. URL signée : le fichier part direct vers le stockage, sans passer par nous.
      const prep = await fetch('/api/pipeline/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fichier_nom: fichier.name,
          exercise_type: sujet.exercise_type,
          matiere: sujet.matiere,
        }),
      }).then((r) => r.json());
      if (prep.error) throw new Error(prep.error);

      // 2. Téléversement direct.
      const up = await fetch(prep.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': fichier.type || 'application/octet-stream' },
        body: fichier,
      });
      if (!up.ok) throw new Error(`Le téléversement a échoué (${up.status}).`);

      // 3. Enregistrement + lancement du moteur.
      const dep = await fetch('/api/pipeline/deposer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: prep.path,
          eleve_code: prep.eleve_code,
          subject_id: sujet.id,
          rubric_id: sujet.rubric_id,
          track: sujet.track,
          exercise_type: sujet.exercise_type,
          matiere: sujet.matiere,
          eleve_nom: eleveNom,
          eleve_email: eleveEmail,
          prof_email: profEmail,
        }),
      }).then((r) => r.json());
      if (dep.error && !dep.correction_id) throw new Error(dep.error);
      if (dep.error) setErreur(dep.error);

      setCorrectionId(dep.correction_id);
      setStatut(null);
      setDossierDemande(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur pendant le dépôt.');
    } finally {
      setEnvoi(false);
    }
  }, [sujet, eleveNom, eleveEmail, profEmail, fichier]);

  const recommencer = () => {
    setCorrectionId(null);
    setStatut(null);
    setFichier(null);
    setEleveNom('');
    setEleveEmail('');
    setDossierDemande(false);
    setErreur(null);
  };

  const imprimer = () => {
    const w = iframeRef.current?.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  const champ = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent';

  // --- Écran de suivi / résultat -------------------------------------------
  if (correctionId) {
    const courant = indexEtape(statut?.statut ?? 'uploaded', dossierPret);
    const echec = Boolean(statut?.echec);

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900">
            {statut?.eleve ? `Copie de ${statut.eleve}` : 'Copie en cours de correction'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Tu peux fermer cette page : la correction continue toute seule.
          </p>

          <ol className="mt-6 space-y-3">
            {ETAPES.map((e, i) => {
              const faite = i < courant || (i === courant && termine);
              const active = i === courant && !termine && !echec;
              return (
                <li key={e.cle} className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      echec && i === courant ? 'bg-red-100 text-red-700'
                        : faite ? 'bg-green-500 text-white'
                        : active ? 'bg-purple-600 text-white animate-pulse'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {echec && i === courant ? '!' : faite ? '✓' : i + 1}
                  </span>
                  <span className={`text-sm ${faite || active ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                    {e.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {typeof statut?.note === 'number' && (
            <div className="mt-6 inline-flex items-baseline gap-2 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
              <span className="text-3xl font-bold text-amber-700">{statut.note}</span>
              <span className="text-amber-700 font-medium">/ {statut.bareme ?? 20}</span>
            </div>
          )}

          {echec && (
            <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              <p className="font-semibold">La correction s’est arrêtée.</p>
              {statut?.erreur && <p className="mt-1 break-words">{statut.erreur}</p>}
              <button
                onClick={() => {
                  setErreur(null);
                  fetch(`/api/pipeline/correction/${correctionId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'relancer' }),
                  });
                }}
                className="mt-3 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
              >
                Relancer
              </button>
            </div>
          )}

          {erreur && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{erreur}</div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {dossierPret && (
              <>
                <button onClick={imprimer}
                  className="px-5 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700">
                  Télécharger le PDF
                </button>
                <a href={`/dossier/${correctionId}`} target="_blank" rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
                  Ouvrir dans un onglet
                </a>
              </>
            )}
            <button onClick={recommencer}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
              Déposer une autre copie
            </button>
          </div>
        </div>

        {dossierPret && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <iframe
              ref={iframeRef}
              src={`/api/pipeline/dossier/${correctionId}`}
              title="Dossier de correction"
              className="w-full"
              style={{ height: '80vh', border: 0 }}
            />
          </div>
        )}
      </div>
    );
  }

  // --- Formulaire de dépôt --------------------------------------------------
  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-lg border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-900">Déposer une copie</h2>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        Choisis le bac blanc, dépose la copie. La correction et le dossier de l’élève se font tout seuls.
      </p>

      {sujetsErreur && (
        <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          {sujetsErreur}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bac blanc</label>
          <select value={sujetId} onChange={(e) => setSujetId(e.target.value)} className={champ}>
            <option value="">— Choisir —</option>
            {sujets.map((s) => (
              <option key={s.id} value={s.id}>{s.libelle}</option>
            ))}
          </select>
          {sujet && !sujet.rubric_id && (
            <p className="text-sm text-red-600 mt-1.5">Aucun barème actif pour ce sujet.</p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Élève</label>
            <input type="text" placeholder="Prénom Nom" value={eleveNom}
              onChange={(e) => setEleveNom(e.target.value)} className={champ} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Email de l’élève <span className="font-normal text-gray-400">(optionnel)</span>
            </label>
            <input type="email" placeholder="eleve@exemple.fr" value={eleveEmail}
              onChange={(e) => setEleveEmail(e.target.value)} className={champ} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Ton email <span className="font-normal text-gray-400">(optionnel)</span>
          </label>
          <input type="email" placeholder="prof@exemple.fr" value={profEmail}
            onChange={(e) => setProfEmail(e.target.value)} className={champ} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">La copie</label>
          <label
            onDragOver={(e) => { e.preventDefault(); setGlisse(true); }}
            onDragLeave={() => setGlisse(false)}
            onDrop={(e) => { e.preventDefault(); setGlisse(false); choisirFichier(e.dataTransfer.files?.[0] ?? null); }}
            className={`flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-xl border-2 border-dashed cursor-pointer transition ${
              glisse ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
            }`}
          >
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={(e) => choisirFichier(e.target.files?.[0] ?? null)} />
            <span className="text-3xl">📄</span>
            <span className="text-sm font-medium text-gray-700">
              {fichier ? fichier.name : 'Glisse le PDF ici, ou clique pour choisir'}
            </span>
            <span className="text-xs text-gray-400">
              PDF ou photo de copie manuscrite — max {MAX_MO} Mo
            </span>
          </label>
        </div>

        {erreur && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{erreur}</div>
        )}

        <button onClick={deposer} disabled={envoi}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
          {envoi ? 'Envoi…' : 'Corriger cette copie'}
        </button>
      </div>
    </div>
  );
}
