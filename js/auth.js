/**
 * Auth Studio Rivelli
 * - Hub (index): basta sessione Microsoft (tenant Rivelli via app single-tenant)
 * - Macchina/API: JWT n8n ottenuto al primo accesso (GET prenotazioni)
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

  /** JWT n8n valido — richiesto per le API macchina */
  function hasN8nToken() {
    const t = getToken();
    if (!t || t.length < 20) return false;
    const exp = getTokenExp();
    if (!exp || Date.now() >= exp) {
      clearN8nSession();
      return false;
    }
    return true;
  }

  function clearN8nSession() {
    sessionStorage.removeItem(C.TOKEN_KEY || 'sr_jwt');
    sessionStorage.removeItem(C.TOKEN_EXP_KEY || 'sr_jwt_exp');
    sessionStorage.removeItem(C.USER_KEY || 'sr_user');
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
    sessionStorage.setItem(C.TOKEN_KEY || 'sr_jwt', data.token);
    const expMs = data.expiresAt
      ? new Date(data.expiresAt).getTime()
      : Date.now() + (data.expiresInSec || 28800) * 1000;
    sessionStorage.setItem(C.TOKEN_EXP_KEY || 'sr_jwt_exp', String(expMs));
    if (data.user) {
      sessionStorage.setItem(C.USER_KEY || 'sr_user', JSON.stringify(data.user));
    }
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
    const result = await msalInstance.acquireTokenSilent({
      scopes: C.AZURE_SCOPES || ['User.Read'],
      account: accounts[0]
    });
    return {
      accessToken: result.accessToken,
      tenantId: result.tenantId || C.AZURE_TENANT_ID
    };
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

  async function exchangeAzureToken(accessToken, tenantId) {
    const resp = await global.fetch(C.WEBHOOK_AUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: String(accessToken || ''),
        tenantId: String(tenantId || C.AZURE_TENANT_ID || '')
      })
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || !data.token) {
      throw new Error(data.message || 'Accesso API non autorizzato (' + resp.status + ')');
    }

    saveN8nSession(data);
    return data;
  }

  /** Macchina: ottieni JWT n8n da token Azure (chiamata a macchina-auth-login) */
  async function ensureN8nSession() {
    if (hasN8nToken()) return true;

    const azure = await getAzureAccessToken();
    if (!azure || !azure.accessToken) return false;

    await exchangeAzureToken(azure.accessToken, azure.tenantId);
    return hasN8nToken();
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
    const q = reason === 'api' ? '?err=api' : '';
    global.location.replace(base + 'index.html' + q);
  }

  /** macchina.html — richiede MSAL + JWT n8n prima del GET */
  async function requireAuthAsync() {
    try {
      await initMsal();
      if (!msalInstance.getAllAccounts().length) {
        redirectToLogin();
        return false;
      }
      if (!(await ensureN8nSession())) {
        redirectToLogin('api');
        return false;
      }
      return true;
    } catch (ex) {
      console.error('Auth macchina:', ex);
      redirectToLogin('api');
      return false;
    }
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

  /** @deprecated usa hasN8nToken() o isMsalLoggedIn() */
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
    hasN8nToken,
    isMsalLoggedIn,
    isAuthenticated,
    ensureN8nSession,
    requireAuth,
    requireAuthAsync,
    clearSession,
    getRedirectUri,
    redirectToLogin
  };
})(window);
