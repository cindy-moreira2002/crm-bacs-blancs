/**
 * Service worker de l'espace Direction.
 *
 * Il fait deux choses, et refuse volontairement d'en faire une troisième :
 *   1. recevoir les notifications push et les afficher ;
 *   2. ouvrir le bon écran quand on tape la notification.
 *
 * Ce qu'il ne fait PAS : mettre en cache les pages. Toutes les pages de la
 * direction dépendent d'un cookie de session et montrent des chiffres qui
 * changent (e-mails à valider, paiements reçus). Une page servie depuis le
 * cache afficherait un état périmé — pire qu'une page qui ne s'affiche pas. On
 * ne garde donc que les icônes, qui ne changent jamais.
 */
const CACHE = 'direction-statique-v1';
const FICHIERS = [
  '/icons/direction-192.png',
  '/icons/direction-512.png',
  '/icons/direction-apple-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.pathname.startsWith('/icons/')) return;
  event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
});

self.addEventListener('push', (event) => {
  let charge = {};
  try {
    charge = event.data ? event.data.json() : {};
  } catch {
    charge = { titre: 'Les Matinées du Bac', corps: event.data ? event.data.text() : '' };
  }

  const titre = charge.titre || 'Les Matinées du Bac';
  const options = {
    body: charge.corps || '',
    icon: '/icons/direction-192.png',
    badge: '/icons/direction-192.png',
    lang: 'fr',
    // `tag` remplace la notification précédente du même sujet au lieu d'en
    // empiler dix : trois e-mails à valider, c'est une seule ligne à l'écran.
    tag: charge.tag || 'direction',
    renotify: Boolean(charge.tag),
    data: { url: charge.url || '/direction' },
    requireInteraction: charge.insistant === true,
  };
  event.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cible = (event.notification.data && event.notification.data.url) || '/direction';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      // Une fenêtre de la direction est déjà ouverte : on la réutilise, sinon
      // on empile un onglet de plus à chaque notification.
      for (const f of fenetres) {
        if (f.url.includes('/direction')) {
          f.navigate(cible);
          return f.focus();
        }
      }
      return self.clients.openWindow(cible);
    }),
  );
});
