const CACHE = 'sr-pwa-v18';

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

/* Web Push — JSON classico o Declarative { web_push, notification } */
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      try { data = { body: event.data ? event.data.text() : '' }; } catch { data = {}; }
    }
    const n = data.notification || {};
    const title = n.title || data.title || 'Studio Rivelli';
    const body = n.body || data.body || 'Hai una notifica';
    const url = n.navigate || data.url || './timesheet_rivelli.html';
    const tag = n.tag || data.tag || 'sr-push';
    await self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      icon: './assets/logo_app.jpg',
      badge: './assets/logo_app.jpg',
      renotify: true
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './timesheet_rivelli.html';
  const abs = new URL(target, self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(abs);
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
