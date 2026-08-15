'use client';

/**
 * « Ce qu'il me reste à faire » — la même vérité que le pilotage, mais écrite
 * pour être lue par quelqu'un qui n'a jamais ouvert Supabase.
 *
 * Une seule source : GET /api/admin/correction/a-faire. Rien n'est calculé ici.
 *
 * Deux principes de lecture :
 *   • le filtre par défaut ne montre QUE ce qui bloque aujourd'hui, parce
 *     qu'une liste de trente lignes ne se lit pas ;
 *   • chaque ligne dit qui la fait. « Un clic » = un écran de l'application ;
 *     « Toi » = il faut une personne, et aucun bouton n'y changera rien.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Tache, TodoMatiere, TodoPipeline } from '@/lib/pipelineTodo';

function joursAvant(dateIso: string): number {
  return Math.ceil((new Date(dateIso + 'T00:00:00').getTime() - Date.now()) / 86_400_000);
}

function dateLongue(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function LigneTache({ t }: { t: Tache }) {
  const [ouverte, setOuverte] = useState(false);

  return (
    <li className={`rounded-xl border p-3 ${t.bloquant ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5" aria-hidden>
          {t.bloquant ? '🔴' : '🟠'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm">{t.titre}</p>
          <p className="text-xs text-gray-600 mt-1">{t.pourquoi}</p>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                t.acteur === 'clic' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
              }`}
            >
              {t.acteur === 'clic' ? '👆 un clic suffit' : '🙋 c’est toi'}
            </span>

            {t.ou?.href && (
              <Link
                href={t.ou.href}
                className="text-[11px] font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-full px-2.5 py-1"
              >
                {t.ou.label} →
              </Link>
            )}

            {(t.comment || t.ou?.commande) && (
              <button
                type="button"
                onClick={() => setOuverte(!ouverte)}
                className="text-[11px] text-purple-700 hover:underline"
              >
                {ouverte ? 'replier' : 'comment faire ?'}
              </button>
            )}
          </div>

          {ouverte && (
            <div className="mt-2 space-y-2">
              {t.comment && <p className="text-xs text-gray-700">{t.comment}</p>}
              {t.ou?.commande && (
                <code className="block text-[11px] bg-gray-900 text-gray-100 rounded-lg px-3 py-2 overflow-x-auto">
                  {t.ou.commande}
                </code>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function BlocMatiere({ m, seulementBloquants }: { m: TodoMatiere; seulementBloquants: boolean }) {
  const taches = seulementBloquants ? m.taches.filter((t) => t.bloquant) : m.taches;
  const jours = m.date_epreuve ? joursAvant(m.date_epreuve) : null;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-900">{m.label}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {m.date_epreuve ? (
              <>
                Session le {dateLongue(m.date_epreuve)}
                {jours !== null && jours >= 0 && (
                  <span className={jours <= 14 ? 'text-red-600 font-semibold' : ''}> · dans {jours} jours</span>
                )}
              </>
            ) : (
              'Pas de session programmée'
            )}
            {' · '}
            {m.ouverte ? 'ouverte aux profs' : 'fermée aux profs'}
          </p>
          {/* La question qui revient toujours : « qu'est-ce que je dois écrire
              ici, et à chaque fois ? ». La réponse dépend de la forme de
              l'épreuve, pas d'un état d'avancement. */}
          <p className="text-[11px] text-gray-600 mt-1.5">
            Notée par sa <strong>{m.moteur_label}</strong>. {m.a_definir}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            m.bloquants > 0
              ? 'bg-red-100 text-red-700'
              : m.taches.length > 0
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {m.bloquants > 0
            ? `${m.bloquants} chose(s) qui bloquent`
            : m.taches.length > 0
              ? `${m.taches.length} chose(s) à finir`
              : 'rien à faire'}
        </span>
      </header>

      {taches.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500">
          {m.taches.length === 0
            ? 'Rien à faire ici. Cette matière peut corriger.'
            : 'Rien qui bloque. Décoche le filtre pour voir ce qui reste à finir.'}
        </p>
      ) : (
        <ul className="p-3 space-y-2">
          {taches.map((t) => (
            <LigneTache key={t.id} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * « Qu'est-ce que je dois définir, au juste ? »
 *
 * La confusion la plus coûteuse du tableau de bord : croire qu'il faut écrire
 * un barème pour chaque nouveau bac blanc, dans toutes les matières. C'est vrai
 * en maths, faux en français. Ce panneau dit la règle une fois, en clair, et
 * range chaque matière dans sa case.
 */
function CommentCestNote({ matieres }: { matieres: TodoMatiere[] }) {
  const [ouvert, setOuvert] = useState(false);
  const groupes = [
    {
      cle: 'grille_generique' as const,
      titre: 'Une grille commune à tous les sujets',
      quoi: 'La grille est écrite UNE FOIS pour l’épreuve. Un commentaire de français se juge sur la compréhension du texte, l’analyse, l’organisation et l’expression — que le texte soit de Hugo ou de Colette.',
      chaqueFois: 'Pour un nouveau bac blanc : tu ajoutes le sujet, c’est tout. Rien à écrire de plus.',
    },
    {
      cle: 'criteres_rediges' as const,
      titre: 'Une grille rédigée, verrouillée',
      quoi: 'Même principe, mais avec des critères entièrement rédigés et une conversion de note (dissertation /10 + étude critique /10 = 20).',
      chaqueFois: 'Pour un nouveau bac blanc : tu ajoutes le sujet. La grille, elle, se relit et se verrouille une seule fois.',
    },
    {
      cle: 'bareme_sujet' as const,
      titre: 'Un barème par sujet, question par question',
      quoi: 'Ici les points dépendent des questions posées : « exercice 2 question b » vaut 3 points DANS CE SUJET-LÀ. Aucune grille commune ne peut le dire, puisque les questions changent à chaque épreuve.',
      chaqueFois: 'Pour un nouveau bac blanc : il faut écrire son barème, question par question. C’est la seule famille où c’est le cas.',
    },
  ];

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <button
        type="button"
        onClick={() => setOuvert(!ouvert)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
      >
        <span>
          <span className="font-bold text-gray-900">Qu’est-ce que je dois définir, et quand ?</span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Non, il ne faut pas écrire un barème pour chaque bac blanc partout. Ça dépend de la forme
            de l’épreuve.
          </span>
        </span>
        <span className="text-xs text-purple-700 whitespace-nowrap">{ouvert ? 'replier' : 'ouvrir'}</span>
      </button>

      {ouvert && (
        <div className="px-4 pb-4 space-y-3">
          {groupes.map((g) => {
            const siennes = matieres.filter((m) => m.moteur === g.cle);
            if (!siennes.length) return null;
            return (
              <div key={g.cle} className="rounded-xl border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">{g.titre}</p>
                <p className="text-xs text-gray-600 mt-1">{g.quoi}</p>
                <p className="text-xs text-gray-800 mt-1.5">
                  <strong>{g.chaqueFois}</strong>
                </p>
                <p className="text-[11px] text-gray-500 mt-2">
                  Concerne : {siennes.map((m) => m.label).join(', ')}.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ListeAFaire() {
  const [todo, setTodo] = useState<TodoPipeline | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [seulementBloquants, setSeulementBloquants] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch('/api/admin/correction/a-faire', { cache: 'no-store' });
      const d = await r.json();
      if (d.error) setErreur(d.error);
      else {
        setTodo(d);
        setErreur(null);
      }
    } catch {
      setErreur('Impossible de charger la liste.');
    } finally {
      setChargement(false);
    }
  }, []);

  // Même sortie que la page de santé : on passe par un timer à 0 ms pour que le
  // premier rendu ne déclenche pas un setState synchrone dans l'effet.
  useEffect(() => {
    const t = setTimeout(charger, 0);
    return () => clearTimeout(t);
  }, [charger]);

  if (chargement && !todo) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <p className="max-w-3xl mx-auto text-sm text-gray-500">Analyse de la base…</p>
      </div>
    );
  }

  if (erreur && !todo) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <p className="max-w-3xl mx-auto text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {erreur}
        </p>
      </div>
    );
  }
  if (!todo) return null;

  const avecTaches = todo.matieres.filter((m) => (seulementBloquants ? m.bloquants > 0 : m.taches.length > 0));
  const finies = todo.matieres.filter((m) => m.taches.length === 0);
  const general = seulementBloquants ? todo.general.filter((t) => t.bloquant) : todo.general;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <p className="text-sm text-purple-700 font-medium">Les Matinées du Bac · administration</p>
          <h1 className="text-3xl font-bold text-gray-900">Ce qu’il me reste à faire</h1>
          <p className="text-sm text-gray-600 mt-1">
            Une ligne = une action. 🔴 casse quelque chose aujourd’hui, 🟠 peut attendre.
            <br />
            <strong>👆 un clic suffit</strong> : tout se règle dans l’application.{' '}
            <strong>🙋 c’est toi</strong> : il faut une personne — un prof, un mail, une décision.
            Aucun bouton ne fera ces lignes-là.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-3">
          {[
            { valeur: String(todo.totaux.bloquants), legende: 'choses qui bloquent', ton: 'text-red-700' },
            { valeur: String(todo.totaux.taches), legende: 'choses à faire en tout', ton: 'text-gray-900' },
            { valeur: String(todo.totaux.a_moi), legende: 'qui demandent une personne', ton: 'text-purple-700' },
          ].map((k) => (
            <div key={k.legende} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <p className={`text-2xl font-bold ${k.ton}`}>{k.valeur}</p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">{k.legende}</p>
            </div>
          ))}
        </div>

        <CommentCestNote matieres={todo.matieres} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={seulementBloquants}
              onChange={(e) => setSeulementBloquants(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            Ne montrer que ce qui bloque
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={charger}
              disabled={chargement}
              className="text-xs text-purple-700 hover:underline disabled:opacity-40"
            >
              {chargement ? 'analyse…' : '↻ Recalculer'}
            </button>
            <Link href="/admin/correction" className="text-xs text-gray-500 hover:underline">
              Voir le détail technique →
            </Link>
          </div>
        </div>

        {avecTaches.length === 0 && general.length === 0 ? (
          <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            {seulementBloquants
              ? 'Rien ne bloque nulle part. Décoche le filtre pour voir ce qui reste à finir.'
              : 'Tout est fait. Le système peut corriger.'}
          </p>
        ) : (
          <div className="space-y-4">
            {avecTaches.map((m) => (
              <BlocMatiere key={m.matiere} m={m} seulementBloquants={seulementBloquants} />
            ))}

            {general.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <header className="px-4 py-3 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900">Toutes matières confondues</h2>
                </header>
                <ul className="p-3 space-y-2">
                  {general.map((t) => (
                    <LigneTache key={t.id} t={t} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {finies.length > 0 && (
          <p className="text-xs text-gray-500">
            Rien à faire pour : <strong>{finies.map((m) => m.label).join(', ')}</strong>.
          </p>
        )}
      </div>
    </div>
  );
}
