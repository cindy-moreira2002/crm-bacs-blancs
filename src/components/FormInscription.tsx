'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AVERTISSEMENT_PAIEMENT,
  DELAI_PAIEMENT_DEFAUT,
  phraseDelai,
  type CompteVirement,
} from '@/lib/paiementCompte';
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

/**
 * Le compte à rebours du règlement.
 *
 * Il ne pilote rien : c'est le serveur qui décide de l'expiration, à la
 * minute où le cron passe. Il est là pour que la famille voie le temps qui
 * reste plutôt que de lire « 10 minutes » sans savoir depuis quand.
 */
function Rebours({ minutes }: { minutes: number }) {
  const [restant, setRestant] = useState(minutes * 60);
  useEffect(() => {
    const t = setInterval(() => setRestant((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = Math.floor(restant / 60);
  const ss = restant % 60;
  return (
    <span className="font-mono font-bold tabular-nums">
      {mm}:{String(ss).padStart(2, '0')}
    </span>
  );
}

/** Une ligne du RIB, avec un bouton pour la copier telle quelle. */
function LigneCopiable({ libelle, valeur, copie }: { libelle: string; valeur: string; copie?: string }) {
  const [fait, setFait] = useState(false);
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-red-100 last:border-0">
      <span className="text-xs uppercase tracking-wide text-gray-500 pt-1 shrink-0">{libelle}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-sm font-semibold text-gray-900 break-all text-right">{valeur}</span>
        <button
          type="button"
          onClick={() => {
            // `navigator.clipboard` n'existe pas hors HTTPS ni dans certains
            // navigateurs intégrés (celui de Gmail, par exemple) : dans ce cas
            // on ne fait rien de spectaculaire, la valeur reste sélectionnable.
            navigator.clipboard?.writeText(copie ?? valeur).then(
              () => {
                setFait(true);
                setTimeout(() => setFait(false), 1500);
              },
              () => undefined,
            );
          }}
          className="shrink-0 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
          aria-label={`Copier ${libelle}`}
        >
          {fait ? '✓' : 'Copier'}
        </button>
      </span>
    </div>
  );
}

/** Le prix de CETTE inscription, tel que le serveur l'a calculé. */
export type PrixInscription = {
  plein: number;
  remise: number;
  du: number;
  code: string | null;
  etat: 'aucun' | 'accepte' | 'deja_utilise' | 'inconnu';
};

function EcranPaiementEnAttente({
  prenom,
  matiere,
  date,
  paiement,
  prix,
  examen,
}: {
  prenom: string;
  matiere: string;
  date: string;
  paiement: CompteVirement | null;
  prix: PrixInscription | null;
  examen: Examen;
}) {
  const minutes = paiement?.delaiMinutes ?? DELAI_PAIEMENT_DEFAUT;
  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-lg shadow-lg border border-gray-200">
      <p className="text-3xl mb-2" aria-hidden>
        📝
      </p>
      <h2 className="text-3xl font-black text-gray-900 leading-tight">Inscription enregistrée</h2>
      <p className="mt-1 text-2xl font-extrabold text-red-700">En attente de paiement</p>

      {/* L'avertissement passe avant tout le reste : c'est la seule chose à
          faire maintenant, et la place n'est pas encore réservée. */}
      <div className="mt-5 rounded-xl border-2 border-red-600 bg-red-50 p-4">
        <p className="font-bold text-red-900 text-base leading-snug">{AVERTISSEMENT_PAIEMENT}</p>
        <p className="mt-2 text-sm text-red-900">{phraseDelai(minutes)}</p>
        <p className="mt-3 text-sm text-red-900">
          Temps restant : <Rebours minutes={minutes} />
        </p>
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
        <p className="font-semibold text-gray-800">
          {prenom ? `${prenom} — ` : ''}
          {matiere}
        </p>
        {date && <p className="text-gray-600 mt-0.5">{date}</p>}

        {/* Le détail du prix. Une remise obtenue doit se lire ici, sinon la
            famille vire le tarif public et le rapprochement se fait à la main. */}
        {prix && (
          <div className="mt-3 border-t border-gray-200 pt-3 space-y-1">
            <p className="flex justify-between text-gray-600">
              <span>Tarif</span>
              <span>{prix.plein} €</span>
            </p>
            {prix.remise > 0 && (
              <p className="flex justify-between text-green-700 font-semibold">
                <span>Code {prix.code}</span>
                <span>− {prix.remise} €</span>
              </p>
            )}
            <p className="flex justify-between font-bold text-gray-900 text-base">
              <span>À régler</span>
              <span>{prix.du} €</span>
            </p>
            {prix.etat === 'deja_utilise' && (
              <p className="text-xs text-gray-500 pt-1">
                Ce code a déjà servi pour cet élève : la remise ne s’applique qu’à la première
                matinée.
              </p>
            )}
          </div>
        )}
      </div>

      {paiement ? (
        <div className="mt-5">
          <h3 className="font-bold text-gray-900 mb-1">Régler par virement</h3>
          <p className="text-sm text-gray-600 mb-3">
            Indiquez bien la référence : c’est elle qui rattache le virement à l’inscription.
          </p>
          <div className="rounded-xl border-2 border-red-200 bg-white p-4">
            {paiement.titulaire && <LigneCopiable libelle="Titulaire" valeur={paiement.titulaire} />}
            <LigneCopiable libelle="IBAN" valeur={paiement.iban} copie={paiement.ibanBrut} />
            {paiement.bic && <LigneCopiable libelle="BIC" valeur={paiement.bic} />}
            {paiement.montant && <LigneCopiable libelle="Montant" valeur={`${paiement.montant} €`} copie={paiement.montant} />}
            <LigneCopiable libelle="Référence" valeur={paiement.reference} />
          </div>
          {paiement.precisions && <p className="mt-3 text-sm text-gray-600">{paiement.precisions}</p>}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Les coordonnées bancaires vous arrivent par e-mail dans les minutes qui viennent.
        </div>
      )}

      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-bold">Un e-mail de confirmation arrive</p>
        <p className="mt-1">
          Il reprend ces coordonnées et le lien de l’espace élève. Les parents le reçoivent en
          copie.
        </p>
      </div>

      <a
        href="/espace-eleve"
        className="mt-5 block w-full text-center bg-white border-2 border-gray-300 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-50"
      >
        Ouvrir mon espace élève
      </a>
      <p className="mt-3 text-xs text-gray-500 text-center">
        Une question ? Répondez simplement à l’e-mail de confirmation. Inscription au {THEME[examen].epreuve}.
      </p>
    </div>
  );
}

export function FormInscription({ examen }: { examen: Examen }) {
  const t = THEME[examen];

  // Les épreuves proposées viennent de la base (`/api/sessions`) : un bac blanc
  // créé depuis /direction/bacs-blancs apparaît ici sans toucher au code. Le tableau
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
  const [parrain, setParrain] = useState<{
    etat: 'vide' | 'cherche' | 'connu' | 'inconnu';
    nom?: string | null;
    libelle?: string;
    remise?: number;
  }>({
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
        setParrain(
          data.connu
            ? { etat: 'connu', nom: data.prof ?? null, libelle: data.libelle, remise: data.remise }
            : { etat: 'inconnu' },
        );
      } catch {
        setParrain({ etat: 'vide' });
      }
    }, 400);
    return () => clearTimeout(minuteur);
  }, [codeProf]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Une inscription réussie remplace le formulaire par un écran entier. Le
  // bandeau vert « ✅ Inscription confirmée ! » laissait croire que c'était
  // fini, alors que la place n'est tenue que le temps du règlement.
  const [confirmation, setConfirmation] = useState<{
    prenom: string;
    matiere: string;
    date: string;
    paiement: CompteVirement | null;
    prix: PrixInscription | null;
  } | null>(null);

  // L'engagement de présence. Volontairement DÉCOCHÉ au départ : une case
  // pré-cochée ne vaut pas acceptation, et c'est elle qui fonde le « pas de
  // remboursement en cas d'absence ».
  const [engagement, setEngagement] = useState(false);

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
    // La date n'est plus « demandée s'il y en a » : on s'inscrit à un
    // ÉVÉNEMENT daté, jamais à un service. Sans date, il n'y a pas de place
    // tenue, pas de prof affecté, pas de salle.
    if (!dateEpreuve) {
      setMessage({
        type: 'error',
        text:
          sessions.length > 0
            ? `Choisis la date de ${epreuve} à laquelle tu t’inscris.`
            : `Aucune date n’est ouverte dans cette matière pour l’instant.`,
      });
      return;
    }
    if (!engagement) {
      setMessage({
        type: 'error',
        text: 'Coche l’engagement de présence pour continuer.',
      });
      return;
    }
    // Un code saisi doit être un vrai code. On ne laisse plus partir une
    // inscription avec un code fautif : la famille croirait avoir une remise
    // qu'elle n'a pas, et personne ne s'en apercevrait avant le virement.
    if (codeProf.trim() && parrain.etat === 'inconnu') {
      setMessage({
        type: 'error',
        text: 'Ce code n’existe pas. Corrige-le ou efface le champ pour t’inscrire au tarif normal.',
      });
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
          date_epreuve: dateEpreuve,
          code_affiliation: codeProf.replace(/\s+/g, '').toUpperCase() || null,
          engagement,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setConfirmation({
          prenom: prenom.trim(),
          matiere: libelleMatiere(matiere),
          // Juste la date, en clair : `labelSession` y ajoute le nombre de
          // places restantes, qui n'a rien à faire sur une confirmation.
          date: dateEpreuve
            ? new Date(dateEpreuve).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : '',
          paiement: (data as { paiement?: CompteVirement | null }).paiement ?? null,
          prix: (data as { prix?: PrixInscription }).prix ?? null,
        });
        setPrenom('');
        setNom('');
        setEmail('');
        setEmailParent('');
        setTelephone('');
        setMatiere(MATIERES[0] ?? '');
        setDateEpreuve('');
        setCodeProf('');
        setEngagement(false);
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

  if (confirmation) {
    return (
      <EcranPaiementEnAttente
        prenom={confirmation.prenom}
        matiere={confirmation.matiere}
        date={confirmation.date}
        paiement={confirmation.paiement}
        prix={confirmation.prix}
        examen={examen}
      />
    );
  }

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
              ✅ {parrain.nom ? `Recommandé par ${parrain.nom}` : parrain.libelle}
              {parrain.remise ? ` — ${parrain.remise} € de remise sur ta première matinée` : ''}
            </span>
          )}
          {/* Refus net, et non plus un avertissement qu'on pouvait ignorer :
              une remise annoncée à tort se découvre au moment de payer. */}
          {parrain.etat === 'inconnu' && (
            <span className="mt-1 block text-xs font-semibold text-red-700">
              Ce code n’existe pas ou n’est plus valable. Corrige-le, ou efface le champ pour
              t’inscrire au tarif normal.
            </span>
          )}
          {parrain.etat === 'vide' && (
            <span className="mt-1 block text-xs text-gray-400">
              Laisse vide si tu viens de toi-même.
            </span>
          )}
        </label>

        {/* L'engagement de présence — la contrepartie du « pas de
            remboursement ». Encadré, jamais pré-coché, et refusé côté serveur
            s'il n'est pas explicitement accepté. */}
        <label className="flex gap-3 items-start rounded-xl border-2 border-gray-300 bg-gray-50 p-3 text-sm text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={engagement}
            onChange={(e) => setEngagement(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-purple-700"
          />
          <span>
            <strong>Je m’engage à être présent.</strong> Je m’inscris à un événement daté : la place
            est réservée à mon nom et retirée des places disponibles.{' '}
            <strong>Aucun remboursement en cas d’absence</strong>, quelle qu’en soit la raison.
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className={`w-full ${t.bouton} text-white py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition`}
        >
          {loading ? '⏳ Inscription...' : `✍️ M'inscrire au ${epreuve}`}
        </button>
      </form>

      {/* Seules les erreurs s'affichent ici : une inscription réussie remplace
          tout le formulaire par l'écran « en attente de paiement ». */}
      {message && (
        <div className="mt-4 p-3 rounded-lg text-sm font-medium bg-red-100 text-red-800">
          {message.text}
        </div>
      )}
    </div>
  );
}
