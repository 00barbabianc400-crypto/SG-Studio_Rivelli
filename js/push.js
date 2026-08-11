/**
 * Web Push — promemoria ore (< 8h).
 *
 * Desktop Chrome: non usare requestPermission isolato (spesso "quiet UI" → default
 * senza dialog). Meglio pushManager.subscribe(), che chiede il permesso nel flusso.
 * iOS: serve PWA standalone; requestPermission con timeout (altrimenti hang infinito).
 */
(function (global) {
  const C = global.SR_CONFIG || {};
  const FLAG_KEY = 'sr_push_ore_optin';
  const SERVER_KEY = 'sr_push_server'; /* '1' = riga DT presente, '0' = assente, null = sconosciuto */

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(message)), ms);
      Promise.resolve(promise).then(
        v => { clearTimeout(t); resolve(v); },
        e => { clearTimeout(t); reject(e); }
      );
    });
  }

  function isStandalone() {
    return global.matchMedia('(display-mode: standalone)').matches
      || global.navigator.standalone === true;
  }

  function isIos() {
    return /iPhone|iPad|iPod/i.test(global.navigator.userAgent)
      || (global.navigator.platform === 'MacIntel' && global.navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/i.test(global.navigator.userAgent);
  }

  /** iPhone/iPad/Android — dove ha senso il promemoria push */
  function isMobilePushTarget() {
    return isIos() || isAndroid();
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
    setServerActive(true);
  }

  /** Aggiorna stato da risposta auth (Get push_subscriptions) */
  function applyFromAuth(row) {
    if (row && row.endpoint && String(row.active) !== 'false' && row.active !== false) {
      setServerActive(true);
      try { localStorage.setItem(FLAG_KEY, '1'); } catch { /* ignore */ }
      sessionStorage.setItem(FLAG_KEY, '1');
    } else {
      setServerActive(false);
      sessionStorage.removeItem(FLAG_KEY);
      try { localStorage.removeItem(FLAG_KEY); } catch { /* ignore */ }
    }
  }

  function setServerActive(on) {
    const v = on ? '1' : '0';
    sessionStorage.setItem(SERVER_KEY, v);
    try { localStorage.setItem(SERVER_KEY, v); } catch { /* ignore */ }
  }

  function clearServerState() {
    sessionStorage.removeItem(SERVER_KEY);
    sessionStorage.removeItem(FLAG_KEY);
    try {
      localStorage.removeItem(SERVER_KEY);
      localStorage.removeItem(FLAG_KEY);
    } catch { /* ignore */ }
  }

  function isRegisteredOnServer() {
    const v = sessionStorage.getItem(SERVER_KEY) || localStorage.getItem(SERVER_KEY);
    return v === '1';
  }

  /** Attiva solo se server dice sì (o opt-in locale se stato ancora sconosciuto) */
  function isActive() {
    const v = sessionStorage.getItem(SERVER_KEY) || localStorage.getItem(SERVER_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
    return hasOptedIn() && permissionState() === 'granted';
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

  async function getRegistration() {
    if (!global.navigator.serviceWorker) return null;
    let reg = await global.navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await global.navigator.serviceWorker.register('sw.js?v=14');
    }
    await global.navigator.serviceWorker.ready;
    return reg || global.navigator.serviceWorker.getRegistration();
  }

  async function getSubscriptionJson() {
    const reg = await getRegistration();
    if (!reg || !reg.pushManager) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.toJSON() : null;
  }

  async function ensureNotificationPermission() {
    if (!global.Notification) throw new Error('Notification API assente');
    if (!global.isSecureContext) throw new Error('Serve HTTPS');

    const cur = Notification.permission;
    if (cur === 'granted') return 'granted';
    if (cur === 'denied') {
      throw new Error(
        isIos()
          ? 'Notifiche bloccate. Impostazioni → Notifiche → Studio Rivelli → Consenti.'
          : 'Notifiche bloccate. Lucchetto URL → Notifiche → Consenti, poi ricarica.'
      );
    }

    /* iOS: prompt esplicito con timeout (senza timeout resta in hang) */
    if (isIos()) {
      if (!isStandalone()) {
        throw new Error('Apri l’app dall’icona Home (standalone), non da Safari.');
      }
      const perm = await withTimeout(
        Notification.requestPermission(),
        15000,
        'Timeout permesso iOS — riprova o Controlla Impostazioni → Notifiche'
      );
      if (perm !== 'granted') {
        throw new Error('Permesso iOS: ' + perm + '. ' + debugInfo());
      }
      return perm;
    }

    /*
     * Desktop: NON chiamare requestPermission() da solo.
     * Chrome "quieter UI" risponde default senza dialog.
     * Il permesso verrà richiesto da pushManager.subscribe().
     */
    return 'default';
  }

  async function createSubscription() {
    const pub = String(C.VAPID_PUBLIC || '').trim();
    if (!pub) throw new Error('VAPID_PUBLIC mancante in config.js');

    /* ready di solito è già risolto se SW registrato al load — evita await lunghi prima del prompt */
    const reg = await global.navigator.serviceWorker.ready;
    if (!reg || !reg.pushManager) {
      throw new Error(
        'PushManager assente (su iPhone solo dalla Home). ' + debugInfo()
      );
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pub)
        }),
        20000,
        'Timeout subscribe — lucchetto URL → Notifiche → Consenti, poi riprova'
      );
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

  async function enableOreReminders() {
    /* Desktop: vai subito a subscribe (prompt Chrome). iOS: permesso esplicito prima. */
    if (isIos()) {
      await ensureNotificationPermission();
    } else if (Notification.permission === 'denied') {
      throw new Error(
        'Notifiche bloccate. Lucchetto URL → Notifiche → Consenti, poi ricarica. ' + debugInfo()
      );
    }

    const subscription = await createSubscription();
    if (Notification.permission !== 'granted') {
      throw new Error(
        'Dopo subscribe perm=' + Notification.permission + '. '
        + 'Abilita: lucchetto URL → Notifiche → Consenti. '
        + debugInfo()
      );
    }
    await global.SRAuth.ensureN8nSession();
    await saveSubscription(subscription);
    return true;
  }

  async function disableOreReminders() {
    await global.SRAuth.ensureN8nSession();
    const url = C.WEBHOOK_PUSH_SUBSCRIBE;
    if (!url || !global.SRAuth) throw new Error('WEBHOOK_PUSH_SUBSCRIBE / SRAuth non disponibili');
    const user = global.SRAuth.getUser() || {};
    let subscription = null;
    try { subscription = await getSubscriptionJson(); } catch { /* ignore */ }

    const resp = await global.SRAuth.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        action: 'deactivate',
        active: false,
        email: String(user.email || '').toLowerCase(),
        name: String(user.name || ''),
        subscription: subscription || undefined,
        platform: isIos() ? 'ios'
          : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop'
      })
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error('Disattivazione fallita (' + resp.status + ') ' + t.slice(0, 120));
    }

    setServerActive(false);
    sessionStorage.removeItem(FLAG_KEY);
    try { localStorage.removeItem(FLAG_KEY); } catch { /* ignore */ }

    try {
      const reg = await getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) await sub.unsubscribe();
    } catch { /* ignore */ }
    return true;
  }

  async function toggleOreReminders() {
    if (isActive()) return disableOreReminders();
    return enableOreReminders();
  }

  /** Aggiorna bottone icona (verde check / rosso x). Solo mobile. */
  function paintToggleButton(btn) {
    if (!btn) return;
    const show = isMobilePushTarget();
    btn.classList.toggle('hidden', !show);
    btn.classList.toggle('is-visible', show);
    if (!show) return;
    const on = isActive();
    btn.classList.toggle('is-on', on);
    btn.classList.toggle('is-off', !on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute(
      'aria-label',
      on ? 'Promemoria ore attivo. Tocca per disattivare.' : 'Promemoria ore disattivo. Tocca per attivare.'
    );
    btn.title = on ? 'Promemoria attivo — disattiva' : 'Promemoria spento — attiva';
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
    isAndroid,
    isMobilePushTarget,
    hasOptedIn,
    isActive,
    isRegisteredOnServer,
    applyFromAuth,
    clearServerState,
    permissionState,
    debugInfo,
    enableOreReminders,
    disableOreReminders,
    toggleOreReminders,
    paintToggleButton,
    syncIfEnabled,
    getSubscriptionJson
  };
})(window);
