/**
 * Web Push — promemoria ore (< 8h).
 * Richiede: VAPID_PUBLIC, WEBHOOK_PUSH_SUBSCRIBE, service worker con evento "push".
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
    return !!(global.Notification && 'PushManager' in global && global.navigator.serviceWorker);
  }

  function hasOptedIn() {
    return sessionStorage.getItem(FLAG_KEY) === '1' || localStorage.getItem(FLAG_KEY) === '1';
  }

  function setOptedIn() {
    try { localStorage.setItem(FLAG_KEY, '1'); } catch { /* ignore */ }
    sessionStorage.setItem(FLAG_KEY, '1');
  }

  async function getRegistration() {
    if (!global.navigator.serviceWorker) return null;
    return global.navigator.serviceWorker.ready;
  }

  async function getSubscriptionJson() {
    const reg = await getRegistration();
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.toJSON() : null;
  }

  /**
   * Su iOS il permesso va chiesto NEL gesto utente (niente await prima).
   * Se chiami requestPermission dopo ensureN8nSession, Safari risponde denied senza dialog.
   */
  async function subscribe() {
    if (!isSupported()) throw new Error('Push non supportato su questo browser');
    if (isIos() && !isStandalone()) {
      throw new Error(
        'Su iPhone apri l’app dalla Home (icona), non da Safari, poi riprova.'
      );
    }

    const pub = String(C.VAPID_PUBLIC || '').trim();
    if (!pub) throw new Error('VAPID_PUBLIC mancante in config.js');

    if (Notification.permission === 'denied') {
      throw new Error(
        isIos()
          ? 'Notifiche bloccate. Impostazioni → Studio Rivelli → Notifiche → Consenti, poi riprova.'
          : 'Permesso notifiche negato nelle impostazioni del browser.'
      );
    }

    let perm = Notification.permission;
    if (perm !== 'granted') {
      perm = await Notification.requestPermission();
    }
    if (perm !== 'granted') {
      throw new Error(
        isIos()
          ? 'Permesso non concesso. Chiudi e riapri dalla Home, poi tocca di nuovo Attiva.'
          : 'Permesso notifiche negato'
      );
    }

    const reg = await getRegistration();
    if (!reg) throw new Error('Service worker non pronto — ricarica l’app dalla Home');
    if (!reg.pushManager) {
      throw new Error('PushManager assente: apri dalla Home (PWA), non dal browser');
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
        platform: /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios'
          : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop'
      })
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error('Salvataggio subscription fallito (' + resp.status + ') ' + t.slice(0, 120));
    }
    return true;
  }

  /** Attiva: prima permesso/subscribe (gesto iOS), poi JWT + salvataggio n8n */
  async function enableOreReminders() {
    const subscription = await subscribe();
    await global.SRAuth.ensureN8nSession();
    await saveSubscription(subscription);
    return true;
  }

  /** Se già permesso/opt-in, rinnova silenziosamente dopo auth (lazy) */
  async function syncIfEnabled() {
    if (!isSupported() || !hasOptedIn()) return false;
    if (Notification.permission !== 'granted') return false;
    try {
      await global.SRAuth.ensureN8nSession();
      let sub = await getSubscriptionJson();
      if (!sub) {
        const pub = String(C.VAPID_PUBLIC || '').trim();
        const reg = await getRegistration();
        if (!reg || !pub) return false;
        const raw = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pub)
        });
        sub = raw.toJSON();
      }
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
    hasOptedIn,
    enableOreReminders,
    syncIfEnabled,
    getSubscriptionJson
  };
})(window);
