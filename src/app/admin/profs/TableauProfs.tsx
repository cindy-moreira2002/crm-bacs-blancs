'use client';

/**
 * Profs & accès — qui peut entrer, et ce qu'il voit.
 *
 * Une ligne par professeur, et tout se règle sur place :
 *   - valider ou refuser une candidature (tant qu'elle est en attente, le prof
 *     ne voit aucun bac blanc) ;
 *   - renseigner ses matières (sans matière, son espace reste vide) ;
 *   - suspendre un compte ;
 *   - lui définir un mot de passe (on ne peut jamais LIRE le sien : ils
 *     n'existent que hachés dans Supabase Auth) ;
 *   - entrer dans son espace pour vérifier exactement ce qu'il voit.
 *
 * Tout passe par /api/admin/professeurs (GET, PATCH) et /api/admin/voir-comme.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

type Prof = {
  id: string;
  user_id: string | null;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  matieres: string[] | null;
  statut_candidature: 'en_attente' | 'acceptee' | 'refusee';
  statut_compte: 'actif' | 'suspendu';
  code_affiliation: string;
  role: 'prof' | 'admin';
  created_at: string;
};

/** Les matières que le site sait faire corriger — pour éviter les fautes de frappe. */
const MATIERES = [
  'Français',
  'Philosophie',
  'Mathématiques',
  'Physique-Chimie',
  'SVT',
  'SES',
  'Histoire-Géographie',
  'HGGSP',
  'HLP',
  'Anglais',
];

const CANDIDATURE: Record<Prof['statut_candidature'], { texte: string; classe: string }> = {
  en_attente: { texte: 'À valider', classe: 'bg-amber-100 text-amber-800' },
  acceptee: { texte: 'Validée', classe: 'bg-emerald-100 text-emerald-800' },
  refusee: { texte: 'Refusée', classe: 'bg-red-100 text-red-700' },
};

const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

export function TableauProfs({ monId }: { monId: string }) {
  const [profs, setProfs] = useState<Prof[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<'tous' | 'en_attente' | 'sans_matiere' | 'sans_compte'>('tous');
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [motDePasse, setMotDePasse] = useState('');
  const [formulaire, setFormulaire] = useState(false);
  const [nouveau, setNouveau] = useState({
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    matieres: [] as string[],
  });

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch('/api/admin/professeurs', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) {
        setErreur(data.error ?? 'Lecture impossible.');
        return;
      }
      setProfs(data.professeurs ?? []);
      setErreur(null);
    } catch {
      setErreur('Impossible de joindre le serveur.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    // Différé d'un tick : appeler charger() dans le corps de l'effet déclenche
    // un setState synchrone, que la règle react-hooks de Next 16 refuse.
    const t = setTimeout(charger, 0);
    return () => clearTimeout(t);
  }, [charger]);

  const modifier = async (id: string, patch: Record<string, unknown>, quoi: string) => {
    setOccupe(id);
    setMessage(null);
    try {
      const r = await fetch('/api/admin/professeurs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErreur(data.error ?? 'Modification refusée.');
        return false;
      }
      setProfs((liste) => liste.map((p) => (p.id === id ? { ...p, ...(data.prof ?? patch) } : p)));
      setErreur(null);
      setMessage(quoi);
      return true;
    } catch {
      setErreur('Impossible de joindre le serveur.');
      return false;
    } finally {
      setOccupe(null);
    }
  };

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    setOccupe('creation');
    setMessage(null);
    setErreur(null);
    try {
      const r = await fetch('/api/admin/professeurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nouveau),
      });
      const data = await r.json();
      if (!r.ok) {
        setErreur(data.error ?? 'Création refusée.');
        return;
      }
      // Le code est annoncé tout de suite : c'est l'information que
      // l'administratrice doit transmettre au prof.
      setProfs((liste) => [data.prof as Prof, ...liste]);
      setMessage(
        `${data.prof.prenom} ${data.prof.nom} est créé. Son code d’affiliation : ${data.prof.code_affiliation} — définis-lui un mot de passe sur sa ligne.`,
      );
      setNouveau({ prenom: '', nom: '', email: '', telephone: '', matieres: [] });
      setFormulaire(false);
    } catch {
      setErreur('Impossible de joindre le serveur.');
    } finally {
      setOccupe(null);
    }
  };

  const voirComme = async (id: string) => {
    setOccupe(id);
    const r = await fetch('/api/admin/voir-comme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ professeurId: id }),
    });
    setOccupe(null);
    if (r.ok) window.location.href = '/espace-prof?vue=prof';
    else setErreur('Impossible d’ouvrir cet espace.');
  };

  const definirMotDePasse = async (id: string) => {
    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    const ok = await modifier(
      id,
      { nouveauMotDePasse: motDePasse },
      'Mot de passe défini — communique-le au prof, il pourra le changer ensuite.',
    );
    if (ok) setMotDePasse('');
  };

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return profs.filter((p) => {
      if (filtre === 'en_attente' && p.statut_candidature !== 'en_attente') return false;
      if (filtre === 'sans_matiere' && (p.matieres ?? []).length > 0) return false;
      if (filtre === 'sans_compte' && p.user_id) return false;
      if (!q) return true;
      return `${p.prenom} ${p.nom} ${p.email} ${(p.matieres ?? []).join(' ')}`.toLowerCase().includes(q);
    });
  }, [profs, filtre, recherche]);

  const compteurs = useMemo(
    () => ({
      tous: profs.length,
      en_attente: profs.filter((p) => p.statut_candidature === 'en_attente').length,
      sans_matiere: profs.filter((p) => (p.matieres ?? []).length === 0).length,
      sans_compte: profs.filter((p) => !p.user_id).length,
    }),
    [profs],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profs & accès</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Tout ce qui décide de ce qu’un professeur peut voir. Un prof n’aperçoit un bac blanc que si
          sa candidature est <strong>validée</strong>, que la <strong>matière</strong> est renseignée
          sur sa fiche, et que son compte est <strong>actif</strong>. Les mots de passe ne sont jamais
          lisibles — on peut seulement en définir un nouveau.
        </p>
      </div>

      {erreur && (
        <p className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">{erreur}</p>
      )}
      {message && (
        <p className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {([
          ['tous', 'Tous'],
          ['en_attente', 'À valider'],
          ['sans_matiere', 'Sans matière'],
          ['sans_compte', 'Sans identifiant'],
        ] as const).map(([cle, label]) => (
          <button
            key={cle}
            onClick={() => setFiltre(cle)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              filtre === cle ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'
            }`}
          >
            {label}
            <span className="ml-1.5 opacity-60 tabular-nums">{compteurs[cle]}</span>
          </button>
        ))}
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un nom, un e-mail…"
          className="ml-auto px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-64"
        />
        <button
          onClick={charger}
          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-600"
        >
          ↻
        </button>
        <button
          onClick={() => setFormulaire((v) => !v)}
          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold"
        >
          {formulaire ? 'Annuler' : '＋ Ajouter un professeur'}
        </button>
      </div>

      {/* Créer une fiche — et son code d'affiliation, qui naît avec elle. */}
      {formulaire && (
        <form
          onSubmit={creer}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3"
        >
          <div>
            <h2 className="font-bold text-slate-900">Nouveau professeur</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Son <strong>code d’affiliation</strong> est tiré au sort à la création (prénom + 4
              caractères, par exemple CLAIRE3F7B) : il le voit dans son espace et le donne à ses
              élèves. Le mot de passe se définit ensuite sur sa ligne.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={nouveau.prenom}
              onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })}
              placeholder="Prénom"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              required
            />
            <input
              value={nouveau.nom}
              onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
              placeholder="Nom"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              required
            />
            <input
              type="email"
              value={nouveau.email}
              onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })}
              placeholder="Adresse e-mail"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
              required
            />
            <input
              value={nouveau.telephone}
              onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })}
              placeholder="Téléphone (facultatif)"
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">
              Ses matières — sans matière, son espace reste vide.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MATIERES.map((m) => {
                const cochee = nouveau.matieres.includes(m);
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() =>
                      setNouveau({
                        ...nouveau,
                        matieres: cochee
                          ? nouveau.matieres.filter((x) => x !== m)
                          : [...nouveau.matieres, m],
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                      cochee
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={occupe === 'creation'}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {occupe === 'creation' ? 'Création…' : 'Créer la fiche et son code'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {chargement ? (
          <p className="p-8 text-center text-slate-400 text-sm">Chargement…</p>
        ) : visibles.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">Aucun professeur dans ce filtre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Professeur</th>
                  <th className="text-left px-5 py-2.5 font-medium">Matières</th>
                  <th className="text-left px-5 py-2.5 font-medium">Candidature</th>
                  <th className="text-left px-5 py-2.5 font-medium">Connexion</th>
                  <th className="text-left px-5 py-2.5 font-medium">Inscrit le</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const badge = CANDIDATURE[p.statut_candidature];
                  const detaille = ouvert === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-t border-slate-100 hover:bg-slate-50 align-top">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-900">
                            {p.prenom} {p.nom}
                            {p.role === 'admin' && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[11px] font-semibold">
                                admin
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">{p.email}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {(p.matieres ?? []).length ? (
                            (p.matieres ?? []).join(', ')
                          ) : (
                            <span className="text-amber-700 font-medium">aucune</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.classe}`}>
                            {badge.texte}
                          </span>
                          {p.statut_compte === 'suspendu' && (
                            <span className="ml-1.5 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                              suspendu
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {p.user_id ? (
                            <span className="text-emerald-700">identifiant créé</span>
                          ) : (
                            <span className="text-amber-700 font-medium">aucun identifiant</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">{jour(p.created_at)}</td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {p.statut_candidature === 'en_attente' && (
                            <button
                              onClick={() =>
                                modifier(p.id, { statut_candidature: 'acceptee' }, `${p.prenom} est validé·e.`)
                              }
                              disabled={occupe === p.id}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40"
                            >
                              Valider
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setOuvert(detaille ? null : p.id);
                              setMotDePasse('');
                            }}
                            className="ml-2 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                          >
                            {detaille ? 'Fermer' : 'Gérer'}
                          </button>
                        </td>
                      </tr>

                      {detaille && (
                        <tr className="border-t border-slate-100 bg-slate-50">
                          <td colSpan={6} className="px-5 py-5">
                            <div className="grid md:grid-cols-3 gap-6">
                              {/* Matières */}
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                                  Matières enseignées
                                </h4>
                                <p className="text-xs text-slate-500 mb-2">
                                  Elles décident des bacs blancs qu’il voit dans son espace.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {MATIERES.map((m) => {
                                    const coche = (p.matieres ?? []).includes(m);
                                    return (
                                      <button
                                        key={m}
                                        disabled={occupe === p.id}
                                        onClick={() => {
                                          const suite = coche
                                            ? (p.matieres ?? []).filter((x) => x !== m)
                                            : [...(p.matieres ?? []), m];
                                          modifier(p.id, { matieres: suite }, `Matières mises à jour.`);
                                        }}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                                          coche
                                            ? 'bg-slate-900 text-white border-slate-900'
                                            : 'bg-white text-slate-600 border-slate-300'
                                        }`}
                                      >
                                        {m}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Accès */}
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                                  Accès au site
                                </h4>
                                <div className="space-y-2">
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={motDePasse}
                                      onChange={(e) => setMotDePasse(e.target.value)}
                                      placeholder="Nouveau mot de passe"
                                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                                    />
                                    <button
                                      onClick={() => definirMotDePasse(p.id)}
                                      disabled={occupe === p.id || !p.user_id}
                                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-40"
                                    >
                                      Définir
                                    </button>
                                  </div>
                                  {!p.user_id && (
                                    <p className="text-[11px] text-amber-700">
                                      Ce prof n’a pas encore d’identifiant de connexion : il doit d’abord
                                      créer son compte depuis « Devenir coach ».
                                    </p>
                                  )}
                                  <button
                                    onClick={() =>
                                      modifier(
                                        p.id,
                                        {
                                          statut_compte:
                                            p.statut_compte === 'suspendu' ? 'actif' : 'suspendu',
                                        },
                                        p.statut_compte === 'suspendu'
                                          ? 'Compte réactivé.'
                                          : 'Compte suspendu : plus aucun accès.',
                                      )
                                    }
                                    disabled={occupe === p.id || p.id === monId}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40"
                                  >
                                    {p.statut_compte === 'suspendu' ? 'Réactiver le compte' : 'Suspendre le compte'}
                                  </button>
                                  <button
                                    onClick={() => voirComme(p.id)}
                                    disabled={occupe === p.id || p.id === monId}
                                    className="w-full px-3 py-1.5 rounded-lg border border-purple-300 bg-purple-50 text-xs font-semibold text-purple-800 disabled:opacity-40"
                                  >
                                    👁️ Voir son espace
                                  </button>
                                </div>
                              </div>

                              {/* Candidature + fiche */}
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                                  Candidature
                                </h4>
                                <div className="flex gap-1.5 mb-3">
                                  {(['acceptee', 'en_attente', 'refusee'] as const).map((s) => (
                                    <button
                                      key={s}
                                      disabled={occupe === p.id}
                                      onClick={() =>
                                        modifier(p.id, { statut_candidature: s }, 'Candidature mise à jour.')
                                      }
                                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                                        p.statut_candidature === s
                                          ? 'bg-slate-900 text-white border-slate-900'
                                          : 'bg-white text-slate-600 border-slate-300'
                                      }`}
                                    >
                                      {CANDIDATURE[s].texte}
                                    </button>
                                  ))}
                                </div>
                                <dl className="text-xs text-slate-500 space-y-1">
                                  <div>
                                    <dt className="inline font-medium text-slate-600">Téléphone : </dt>
                                    <dd className="inline">{p.telephone || '—'}</dd>
                                  </div>
                                  <div>
                                    <dt className="inline font-medium text-slate-600">Code d’affiliation : </dt>
                                    <dd className="inline font-mono">{p.code_affiliation}</dd>
                                  </div>
                                </dl>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
