'use client';

/**
 * « À valider » — l'écran du téléphone.
 *
 * Un message = une carte, et trois gestes possibles, dans cet ordre de
 * franchise : **voir**, **envoyer**, **annuler**. Rien d'autre à l'écran.
 *
 * Deux décisions volontaires :
 *  - **l'aperçu s'ouvre en plein écran**, jamais dans une colonne de 300 px :
 *    on valide un e-mail parce qu'on l'a lu, pas parce qu'on a lu son titre ;
 *  - **l'envoi demande confirmation** (`confirme: true` côté serveur) et
 *    affiche à qui il part. Un e-mail parti ne revient pas — la console garde
 *    donc le même garde-fou au téléphone que sur l'ordinateur.
 *
 * Les boutons appellent /api/admin/emails/action, exactement comme la console
 * complète : une seule mécanique d'envoi dans tout le projet, déjà éprouvée.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MessageAValider } from '@/lib/direction/aValider';

type Apercu = {
  sujet?: string;
  html?: string;
  texte?: string;
  destinataire?: string;
  raison?: string;
  ok: boolean;
};

function quand(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour.replace(/\./g, '')} · ${heure.replace(':', ' h ')}`;
}

const ROLE_EMOJI: Record<string, string> = {
  eleve: '🎓',
  parent: '👪',
  prof: '👩‍🏫',
  admin: '🧭',
};

export function ListeAValider({
  messages,
  validationActive,
  total,
}: {
  messages: MessageAValider[];
  validationActive: boolean;
  total: number;
}) {
  const router = useRouter();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);
  const [apercu, setApercu] = useState<{ id: string; contenu: Apercu } | null>(null);
  const [aConfirmer, setAConfirmer] = useState<MessageAValider | null>(null);

  const appeler = async (corps: Record<string, unknown>) => {
    const res = await fetch('/api/admin/emails/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  };

  const voir = async (m: MessageAValider) => {
    setOccupe(m.id);
    setMessage(null);
    try {
      const contenu = (await appeler({ action: 'previsualiser', id: m.id })) as Apercu;
      setApercu({ id: m.id, contenu });
    } catch (err) {
      setMessage({ ton: 'erreur', texte: (err as Error).message });
    } finally {
      setOccupe(null);
    }
  };

  const envoyer = async (m: MessageAValider) => {
    setOccupe(m.id);
    setMessage(null);
    setAConfirmer(null);
    try {
      const res = await appeler({ action: 'valider', id: m.id, confirme: true });
      setApercu(null);
      setMessage({
        ton: res.ok === false ? 'erreur' : 'ok',
        texte: res.ok === false ? res.message || 'Envoi refusé.' : `Envoyé à ${m.destinataire}.`,
      });
      router.refresh();
    } catch (err) {
      setMessage({ ton: 'erreur', texte: (err as Error).message });
    } finally {
      setOccupe(null);
    }
  };

  const annuler = async (m: MessageAValider) => {
    setOccupe(m.id);
    setMessage(null);
    try {
      await appeler({ action: 'annuler', id: m.id });
      setApercu(null);
      setMessage({ ton: 'ok', texte: 'Message annulé — il ne partira pas.' });
      router.refresh();
    } catch (err) {
      setMessage({ ton: 'erreur', texte: (err as Error).message });
    } finally {
      setOccupe(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">📬 À valider</h1>
        <p className="mt-1 text-sm text-slate-500">
          {validationActive ? (
            <>
              Rien ne part sans toi. {total === 0 ? 'Et là, rien n’attend.' : null}
            </>
          ) : (
            <>
              ⚠️ La relecture avant envoi est <strong>désactivée</strong> : ces messages partiront
              tout seuls au prochain passage du moteur.
            </>
          )}
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
            message.ton === 'ok'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.texte}
        </div>
      )}

      {messages.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 font-semibold text-slate-900">Boîte vide</p>
          <p className="mt-1 text-sm text-slate-500">
            Aucun message n’attend ton feu vert. Tu seras prévenue dès qu’il y en aura un.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span aria-hidden className="text-xl leading-none">
                  {ROLE_EMOJI[m.role] ?? '✉️'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{m.typeLibelle}</p>
                  <p className="truncate text-sm text-slate-600">
                    {m.destinataireNom ? `${m.destinataireNom} · ` : ''}
                    {m.destinataire}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {[m.eleve, m.matiere].filter(Boolean).join(' · ')}
                    {m.eleve || m.matiere ? ' · ' : ''}
                    prêt depuis {quand(m.planifieLe)}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => voir(m)}
                  disabled={occupe === m.id}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {occupe === m.id ? '…' : '👀 Lire'}
                </button>
                <button
                  onClick={() => setAConfirmer(m)}
                  disabled={occupe === m.id}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  ✅ Envoyer
                </button>
              </div>
              <button
                onClick={() => annuler(m)}
                disabled={occupe === m.id}
                className="mt-2 w-full text-xs text-slate-400 underline disabled:opacity-50"
              >
                Ne pas envoyer ce message
              </button>
            </li>
          ))}
        </ul>
      )}

      {total > messages.length && (
        <p className="mt-4 text-center text-xs text-slate-400">
          {total - messages.length} message(s) de plus dans la file — ouvre la console E-mails.
        </p>
      )}

      {/* --- L'aperçu, en plein écran --- */}
      {apercu && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <button onClick={() => setApercu(null)} className="text-sm text-slate-500">
              ← Fermer
            </button>
            <p className="ml-auto truncate text-xs text-slate-400">
              {apercu.contenu.destinataire}
            </p>
          </div>
          <div className="flex-1 overflow-auto">
            {apercu.contenu.ok === false ? (
              <p className="p-6 text-sm text-red-700">
                Ce message ne peut pas être envoyé : {apercu.contenu.raison}
              </p>
            ) : (
              <>
                <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
                  {apercu.contenu.sujet}
                </p>
                {apercu.contenu.html ? (
                  <iframe
                    title="Aperçu du message"
                    srcDoc={apercu.contenu.html}
                    className="h-full w-full"
                    /* `sandbox=""` (bac à sable total) rend une page blanche
                       dans Chrome : sans `allow-same-origin`, le document
                       srcDoc n'est pas peint — vérifié à l'écran. Les scripts,
                       les formulaires et la navigation restent interdits, ce
                       qui est le seul point qui compte ici. */
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap p-4 text-sm text-slate-700">
                    {apercu.contenu.texte}
                  </pre>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <button
              onClick={() => setApercu(null)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Plus tard
            </button>
            <button
              onClick={() => {
                const m = messages.find((x) => x.id === apercu.id);
                if (m) setAConfirmer(m);
              }}
              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
            >
              ✅ Envoyer
            </button>
          </div>
        </div>
      )}

      {/* --- La confirmation, parce qu'un e-mail parti ne revient pas --- */}
      {aConfirmer && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-semibold text-slate-900">Envoyer maintenant ?</p>
            <p className="mt-2 text-sm text-slate-600">
              <strong>{aConfirmer.typeLibelle}</strong> part à{' '}
              <strong>{aConfirmer.destinataire}</strong>. C’est définitif.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setAConfirmer(null)}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Annuler
              </button>
              <button
                onClick={() => envoyer(aConfirmer)}
                disabled={occupe === aConfirmer.id}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {occupe === aConfirmer.id ? 'Envoi…' : 'Oui, envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
