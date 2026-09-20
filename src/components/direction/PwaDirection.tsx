'use client';

/**
 * L'installation de l'application sur le téléphone, et les notifications.
 *
 * Trois états, et un seul visible à la fois :
 *  1. **pas installée, sur téléphone** → comment l'ajouter à l'écran d'accueil ;
 *  2. **installée, notifications non activées** → un bouton pour les activer ;
 *  3. **tout est en place** → une ligne discrète, avec un envoi d'essai.
 *
 * Le détail qui coûte une soirée si on l'ignore : **sur iPhone, l'autorisation
 * de notifier n'existe QUE dans une application installée sur l'écran
 * d'accueil**. Demander la permission depuis Safari y échoue toujours. D'où
 * l'ordre imposé ici : installer d'abord, activer ensuite.
 */
import { useCallback, useEffect, useState } from 'react';

type Etat = 'inconnu' | 'a-installer' | 'a-activer' | 'actif' | 'refuse' | 'indisponible';

/** La clé VAPID voyage en base64url ; l'API navigateur veut des octets. */
function versOctets(base64: string): Uint8Array {
  const bourrage = '='.repeat((4 - (base64.length % 4)) % 4);
  const propre = (base64 + bourrage).replace(/-/g, '+').replace(/_/g, '/');
  const brut = window.atob(propre);
  const sortie = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i += 1) sortie[i] = brut.charCodeAt(i);
  return sortie;
}

function estInstallee(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS n'implémente pas display-mode : il expose `standalone`.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function estIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaDirection() {
  const [etat, setEtat] = useState<Etat>('inconnu');
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [replie, setReplie] = useState(false);

  const evaluer = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return setEtat('indisponible');

    let enregistrement: ServiceWorkerRegistration;
    try {
      enregistrement = await navigator.serviceWorker.register('/sw-direction.js', {
        scope: '/direction',
      });
    } catch {
      return setEtat('indisponible');
    }

    if (!('PushManager' in window)) {
      // Safari sur iPhone, tant que l'app n'est pas sur l'écran d'accueil.
      return setEtat(estInstallee() ? 'indisponible' : 'a-installer');
    }

    const abo = await enregistrement.pushManager.getSubscription();
    if (abo) {
      // L'abonnement existe côté navigateur : on s'assure qu'il est aussi
      // connu du serveur (base réinitialisée, autre compte sur le téléphone…).
      try {
        const res = await fetch(
          `/api/direction/push?endpoint=${encodeURIComponent(abo.endpoint)}`,
          { cache: 'no-store' },
        );
        const data = await res.json();
        if (data.abonne) return setEtat('actif');
      } catch {
        return setEtat('actif');
      }
    }

    if (Notification.permission === 'denied') return setEtat('refuse');
    if (!estInstallee() && estIOS()) return setEtat('a-installer');
    setEtat('a-activer');
  }, []);

  useEffect(() => {
    // Différé d'un tick : `evaluer` pose un état, ce qu'un effet n'a pas le
    // droit de faire de façon synchrone (règle react-hooks de Next 16).
    const t = setTimeout(evaluer, 0);
    return () => clearTimeout(t);
  }, [evaluer]);

  const activer = async () => {
    setOccupe(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setEtat(permission === 'denied' ? 'refuse' : 'a-activer');
        return;
      }

      const reponse = await fetch('/api/direction/push', { cache: 'no-store' });
      const { configure, clePublique } = await reponse.json();
      if (!configure) {
        setMessage(
          'Les clés de notification ne sont pas encore posées sur le serveur (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
        );
        return;
      }

      const enregistrement = await navigator.serviceWorker.ready;
      const abo = await enregistrement.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: versOctets(clePublique) as BufferSource,
      });

      const res = await fetch('/api/direction/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abonnement: abo.toJSON() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || 'Enregistrement impossible.');
        return;
      }
      setEtat('actif');
      setMessage('C’est activé sur cet appareil.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Activation impossible.');
    } finally {
      setOccupe(false);
    }
  };

  const tester = async () => {
    setOccupe(true);
    setMessage(null);
    try {
      const res = await fetch('/api/direction/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      const data = await res.json();
      setMessage(
        data.envoyes > 0
          ? `Test envoyé à ${data.envoyes} appareil(s).`
          : 'Aucun appareil abonné n’a pu être joint.',
      );
    } finally {
      setOccupe(false);
    }
  };

  const desactiver = async () => {
    setOccupe(true);
    try {
      const enregistrement = await navigator.serviceWorker.ready;
      const abo = await enregistrement.pushManager.getSubscription();
      if (abo) {
        await fetch(`/api/direction/push?endpoint=${encodeURIComponent(abo.endpoint)}`, {
          method: 'DELETE',
        });
        await abo.unsubscribe();
      }
      setEtat('a-activer');
      setMessage('Notifications coupées sur cet appareil.');
    } finally {
      setOccupe(false);
    }
  };

  if (etat === 'inconnu' || etat === 'indisponible' || replie) return null;

  const cadre =
    'fixed inset-x-3 bottom-20 z-30 rounded-2xl border p-4 shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm';

  if (etat === 'actif') {
    return (
      <div className={`${cadre} border-emerald-200 bg-white`}>
        <p className="text-sm font-semibold text-slate-900">🔔 Notifications actives</p>
        <p className="mt-1 text-xs text-slate-500">
          Tu es prévenue sur cet appareil dès qu’un e-mail attend ton feu vert.
        </p>
        {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}
        <div className="mt-3 flex gap-2">
          <button
            onClick={tester}
            disabled={occupe}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Envoyer un test
          </button>
          <button onClick={desactiver} disabled={occupe} className="text-xs text-slate-400 underline">
            Couper ici
          </button>
          <button onClick={() => setReplie(true)} className="ml-auto text-xs text-slate-400">
            Fermer
          </button>
        </div>
      </div>
    );
  }

  if (etat === 'a-installer') {
    return (
      <div className={`${cadre} border-purple-200 bg-white`}>
        <p className="text-sm font-semibold text-slate-900">📲 Installer l’application</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-600">
          <li>Touche le bouton <strong>Partager</strong> de Safari (le carré avec la flèche).</li>
          <li>Choisis <strong>« Sur l’écran d’accueil »</strong>.</li>
          <li>Ouvre l’icône <strong>Direction MDB</strong> : les notifications deviennent possibles.</li>
        </ol>
        <button onClick={() => setReplie(true)} className="mt-3 text-xs text-slate-400 underline">
          Plus tard
        </button>
      </div>
    );
  }

  if (etat === 'refuse') {
    return (
      <div className={`${cadre} border-amber-200 bg-white`}>
        <p className="text-sm font-semibold text-slate-900">🔕 Notifications refusées</p>
        <p className="mt-1 text-xs text-slate-600">
          Cet appareil a refusé les notifications. Il faut les réautoriser dans les réglages du
          téléphone (Réglages → Notifications → Direction MDB), puis revenir ici.
        </p>
        <button onClick={() => setReplie(true)} className="mt-3 text-xs text-slate-400 underline">
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div className={`${cadre} border-purple-200 bg-white`}>
      <p className="text-sm font-semibold text-slate-900">🔔 Activer les notifications</p>
      <p className="mt-1 text-xs text-slate-600">
        Pour être prévenue quand un e-mail attend ta validation, même app fermée.
      </p>
      {message && <p className="mt-2 text-xs text-amber-700">{message}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={activer}
          disabled={occupe}
          className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {occupe ? 'Activation…' : 'Activer sur cet appareil'}
        </button>
        <button onClick={() => setReplie(true)} className="text-xs text-slate-400 underline">
          Plus tard
        </button>
      </div>
    </div>
  );
}
