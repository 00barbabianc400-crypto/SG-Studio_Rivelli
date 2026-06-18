/**
 * Auth Studio Rivelli — Microsoft 365 (MSAL) + JWT n8n
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

  function isAuthenticated() {
    const t = getToken();
    if (!t) return false;
    const exp = getTokenExp();
    if (exp && Date.now() >= exp) {
      clearSession();
      return false;
    }
    return true;
  }

  function clearSession() {
    sessionStorage.removeItem(C.TOKEN_KEY || 'sr_jwt');
    sessionStorage.removeItem(C.TOKEN_EXP_KEY || 'sr_jwt_exp');
    sessionStorage.removeItem(C.USER_KEY || 'sr_user');
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
      throw new Error(data.message || 'Accesso non autorizzato (' + resp.status + ')');
    }

    saveN8nSession(data);
    return data;
  }

  async function trySilentLogin() {
    await initMsal();
    const accounts = msalInstance.getAllAccounts();
    if (!accounts.length) return null;

    const result = await msalInstance.acquireTokenSilent({
      scopes: C.AZURE_SCOPES || ['User.Read'],
      account: accounts[0]
    });
    return exchangeAzureToken(result.accessToken, result.tenantId || C.AZURE_TENANT_ID);
  }

  async function init() {
    await initMsal();

    const redirectResult = await msalInstance.handleRedirectPromise();
    if (redirectResult && redirectResult.accessToken) {
      await exchangeAzureToken(
        redirectResult.accessToken,
        redirectResult.tenantId || C.AZURE_TENANT_ID
      );
      return { loggedIn: true, via: 'redirect' };
    }

    if (isAuthenticated()) {
      return { loggedIn: true, via: 'session' };
    }

    try {
      await trySilentLogin();
      return { loggedIn: true, via: 'silent' };
    } catch {
      return { loggedIn: false };
    }
  }

  async function loginWithMicrosoft(useRedirect) {
    await initMsal();
    const request = {
      scopes: C.AZURE_SCOPES || ['User.Read'],
      prompt: 'select_account'
    };

    let result;
    if (useRedirect) {
      await msalInstance.loginRedirect(request);
      return null;
    }

    try {
      result = await msalInstance.loginPopup(request);
    } catch (ex) {
      if (ex.errorCode === 'popup_window_error' || ex.errorCode === 'browser_auth_error') {
        await msalInstance.loginRedirect(request);
        return null;
      }
      throw ex;
    }

    return exchangeAzureToken(result.accessToken, result.tenantId || C.AZURE_TENANT_ID);
  }

  function authHeaders(extra) {
    const h = { ...(extra || {}) };
    const t = getToken();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  async function fetch(url, options) {
    if (!isAuthenticated()) {
      redirectToLogin();
      throw new Error('Sessione scaduta');
    }
    const opts = { ...(options || {}) };
    opts.headers = authHeaders(opts.headers);
    const resp = await global.fetch(url, opts);
    if (resp.status === 401 || resp.status === 403) {
      clearSession();
      redirectToLogin();
      throw new Error('Sessione scaduta — accedi di nuovo');
    }
    return resp;
  }

  function redirectToLogin() {
    const base = global.location.pathname.replace(/[^/]+$/, '');
    global.location.replace(base + 'index.html');
  }

  function requireAuth() {
    if (!isAuthenticated()) {
      redirectToLogin();
      return false;
    }
    return true;
  }

  async function logout() {
    clearSession();
    try {
      await initMsal();
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length) {
        await msalInstance.logoutPopup({ account: accounts[0], mainWindowRedirectUri: getRedirectUri() });
      }
    } catch {
      /* sessione n8n già cancellata */
    }
    redirectToLogin();
  }

  global.SRAuth = {
    init,
    loginWithMicrosoft,
    logout,
    fetch,
    getToken,
    getUser,
    isAuthenticated,
    requireAuth,
    clearSession,
    getRedirectUri
  };
})(window);
