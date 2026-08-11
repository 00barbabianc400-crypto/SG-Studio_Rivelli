const CACHE = 'sr-pwa-v14';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Web Push — payload JSON { title, body, url, tag } oppure Declarative Web Push */
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || data.notification?.title || 'Studio Rivelli';
  const options = {
    body: data.body || data.notification?.body || 'Hai una notifica',
    tag: data.tag || data.notification?.tag || 'sr-push',
    data: { url: data.url || data.notification?.navigate || './timesheet_rivelli.html' },
    icon: './assets/logo_app.jpg',
    badge: './assets/logo_app.jpg'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './timesheet_rivelli.html';
  const abs = new URL(target, self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(abs);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(abs);
    })
  );
});

function isAppShell(url) {
  if (url.origin !== self.location.origin) return false;
  return /\.html$/i.test(url.pathname)
    || /\/js\//.test(url.pathname)
    || url.pathname.endsWith('manifest.webmanifest');
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin.includes('n8n.cloud')) return;

  /* CDN (MSAL, font): sempre rete, mai cache SW */
  if (url.origin !== self.location.origin) return;

  if (isAppShell(url)) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      })
    )
  );
});
