'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Les libellés d'épreuve vivent dans matieres.ts, sans aucun import serveur :
// un composant client peut les lire tels quels.
import { labelExercice } from '@/lib/matieres';

type Sujet = {
  id: string;
  track: string;
  exercise_type: string;
  matiere: string | null;
  libelle: string;
  rubric_id: string | null;
};

/**
 * Un bac blanc COMPLET : plusieurs exercices notés séparément dont la somme des
 * notes officielles fait la note de l'élève (HGGSP : dissertation sur 10 +
 * étude critique sur 10 = 20).
 */
type Examen = {
  id: string;
  code: string;
  titre: string;
  matiere: string;
  track: string;
  exercices: {
    exercise_type: string;
    subject_id: string;
    libelle: string;
    rubric_id: string;
    ordre: number;
    max_officiel: number;
  }[];
};

type Statut = {
  id: string;
  statut: string;
  erreur: string | null;
  echec: boolean;
  corrigee: boolean;
  note: number | null;
  /** Barème de l'épreuve : 20 le plus souvent, 10 en histoire-géo, 4 ou 6 sur
   *  certaines parties d'épreuve composée de SES. Sur une épreuve rédigée,
   *  c'est l'échelle ANALYTIQUE (20), pas la note officielle. */
  bareme: number | null;
  eleve: string | null;
  dossier_id: string | null;
  moteur: string | null;
  groupe_copie_id: string | null;
  /** Note officielle de l'exercice — celle qui s'additionne, sur une rédigée. */
  note_officielle: number | null;
  max_officiel: number | null;
};

/** La note finale d'un bac blanc complet, lue dans la vue côté base. */
type NoteGroupe = {
  exercices_attendus: number;
  exercices_notes: number;
  complet: boolean;
  note_finale: number | null;
  note_finale_max: number | null;
  relecture_humaine: boolean;
};

/** Une copie en cours de suivi : la correction, et de quel exercice elle vient. */
type Suivi = { id: string; exercise_type: string; libelle: string };

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
  const [examens, setExamens] = useState<Examen[]>([]);
  const [sujetsErreur, setSujetsErreur] = useState<string | null>(null);
  /** `sujet:<id>` pour un exercice seul, `exam:<id>` pour un bac blanc complet. */
  const [choix, setChoix] = useState('');

  const [eleveNom, setEleveNom] = useState('');
  const [eleveEmail, setEleveEmail] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  /** Bac blanc complet : une copie par exercice, indexée par exercise_type. */
  const [fichiers, setFichiers] = useState<Record<string, File>>({});
  const [glisse, setGlisse] = useState(false);

  const [envoi, setEnvoi] = useState(false);
  const [suivis, setSuivis] = useState<Suivi[]>([]);
  const [groupeId, setGroupeId] = useState<string | null>(null);
  const [statuts, setStatuts] = useState<Record<string, Statut>>({});
  const [noteGroupe, setNoteGroupe] = useState<NoteGroupe | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Dossiers déjà demandés. Une ref, pas un état : personne ne l'affiche, et
   *  redemander coûterait un appel à l'API Anthropic pour rien. */
  const dossiersDemandes = useRef<Set<string>>(new Set());

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
        setExamens(d.examens ?? []);
        if (d.sujets?.length === 1 && !d.examens?.length) setChoix(`sujet:${d.sujets[0].id}`);
      })
      .catch(() => !annule && setSujetsErreur('Impossible de charger les bacs blancs.'));
    return () => { annule = true; };
  }, []);

  // --- Ce qui a été choisi --------------------------------------------------
  const examen = choix.startsWith('exam:') ? examens.find((e) => e.id === choix.slice(5)) ?? null : null;
  const sujet = choix.startsWith('sujet:') ? sujets.find((s) => s.id === choix.slice(6)) ?? null : null;

  // --- Suivi de l'avancement -----------------------------------------------
  const dossiersPrets = suivis.length > 0 && suivis.every((s) => statuts[s.id]?.dossier_id);
  const termine = dossiersPrets && (!groupeId || Boolean(noteGroupe?.complet));

  useEffect(() => {
    if (!suivis.length || termine) return;
    let annule = false;

    const tick = async () => {
      for (const s of suivis) {
        try {
          const r = await fetch(`/api/pipeline/correction/${s.id}`, { cache: 'no-store' });
          const d = await r.json();
          if (annule || d.error) continue;
          setStatuts((prec) => ({ ...prec, [s.id]: d }));
        } catch {
          /* le prochain passage retentera */
        }
      }
      if (groupeId) {
        try {
          const r = await fetch(`/api/pipeline/groupe/${groupeId}`, { cache: 'no-store' });
          const d = await r.json();
          if (!annule && !d.error) setNoteGroupe(d);
        } catch {
          /* idem */
        }
      }
    };

    tick();
    const t = setInterval(tick, 5000);
    return () => { annule = true; clearInterval(t); };
  }, [suivis, groupeId, termine]);

  // Correction prete -> on genere le dossier automatiquement (une seule fois
  // par copie : deux demandes rappelleraient l'API Anthropic pour rien).
  useEffect(() => {
    for (const s of suivis) {
      const st = statuts[s.id];
      if (!st?.corrigee || st.dossier_id || dossiersDemandes.current.has(s.id)) continue;
      dossiersDemandes.current.add(s.id);
      fetch(`/api/pipeline/correction/${s.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dossier' }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.error) setErreur(d.error); })
        .catch(() => setErreur('Le dossier n’a pas pu être lancé.'));
    }
  }, [suivis, statuts]);

  // --- Depot ---------------------------------------------------------------
  const verifierTaille = (f: File): boolean => {
    if (f.size > MAX_MO * 1024 * 1024) {
      setErreur(`Fichier trop lourd (max ${MAX_MO} Mo) : ${f.name}`);
      return false;
    }
    return true;
  };

  const choisirFichier = (f: File | null) => {
    setErreur(null);
    if (!f || !verifierTaille(f)) return;
    setFichier(f);
  };

  const choisirFichierExercice = (exercise_type: string, f: File | null) => {
    setErreur(null);
    if (!f || !verifierTaille(f)) return;
    setFichiers((prec) => ({ ...prec, [exercise_type]: f }));
  };

  /**
   * Envoie UNE copie : URL signée, téléversement direct, enregistrement.
   * `groupe` n'est renseigné que pour un bac blanc complet — c'est lui qui
   * relie les deux copies d'un même élève, et rien d'autre.
   */
  const envoyerUneCopie = useCallback(
    async (
      f: File,
      exo: { subject_id: string; rubric_id: string; track: string; exercise_type: string; matiere: string | null },
      groupe: { exam_id: string; groupe_copie_id: string } | null,
    ): Promise<string> => {
      const prep = await fetch('/api/pipeline/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fichier_nom: f.name,
          exercise_type: exo.exercise_type,
          matiere: exo.matiere,
        }),
      }).then((r) => r.json());
      if (prep.error) throw new Error(prep.error);

      const up = await fetch(prep.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/octet-stream' },
        body: f,
      });
      if (!up.ok) throw new Error(`Le téléversement a échoué (${up.status}).`);

      const dep = await fetch('/api/pipeline/deposer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: prep.path,
          eleve_code: prep.eleve_code,
          subject_id: exo.subject_id,
          rubric_id: exo.rubric_id,
          track: exo.track,
          exercise_type: exo.exercise_type,
          matiere: exo.matiere,
          eleve_nom: eleveNom,
          eleve_email: eleveEmail,
          prof_email: profEmail,
          ...(groupe ?? {}),
        }),
      }).then((r) => r.json());
      if (dep.error && !dep.correction_id) throw new Error(dep.error);
      if (dep.error) setErreur(dep.error);
      return dep.correction_id as string;
    },
    [eleveNom, eleveEmail, profEmail],
  );

  const deposer = useCallback(async () => {
    setErreur(null);

    if (!examen && !sujet) return setErreur('Choisis le bac blanc.');
    if (!eleveNom.trim()) return setErreur("Indique le nom de l'élève.");

    if (examen) {
      const manquantes = examen.exercices.filter((x) => !fichiers[x.exercise_type]);
      if (manquantes.length) {
        return setErreur(
          `Il manque ${manquantes.length} copie(s) : ${manquantes.map((x) => labelExercice(x.exercise_type)).join(', ')}. ` +
            'La note finale est la somme des deux exercices — elle serait fausse avec un seul.',
        );
      }
    } else if (sujet) {
      if (!sujet.rubric_id) return setErreur("Ce bac blanc n'a pas de barème actif. Préviens l'administrateur.");
      if (!fichier) return setErreur('Ajoute la copie (PDF ou photo).');
    }

    setEnvoi(true);
    try {
      if (examen) {
        // Un seul identifiant de groupe pour toutes les copies de l'élève :
        // c'est ce que la vue `v_notes_examen_redige` regroupe pour faire la
        // note finale.
        const groupe_copie_id = crypto.randomUUID();
        const nouveaux: Suivi[] = [];
        for (const x of [...examen.exercices].sort((a, b) => a.ordre - b.ordre)) {
          const id = await envoyerUneCopie(
            fichiers[x.exercise_type],
            { ...x, matiere: examen.matiere, track: examen.track },
            { exam_id: examen.id, groupe_copie_id },
          );
          nouveaux.push({ id, exercise_type: x.exercise_type, libelle: x.libelle });
        }
        setGroupeId(groupe_copie_id);
        setSuivis(nouveaux);
      } else if (sujet) {
        const id = await envoyerUneCopie(
          fichier!,
          {
            subject_id: sujet.id,
            rubric_id: sujet.rubric_id!,
            track: sujet.track,
            exercise_type: sujet.exercise_type,
            matiere: sujet.matiere,
          },
          null,
        );
        setGroupeId(null);
        setSuivis([{ id, exercise_type: sujet.exercise_type, libelle: sujet.libelle }]);
      }
      setStatuts({});
      setNoteGroupe(null);
      dossiersDemandes.current.clear();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur pendant le dépôt.');
    } finally {
      setEnvoi(false);
    }
  }, [examen, sujet, eleveNom, fichier, fichiers, envoyerUneCopie]);

  const recommencer = () => {
    setSuivis([]);
    setGroupeId(null);
    setStatuts({});
    setNoteGroupe(null);
    setFichier(null);
    setFichiers({});
    setEleveNom('');
    setEleveEmail('');
    setErreur(null);
    dossiersDemandes.current.clear();
  };

  const imprimer = () => {
    const w = iframeRef.current?.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  const champ = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent';

  // --- Écran de suivi / résultat -------------------------------------------
  if (suivis.length > 0) {
    const complet = suivis.length > 1;
    const eleve = suivis.map((s) => statuts[s.id]?.eleve).find(Boolean) ?? null;
    // Le dossier affiché en bas : celui de la première copie prête. Sur un bac
    // blanc complet, chaque exercice a le sien.
    const dossierAffiche = suivis.find((s) => statuts[s.id]?.dossier_id) ?? null;

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900">
            {eleve ? `Copie de ${eleve}` : 'Copie en cours de correction'}
            {complet && <span className="ml-2 text-sm font-medium text-purple-700">bac blanc complet</span>}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Tu peux fermer cette page : la correction continue toute seule.
          </p>

          <div className={complet ? 'mt-6 grid sm:grid-cols-2 gap-6' : 'mt-6'}>
            {suivis.map((s) => {
              const st = statuts[s.id] ?? null;
              const dossierPret = Boolean(st?.dossier_id);
              const courant = indexEtape(st?.statut ?? 'uploaded', dossierPret);
              const echec = Boolean(st?.echec);
              const fini = dossierPret;

              return (
                <div key={s.id}>
                  {complet && (
                    <p className="text-sm font-semibold text-gray-800 mb-2">
                      {labelExercice(s.exercise_type)}
                      <span className="block text-xs font-normal text-gray-500 truncate">{s.libelle}</span>
                    </p>
                  )}
                  <ol className="space-y-3">
                    {ETAPES.map((e, i) => {
                      const faite = i < courant || (i === courant && fini);
                      const active = i === courant && !fini && !echec;
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

                  {typeof st?.note === 'number' && (
                    <div className="mt-4 inline-flex flex-col gap-1 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                      <span>
                        <span className="text-2xl font-bold text-amber-700">{st.note}</span>
                        <span className="text-amber-700 font-medium"> / {st.bareme ?? 20}</span>
                      </span>
                      {st.note_officielle !== null && (
                        <span className="text-xs text-amber-800">
                          note officielle de l’exercice : {st.note_officielle} / {st.max_officiel ?? 10}
                        </span>
                      )}
                    </div>
                  )}

                  {echec && (
                    <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                      <p className="font-semibold">La correction s’est arrêtée.</p>
                      {st?.erreur && <p className="mt-1 break-words">{st.erreur}</p>}
                      <button
                        onClick={() => {
                          setErreur(null);
                          fetch(`/api/pipeline/correction/${s.id}`, {
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

                  {dossierPret && (
                    <a
                      href={`/dossier/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-3 text-sm text-purple-700 hover:underline"
                    >
                      Ouvrir le dossier de cet exercice →
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* La note du bac blanc : la somme des notes OFFICIELLES, telle que la
              base la calcule. Deux notes sur 20 ne sont jamais additionnées. */}
          {groupeId && noteGroupe && (
            <div className="mt-6 rounded-xl border border-purple-200 bg-purple-50 px-5 py-4">
              {noteGroupe.note_finale !== null ? (
                <>
                  <p className="text-sm font-semibold text-purple-900">Note du bac blanc</p>
                  <p className="mt-1">
                    <span className="text-3xl font-bold text-purple-800">{noteGroupe.note_finale}</span>
                    <span className="text-purple-800 font-medium"> / {noteGroupe.note_finale_max ?? 20}</span>
                  </p>
                  {!noteGroupe.complet && (
                    <p className="text-xs text-purple-900 mt-1">
                      Somme partielle : {noteGroupe.exercices_notes} exercice(s) noté(s) sur{' '}
                      {noteGroupe.exercices_attendus}.
                    </p>
                  )}
                  {noteGroupe.relecture_humaine && (
                    <p className="text-xs text-amber-800 mt-1">
                      Une relecture par un professeur est demandée sur au moins un des deux exercices.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-purple-900">
                  Note du bac blanc : en attente des deux exercices ({noteGroupe.exercices_notes}/
                  {noteGroupe.exercices_attendus} noté(s)).
                </p>
              )}
            </div>
          )}

          {erreur && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{erreur}</div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {dossierAffiche && (
              <button onClick={imprimer}
                className="px-5 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700">
                Télécharger le PDF
              </button>
            )}
            <button onClick={recommencer}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
              Déposer une autre copie
            </button>
          </div>
        </div>

        {dossierAffiche && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <iframe
              ref={iframeRef}
              src={`/api/pipeline/dossier/${dossierAffiche.id}`}
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
          <select value={choix} onChange={(e) => setChoix(e.target.value)} className={champ}>
            <option value="">— Choisir —</option>
            {examens.length > 0 && (
              <optgroup label="Bacs blancs complets (plusieurs exercices, une note finale)">
                {examens.map((e) => (
                  <option key={e.id} value={`exam:${e.id}`}>
                    {e.titre} — {e.exercices.length} exercices
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Un seul exercice">
              {sujets.map((s) => (
                <option key={s.id} value={`sujet:${s.id}`}>{s.libelle}</option>
              ))}
            </optgroup>
          </select>
          {sujet && !sujet.rubric_id && (
            <p className="text-sm text-red-600 mt-1.5">Aucun barème actif pour ce sujet.</p>
          )}
          {examen && (
            <p className="text-xs text-gray-500 mt-1.5">
              Note finale ={' '}
              {examen.exercices.map((x) => `${labelExercice(x.exercise_type)} / ${x.max_officiel}`).join(' + ')} ={' '}
              {examen.exercices.reduce((n, x) => n + x.max_officiel, 0)} points. Les deux copies du même
              élève doivent être déposées ensemble.
            </p>
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

        {/* Bac blanc complet : une zone de dépôt par exercice. */}
        {examen ? (
          <div className="space-y-4">
            {[...examen.exercices].sort((a, b) => a.ordre - b.ordre).map((x) => (
              <div key={x.exercise_type}>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {labelExercice(x.exercise_type)}{' '}
                  <span className="font-normal text-gray-400">· {x.libelle} · sur {x.max_officiel}</span>
                </label>
                <label className="flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-xl border-2 border-dashed cursor-pointer transition border-gray-300 hover:border-purple-400 hover:bg-gray-50">
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={(e) => choisirFichierExercice(x.exercise_type, e.target.files?.[0] ?? null)} />
                  <span className="text-2xl">📄</span>
                  <span className="text-sm font-medium text-gray-700">
                    {fichiers[x.exercise_type]?.name ?? 'Clique pour choisir la copie de cet exercice'}
                  </span>
                </label>
              </div>
            ))}
          </div>
        ) : (
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
        )}

        {erreur && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{erreur}</div>
        )}

        <button onClick={deposer} disabled={envoi}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
          {envoi ? 'Envoi…' : examen ? 'Corriger ce bac blanc' : 'Corriger cette copie'}
        </button>
      </div>
    </div>
  );
}
