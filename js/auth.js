/**
 * Auth
 */
(function (global) {
  const C = global.SR_CONFIG || {};
  let msalInstance = null;
  let msalReady = null;

  function getRedirectUri() {
    const path = global.location.pathname;
    if (path.endsWith('index.html')) {
      return global.location.origin + path;
    }
    const base = path.replace(/\/?$/, '/');
    return global.location.origin + base + 'index.html';
  }

  function getMsalConfig() {
    return {
      auth: {
        clientId: C.AZURE_CLIENT_ID,
        authority: 'https://login.microsoftonline.com/' + C.AZURE_TENANT_ID,
        redirectUri: getRedirectUri(),
        navigateToLoginRequestUrl: false
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false
      }
    };
  }

  function getToken() {
    return sessionStorage.getItem(C.TOKEN_KEY || 'sr_jwt');
  }

  function getTokenExp() {
    const v = sessionStorage.getItem(C.TOKEN_EXP_KEY || 'sr_jwt_exp');
    return v ? Number(v) : 0;
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(C.USER_KEY || 'sr_user') || 'null');
    } catch {
      return null;
    }
  }

  const VALID_ROLES = ['Dipendente', 'Amministrazione', 'HSE', 'Formazione', 'Sorveglianza Sanitaria', 'Admin'];

  /** Card hub: array ruoli ammessi; array vuoto o assente = nessun accesso (salvo Admin) */
  const HUB_APP_ROLES = {
    timesheet: ['Dipendente', 'HSE', 'Admin'],
    macchina: ['Dipendente', 'HSE', 'Formazione', 'Admin'],
    modulo: ['Dipendente', 'Amministrazione', 'HSE', 'Formazione', 'Sorveglianza Sanitaria', 'Admin'],
    nota_spese: ['Dipendente', 'Amministrazione', 'HSE', 'Formazione', 'Admin'],
    amm: ['Amministrazione', 'Admin'],
    trasferte: ['Formazione', 'Admin'],
    utenti: ['Admin'],
    steritalia: ['Sorveglianza Sanitaria', 'Admin']
  };

  function getRole() {
    const u = getUser();
    const role = String(u?.role || 'Dipendente').trim();
    return VALID_ROLES.includes(role) ? role : 'Dipendente';
  }

  function canAccessHubApp(appId) {
    if (!hasN8nToken()) return false;
    const role = getRole();
    if (role === 'Admin') return true;
    const allowed = HUB_APP_ROLES[appId];
    if (!allowed || !allowed.length) return false;
    return allowed.includes(role);
  }

  function isNotEnabledError(ex) {
    return !!(ex && (ex.code === 'NOT_ENABLED' || ex.authCode === 'not_enabled'));
  }

  /** JWT **/
  function hasN8nToken() {
    const t = getToken();
    if (!t || !t.startsWith('eyJ')) return false;
    const exp = getTokenExp();
    if (!Number.isFinite(exp) || Date.now() >= exp) {
      clearN8nSession();
      return false;
    }
    return true;
  }

  function clearN8nSession() {
    sessionStorage.removeItem(C.TOKEN_KEY || 'sr_jwt');
    sessionStorage.removeItem(C.TOKEN_EXP_KEY || 'sr_jwt_exp');
    sessionStorage.removeItem(C.USER_KEY || 'sr_user');
    sessionStorage.removeItem(C.TRASFERTE_KEY || 'sr_trasferte_tappe');
    if (global.SRPush && typeof global.SRPush.clearServerState === 'function') {
      global.SRPush.clearServerState();
    }
  }

  function clearMsalCache() {
    Object.keys(sessionStorage).forEach(k => {
      if (/^msal/i.test(k)) sessionStorage.removeItem(k);
    });
  }

  function clearSession() {
    clearN8nSession();
    clearMsalCache();
  }

  function saveN8nSession(data) {
    const token = String(data.token || '').trim();
    if (!token.startsWith('eyJ')) {
      throw new Error(
        'Risposta n8n non valida (token assente). '
      );
    }

    sessionStorage.setItem(C.TOKEN_KEY || 'sr_jwt', token);

    let expMs = NaN;
    const expRaw = data.expiresAt;
    if (expRaw && !String(expRaw).includes('$json')) {
      expMs = new Date(expRaw).getTime();
    }
    if (!Number.isFinite(expMs)) {
      expMs = Date.now() + (Number(data.expiresInSec) || 28800) * 1000;
    }
    sessionStorage.setItem(C.TOKEN_EXP_KEY || 'sr_jwt_exp', String(expMs));

    if (data.user) {
      sessionStorage.setItem(C.USER_KEY || 'sr_user', JSON.stringify(data.user));
    }
    if (Array.isArray(data.tappe)) {
      sessionStorage.setItem(C.TRASFERTE_KEY || 'sr_trasferte_tappe', JSON.stringify(data.tappe));
    }
  }

  function getTrasferteTappe() {
    try {
      const raw = sessionStorage.getItem(C.TRASFERTE_KEY || 'sr_trasferte_tappe');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function setTrasferteTappe(rows) {
    sessionStorage.setItem(
      C.TRASFERTE_KEY || 'sr_trasferte_tappe',
      JSON.stringify(Array.isArray(rows) ? rows : [])
    );
  }

  function updateTappaNotaSpese(tappaId, notaSpeseJson, lista) {
    const rows = getTrasferteTappe();
    const id = Number(tappaId);
    const next = rows.map(r => {
      if (Number(r.id) !== id) return r;
      return {
        ...r,
        nota_spese_json: typeof notaSpeseJson === 'string'
          ? notaSpeseJson
          : JSON.stringify(lista || [])
      };
    });
    setTrasferteTappe(next);
    return next;
  }

  async function initMsal() {
    if (msalReady) return msalReady;
    msalReady = (async () => {
      if (!global.msal || !global.msal.PublicClientApplication) {
        throw new Error('MSAL non caricato');
      }
      if (!C.AZURE_CLIENT_ID || C.AZURE_CLIENT_ID.includes('INSERISCI')) {
        throw new Error('Configura AZURE_CLIENT_ID in js/config.js');
      }
      msalInstance = new global.msal.PublicClientApplication(getMsalConfig());
      await msalInstance.initialize();
    })();
    return msalReady;
  }

  async function getAzureAccessToken() {
    await initMsal();
    const redirectResult = await msalInstance.handleRedirectPromise();
    if (redirectResult && redirectResult.accessToken) {
      return {
        accessToken: redirectResult.accessToken,
        tenantId: redirectResult.tenantId || C.AZURE_TENANT_ID
      };
    }
    const accounts = msalInstance.getAllAccounts();
    if (!accounts.length) return null;

    const request = {
      scopes: C.AZURE_SCOPES || ['User.Read'],
      account: accounts[0]
    };

    try {
      const result = await msalInstance.acquireTokenSilent(request);
      return {
        accessToken: result.accessToken,
        tenantId: result.tenantId || C.AZURE_TENANT_ID
      };
    } catch (ex) {
      if (ex.name === 'InteractionRequiredAuthError' || ex.errorCode === 'interaction_required') {
        const result = await msalInstance.acquireTokenPopup(request);
        return {
          accessToken: result.accessToken,
          tenantId: result.tenantId || C.AZURE_TENANT_ID
        };
      }
      throw ex;
    }
  }

  /** Hub index: c'è un account Microsoft? */
  async function isMsalLoggedIn() {
    try {
      await initMsal();
      await msalInstance.handleRedirectPromise();
      return msalInstance.getAllAccounts().length > 0;
    } catch {
      return false;
    }
  }

  function throwNotEnabled(message, authCode) {
    const err = new Error(message || 'Verifica che il tuo account sia abilitato all\'accesso');
    err.code = 'NOT_ENABLED';
    err.authCode = authCode || 'not_enabled';
    throw err;
  }

  function parseAuthResponse(raw, resp) {
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

    const rows = Array.isArray(data)
      ? data
      : (Array.isArray(data.body) ? data.body : null);

    const authObj = rows
      ? (rows.find(r => r && r.token) || rows.find(r => r && r.code) || rows[0] || {})
      : (data.body && typeof data.body === 'object' && (data.body.token || data.body.code) ? data.body : data);

    let pushRow =
      authObj.pushSubscription ||
      authObj.subscription ||
      authObj.push ||
      data.pushSubscription ||
      data.subscription ||
      null;

    if (!pushRow && rows) {
      pushRow = rows.find(r => r && r.endpoint && (r.p256dh || r.keys?.p256dh)) || null;
    }
    if (!pushRow && data.endpoint && (data.p256dh || data.keys?.p256dh)) {
      pushRow = data;
    }

    const token = authObj.token || data.token;
    const authCode = authObj.code || data.code;
    const authOk = authObj.ok !== false && data.ok !== false;
    const status = resp ? resp.status : 0;

    const looksNotEnabled =
      authCode === 'not_enabled' ||
      (status === 403 && !token) ||
      (authOk === false && !token) ||
      (/\bnot_enabled\b/i.test(raw) && !token);

    if (looksNotEnabled) {
      throwNotEnabled(
        authObj.message || data.message || 'Verifica che il tuo account sia abilitato all\'accesso',
        authCode || 'not_enabled'
      );
    }

    if (resp && !resp.ok) {
      throw new Error(
        authObj.message || data.message || data.body?.message || 'Accesso API non autorizzato (' + status + ')'
      );
    }
    if (!token) {
      throw new Error('n8n ha risposto senza token.');
    }

    let tappe = [];
    const userEmail = String((authObj.user || data.user || {}).email || '').trim().toLowerCase();
    if (rows && global.SRNotaSpese && typeof global.SRNotaSpese.extractTappeFromAuthRows === 'function') {
      tappe = global.SRNotaSpese.extractTappeFromAuthRows(rows, userEmail);
    } else if (rows) {
      tappe = rows.filter(r =>
        r && typeof r === 'object'
        && !r.token
        && (r.trasferta_id != null || (r.tappa_numero != null && r.citta != null))
        && !(r.endpoint && (r.p256dh || (r.keys && r.keys.p256dh)))
        && (!userEmail || !r.email || String(r.email).trim().toLowerCase() === userEmail)
      );
    } else if (Array.isArray(authObj.tappe)) {
      tappe = authObj.tappe;
    } else if (Array.isArray(data.tappe)) {
      tappe = data.tappe;
    }
    if (userEmail && global.SRNotaSpese && typeof global.SRNotaSpese.extractTappeFromAuthRows === 'function') {
      tappe = global.SRNotaSpese.extractTappeFromAuthRows(tappe, userEmail);
    }

    return {
      token,
      expiresAt: authObj.expiresAt || data.expiresAt,
      expiresInSec: authObj.expiresInSec ?? data.expiresInSec,
      user: authObj.user || data.user,
      push: pushRow || null,
      tappe
    };
  }

  async function exchangeAzureToken(accessToken, tenantId) {
    const resp = await global.fetch(C.WEBHOOK_AUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: String(accessToken || ''),
        tenantId: String(tenantId || C.AZURE_TENANT_ID || '')
      })
    });

    const raw = await resp.text();
    const parsed = parseAuthResponse(raw, resp);

    saveN8nSession(parsed);
    if (global.SRPush && typeof global.SRPush.applyFromAuth === 'function') {
      global.SRPush.applyFromAuth(parsed.push || null);
    } else {
      console.warn('[auth] SRPush non pronto: stato campanella non aggiornato');
    }
    return parsed;
  }

  /** Hub: firma JWT subito dopo MSAL (role + push) */
  async function establishHubSession(options) {
    const force = !!(options && options.force);
    if (!force && hasN8nToken()) return true;
    return ensureN8nSession({ force: true });
  }

  async function rejectNotEnabledAtHub() {
    clearSession();
    redirectToLogin('not_enabled');
  }

  /** Macchina / sottopagine */
  async function ensureN8nSession(options) {
    const force = !!(options && options.force);
    if (!force && hasN8nToken()) return true;

    const azure = await getAzureAccessToken();
    if (!azure || !azure.accessToken) {
      throw new Error('Sessione Microsoft non trovata. Torna alla home e accedi.');
    }

    await exchangeAzureToken(azure.accessToken, azure.tenantId);
    if (!hasN8nToken()) {
      throw new Error('n8n non ha restituito un token valido');
    }
    return true;
  }

  /** Bootstrap hub index */
  async function init() {
    await initMsal();
    const redirectResult = await msalInstance.handleRedirectPromise();
    if (redirectResult && redirectResult.account) {
      return { loggedIn: true, via: 'redirect' };
    }
    const loggedIn = msalInstance.getAllAccounts().length > 0;
    return { loggedIn, via: loggedIn ? 'msal' : 'none' };
  }

  async function loginWithMicrosoft(useRedirect) {
    await initMsal();
    const request = {
      scopes: C.AZURE_SCOPES || ['User.Read'],
      prompt: 'select_account'
    };

    if (useRedirect) {
      await msalInstance.loginRedirect(request);
      return null;
    }

    let result;
    try {
      result = await msalInstance.loginPopup(request);
    } catch (ex) {
      if (ex.errorCode === 'popup_window_error' || ex.errorCode === 'browser_auth_error') {
        await msalInstance.loginRedirect(request);
        return null;
      }
      throw ex;
    }

    return { account: result.account, via: 'msal' };
  }

  function authHeaders(extra) {
    const h = { ...(extra || {}) };
    const t = getToken();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  async function fetch(url, options) {
    if (!(await ensureN8nSession())) {
      redirectToLogin('api');
      throw new Error('Sessione API non disponibile');
    }
    const opts = { ...(options || {}) };
    opts.headers = authHeaders(opts.headers);
    const resp = await global.fetch(url, opts);
    if (resp.status === 401) {
      clearN8nSession();
      throw new Error('Token API scaduto — ricarica la pagina');
    }
    return resp;
  }

  function redirectToLogin(reason) {
    const base = global.location.pathname.replace(/[^/]+$/, '');
    let q = '';
    if (reason === 'api') q = '?err=api';
    else if (reason === 'not_enabled') q = '?err=not_enabled';
    global.location.replace(base + 'index.html' + q);
  }

  function redirectNotEnabled() {
    redirectToLogin('not_enabled');
  }

  /** macchina.html **/
  async function requireAuthAsync() {
    if (hasN8nToken()) return true;
    return ensureN8nSession();
  }

  function requireAuth() {
    if (!hasN8nToken()) {
      redirectToLogin('api');
      return false;
    }
    return true;
  }

  async function logout() {
    clearN8nSession();
    try {
      await initMsal();
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length) {
        await msalInstance.logoutRedirect({
          account: accounts[0],
          postLogoutRedirectUri: getRedirectUri()
        });
        return;
      }
    } catch {
      clearMsalCache();
    }
    redirectToLogin();
  }

  function isAuthenticated() {
    return hasN8nToken();
  }

  global.SRAuth = {
    init,
    loginWithMicrosoft,
    logout,
    fetch,
    getToken,
    getUser,
    getRole,
    getTrasferteTappe,
    setTrasferteTappe,
    updateTappaNotaSpese,
    canAccessHubApp,
    hasN8nToken,
    isMsalLoggedIn,
    isAuthenticated,
    isNotEnabledError,
    establishHubSession,
    rejectNotEnabledAtHub,
    ensureN8nSession,
    requireAuth,
    requireAuthAsync,
    clearSession,
    getRedirectUri,
    redirectToLogin,
    redirectNotEnabled,
    HUB_APP_ROLES,
    VALID_ROLES
  };
})(window);
