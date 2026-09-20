'use client';

/**
 * « Relier mon compte Discord » — le même bloc dans l'espace élève et dans
 * l'espace prof.
 *
 * Il ne s'affiche que s'il a quelque chose à dire : Discord configuré et compte
 * pas encore relié, ou message de retour à montrer. Une fois le compte relié,
 * il se réduit à une ligne discrète — l'espace n'a pas à rappeler en
 * permanence une chose déjà faite.
 */
import { useEffect, useState } from 'react';
import { MESSAGES_LIAISON } from '@/lib/discord/liaison';

type Etat = { configure: boolean; relie: boolean; role: string | null; sql46: boolean };

/** Le logo Discord, partagé par tous les boutons qui y mènent. */
export function IconeDiscord({ classe = 'w-4 h-4' }: { classe?: string }) {
  return (
    <svg className={classe} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.2.36-.43.842-.59 1.226a18.27 18.27 0 0 0-5.487 0A12.43 12.43 0 0 0 9.21 3a19.74 19.74 0 0 0-4.435 1.372C1.98 8.57 1.22 12.66 1.6 16.69a19.9 19.9 0 0 0 6.06 3.08c.49-.67.926-1.382 1.3-2.13a12.9 12.9 0 0 1-2.05-.99c.173-.128.34-.26.503-.396a14.2 14.2 0 0 0 12.174 0c.165.14.333.272.504.396-.653.386-1.34.718-2.053.99.375.748.81 1.46 1.3 2.13a19.87 19.87 0 0 0 6.063-3.08c.447-4.67-.764-8.72-3.083-12.32ZM8.68 14.24c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.955 2.42-2.157 2.42Zm6.64 0c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42Z" />
    </svg>
  );
}

export function LiaisonDiscord({ pourquoi }: { pourquoi: string }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);

  useEffect(() => {
    // Le message de retour est lu puis retiré de l'URL : rechargé plus tard, un
    // espace ne doit pas réafficher le résultat d'une liaison d'hier.
    const params = new URLSearchParams(window.location.search);
    const code = params.get('discord');
    if (code) {
      params.delete('discord');
      const reste = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (reste ? `?${reste}` : ''));
    }

    // Les deux états sont posés ensemble, à l'arrivée de la réponse : le bloc
    // apparaît d'un coup, déjà complet, au lieu de se réécrire sous les yeux.
    fetch('/api/discord/etat')
      .then((r) => r.json())
      .then((e: Etat) => {
        setEtat(e);
        if (code) {
          setRetour(
            MESSAGES_LIAISON[code] ?? { ton: 'erreur', texte: 'La liaison n’a pas abouti.' },
          );
        }
      })
      .catch(() => setEtat(null));
  }, []);

  if (!etat) return null;

  if (etat.sql46) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Discord est configuré, mais la base n’a pas encore les colonnes de liaison :
        le script <code className="font-mono">46_discord_comptes.sql</code> reste à jouer.
      </div>
    );
  }

  if (!etat.configure) return null;

  if (etat.relie && !retour) {
    return (
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <span aria-hidden>🟣</span> Compte Discord relié.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:p-5 space-y-3">
      {retour && (
        <p
          className={`text-sm font-medium ${
            retour.ton === 'ok' ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {retour.texte}
        </p>
      )}

      {!etat.relie && (
        <>
          <div>
            <p className="font-semibold text-gray-900">Relie ton compte Discord</p>
            <p className="text-sm text-gray-600 mt-1">{pourquoi}</p>
          </div>
          <a
            href="/api/discord/oauth/depart"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <IconeDiscord />
            Relier mon compte Discord
          </a>
          <TutoDiscord />
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   LE TUTO — « comment je relie mon compte ? »

   Il ne s'affiche que tant que le compte n'est PAS relié : une fois la liaison
   faite, plus personne n'a besoin du mode d'emploi.

   Les vignettes sont des dessins, pas des captures d'écran de Discord : un
   croquis reste juste quand Discord change ses couleurs ou ses boutons, et il
   montre exactement ce qu'on veut faire regarder — le bouton à cliquer.
──────────────────────────────────────────────────────────────────────────── */

/** Le cadre commun des vignettes : une petite fenêtre de navigateur. */
function Fenetre({ children, titre }: { children: React.ReactNode; titre: string }) {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-auto rounded-lg border border-indigo-100 bg-white" role="img" aria-label={titre}>
      <rect x="0" y="0" width="200" height="18" fill="#EEF2FF" />
      <circle cx="10" cy="9" r="3" fill="#C7D2FE" />
      <circle cx="20" cy="9" r="3" fill="#C7D2FE" />
      <circle cx="30" cy="9" r="3" fill="#C7D2FE" />
      {children}
    </svg>
  );
}

/** Étape 1 — créer (ou retrouver) son compte sur discord.com. */
function VignetteCompte() {
  return (
    <Fenetre titre="Page d’inscription de Discord">
      <text x="100" y="42" textAnchor="middle" fontSize="11" fontWeight="700" fill="#4338CA">discord.com</text>
      <rect x="40" y="52" width="120" height="14" rx="4" fill="#F3F4F6" />
      <text x="46" y="62" fontSize="7" fill="#9CA3AF">ton adresse e-mail</text>
      <rect x="40" y="70" width="120" height="14" rx="4" fill="#F3F4F6" />
      <text x="46" y="80" fontSize="7" fill="#9CA3AF">mot de passe</text>
      <rect x="40" y="90" width="120" height="16" rx="8" fill="#5865F2" />
      <text x="100" y="101" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff">S’inscrire</text>
    </Fenetre>
  );
}

/** Étape 2 — le bouton violet, ici même, dans l'espace. */
function VignetteBouton() {
  return (
    <Fenetre titre="Le bouton « Relier mon compte Discord » dans ton espace">
      <text x="100" y="40" textAnchor="middle" fontSize="8" fill="#6B7280">Mon espace</text>
      <rect x="28" y="50" width="144" height="34" rx="10" fill="#EEF2FF" stroke="#C7D2FE" />
      <rect x="40" y="58" width="120" height="18" rx="9" fill="#4F46E5" />
      <text x="100" y="70" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#fff">Relier mon compte Discord</text>
      {/* Le curseur : c'est LE geste de l'étape. */}
      <path d="M150 78 l0 14 l4 -4 l3 6 l3 -1.5 l-3 -6 l5 -0.5 z" fill="#111827" />
    </Fenetre>
  );
}

/** Étape 3 — la fenêtre d'autorisation de Discord. */
function VignetteAutoriser() {
  return (
    <Fenetre titre="Fenêtre d’autorisation de Discord">
      <text x="100" y="38" textAnchor="middle" fontSize="8" fontWeight="700" fill="#374151">Les Matinées du Bac</text>
      <text x="100" y="50" textAnchor="middle" fontSize="6.5" fill="#9CA3AF">souhaite accéder à ton compte</text>
      <rect x="30" y="58" width="140" height="10" rx="3" fill="#F3F4F6" />
      <text x="36" y="66" fontSize="6" fill="#6B7280">✓ ton nom d’utilisateur</text>
      <rect x="30" y="72" width="140" height="10" rx="3" fill="#F3F4F6" />
      <text x="36" y="80" fontSize="6" fill="#6B7280">✓ te faire rejoindre le serveur</text>
      <rect x="30" y="90" width="66" height="16" rx="8" fill="#E5E7EB" />
      <text x="63" y="101" textAnchor="middle" fontSize="7" fontWeight="700" fill="#6B7280">Annuler</text>
      <rect x="104" y="90" width="66" height="16" rx="8" fill="#22C55E" />
      <text x="137" y="101" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">Autoriser</text>
      <path d="M152 100 l0 14 l4 -4 l3 6 l3 -1.5 l-3 -6 l5 -0.5 z" fill="#111827" />
    </Fenetre>
  );
}

/** Étape 4 — la confirmation, de retour dans l'espace. */
function VignetteConfirme() {
  return (
    <Fenetre titre="Confirmation : compte Discord relié">
      <text x="100" y="40" textAnchor="middle" fontSize="8" fill="#6B7280">Mon espace</text>
      <rect x="24" y="52" width="152" height="30" rx="8" fill="#DCFCE7" stroke="#86EFAC" />
      <circle cx="44" cy="67" r="8" fill="#22C55E" />
      <path d="M40 67 l3 3 l6 -7" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x="58" y="70" fontSize="7.5" fontWeight="700" fill="#166534">Compte Discord relié</text>
      <text x="100" y="98" textAnchor="middle" fontSize="6.5" fill="#9CA3AF">C’est tout : rien d’autre à faire.</text>
    </Fenetre>
  );
}

const ETAPES = [
  {
    titre: 'Aie un compte Discord',
    texte: (
      <>
        Si tu n’en as pas encore, crée-le sur{' '}
        <a href="https://discord.com/register" target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">
          discord.com
        </a>{' '}
        : c’est gratuit et ça prend deux minutes. Mets un pseudo où l’on reconnaît ton prénom, c’est
        lui que ton professeur verra le jour J.
      </>
    ),
    vignette: <VignetteCompte />,
  },
  {
    titre: 'Reste connecté(e) à Discord dans ce navigateur',
    texte: (
      <>
        Ouvre Discord une fois et connecte-toi (dans le même navigateur que cette page). Sinon, à
        l’étape suivante, Discord te réclamera ton mot de passe au milieu du chemin.
      </>
    ),
    vignette: null,
  },
  {
    titre: 'Clique sur « Relier mon compte Discord »',
    texte: <>C’est le bouton violet juste au-dessus de ce tuto.</>,
    vignette: <VignetteBouton />,
  },
  {
    titre: 'Clique sur « Autoriser »',
    texte: (
      <>
        Discord te demande si tu acceptes. Clique sur le bouton vert <strong>Autoriser</strong>. On ne
        voit que ton nom d’utilisateur — ni tes messages, ni tes autres serveurs.
      </>
    ),
    vignette: <VignetteAutoriser />,
  },
  {
    titre: 'Reviens ici : c’est fait',
    texte: (
      <>
        Tu retombes automatiquement sur ton espace, avec le message vert{' '}
        <strong>« Compte Discord relié »</strong>. Ta salle du jour J s’ouvrira toute seule pour toi.
      </>
    ),
    vignette: <VignetteConfirme />,
  },
];

export function TutoDiscord() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="border-t border-indigo-200 pt-3">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-indigo-800 hover:text-indigo-900"
        aria-expanded={ouvert}
      >
        <span>👉 Comment faire ? Le tuto en images (2 minutes)</span>
        <span aria-hidden className={`text-lg transition-transform ${ouvert ? 'rotate-45' : ''}`}>＋</span>
      </button>

      {ouvert && (
        <ol className="mt-4 space-y-4">
          {ETAPES.map((e, k) => (
            <li key={e.titre} className="flex gap-3 rounded-xl bg-white/70 p-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                {k + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 text-sm">{e.titre}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{e.texte}</p>
                {e.vignette && <div className="mt-3 max-w-[260px]">{e.vignette}</div>}
              </div>
            </li>
          ))}

          {/* Les deux pannes qu'on voit vraiment, et leur sortie. */}
          <li className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Ça ne marche pas ?</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed">
              <li>
                Rien ne s’ouvre : ton navigateur a bloqué la fenêtre. Autorise-la, puis reclique sur
                le bouton violet.
              </li>
              <li>
                Ce n’est pas ton compte qui s’affiche : déconnecte-toi de Discord, reconnecte-toi
                avec le bon compte, puis recommence à l’étape 3.
              </li>
              <li>
                Toujours bloqué(e) ? Écris à{' '}
                <a href="mailto:matineesdubac@gmail.com" className="font-semibold underline">
                  matineesdubac@gmail.com
                </a>{' '}
                — on le relie avec toi.
              </li>
            </ul>
          </li>
        </ol>
      )}
    </div>
  );
}
