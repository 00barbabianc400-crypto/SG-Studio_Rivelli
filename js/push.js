/**
 * Web Push — promemoria ore (< 8h).
 * Richiede: VAPID_PUBLIC, WEBHOOK_PUSH_SUBSCRIBE, service worker con evento "push".
 *
 * iOS/Chrome: Notification.requestPermission() deve partire nel click handler
 * (vedi index.html) PRIMA di qualsiasi altro await.
 */
(function (global) {
  const C = global.SR_CONFIG || {};
  const FLAG_KEY = 'sr_push_ore_optin';

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function isStandalone() {
    return global.matchMedia('(display-mode: standalone)').matches
      || global.navigator.standalone === true;
  }

  function isIos() {
    return /iPhone|iPad|iPod/i.test(global.navigator.userAgent)
      || (global.navigator.platform === 'MacIntel' && global.navigator.maxTouchPoints > 1);
  }

  function isSupported() {
    return !!(global.Notification && global.navigator.serviceWorker);
  }

  function hasOptedIn() {
    return sessionStorage.getItem(FLAG_KEY) === '1' || localStorage.getItem(FLAG_KEY) === '1';
  }

  function setOptedIn() {
    try { localStorage.setItem(FLAG_KEY, '1'); } catch { /* ignore */ }
    sessionStorage.setItem(FLAG_KEY, '1');
  }

  function permissionState() {
    return (global.Notification && Notification.permission) || 'n/a';
  }

  function debugInfo() {
    return [
      'perm=' + permissionState(),
      'standalone=' + isStandalone(),
      'ios=' + isIos(),
      'sw=' + !!global.navigator.serviceWorker,
      'secure=' + !!global.isSecureContext
    ].join(' · ');
  }

  /**
   * Avvia la richiesta permesso in modo sincrono dal click.
   * Ritorna una Promise — chiamare SUBITO nel listener, senza await prima.
   */
  function beginPermissionRequest() {
    if (!global.Notification) {
      return Promise.reject(new Error('Notification API assente'));
    }
    if (!global.isSecureContext) {
      return Promise.reject(new Error('Serve HTTPS (contesto non sicuro)'));
    }
    const cur = Notification.permission;
    if (cur === 'granted') return Promise.resolve('granted');
    if (cur === 'denied') {
      return Promise.reject(new Error(
        isIos()
          ? 'Notifiche bloccate per l’app. Impostazioni iPhone → Notifiche → Studio Rivelli → Consenti.'
          : 'Notifiche bloccate per il sito. Lucchetto URL → Notifiche → Consenti (o Reset autorizzazioni), poi ricarica.'
      ));
    }
    // 'default' → deve aprire il dialog del browser
    return Notification.requestPermission();
  }

  async function getRegistration() {
    if (!global.navigator.serviceWorker) return null;
    const existing = await global.navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return global.navigator.serviceWorker.ready;
  }

  async function getSubscriptionJson() {
    const reg = await getRegistration();
    if (!reg || !reg.pushManager) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.toJSON() : null;
  }

  async function createSubscription() {
    if (isIos() && !isStandalone()) {
      throw new Error('Su iPhone apri l’app dall’icona Home (non da Safari).');
    }
    const pub = String(C.VAPID_PUBLIC || '').trim();
    if (!pub) throw new Error('VAPID_PUBLIC mancante in config.js');

    const reg = await getRegistration();
    if (!reg) throw new Error('Service worker assente — ricarica la pagina');
    if (!reg.pushManager) {
      throw new Error(
        isIos()
          ? 'Push non disponibile: riapri dalla Home (PWA). ' + debugInfo()
          : 'PushManager assente. ' + debugInfo()
      );
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pub)
      });
    }
    setOptedIn();
    return sub.toJSON();
  }

  async function saveSubscription(subscription) {
    const url = C.WEBHOOK_PUSH_SUBSCRIBE;
    if (!url || !global.SRAuth) throw new Error('WEBHOOK_PUSH_SUBSCRIBE / SRAuth non disponibili');
    const user = global.SRAuth.getUser() || {};
    const resp = await global.SRAuth.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        action: 'upsert',
        email: String(user.email || '').toLowerCase(),
        name: String(user.name || ''),
        subscription,
        platform: isIos() ? 'ios'
          : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop'
      })
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error('Salvataggio subscription fallito (' + resp.status + ') ' + t.slice(0, 120));
    }
    return true;
  }

  /**
   * @param {string} [permissionAlready] se il click handler ha già chiamato beginPermissionRequest
   */
  async function enableOreReminders(permissionAlready) {
    let perm = permissionAlready || permissionState();
    if (perm !== 'granted') {
      throw new Error('Permesso non granted (' + perm + '). ' + debugInfo());
    }
    const subscription = await createSubscription();
    await global.SRAuth.ensureN8nSession();
    await saveSubscription(subscription);
    return true;
  }

  async function syncIfEnabled() {
    if (!isSupported() || !hasOptedIn()) return false;
    if (permissionState() !== 'granted') return false;
    try {
      await global.SRAuth.ensureN8nSession();
      let sub = await getSubscriptionJson();
      if (!sub) sub = await createSubscription();
      await saveSubscription(sub);
      return true;
    } catch (ex) {
      console.warn('SRPush.syncIfEnabled:', ex);
      return false;
    }
  }

  global.SRPush = {
    isSupported,
    isStandalone,
    isIos,
    hasOptedIn,
    permissionState,
    debugInfo,
    beginPermissionRequest,
    enableOreReminders,
    syncIfEnabled,
    getSubscriptionJson
  };
})(window);
