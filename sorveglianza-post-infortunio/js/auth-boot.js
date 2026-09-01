/**
 * Boot JWT hub SR — Sorveglianza Steritalia
 * Richiede ../js/config.js + ../js/auth.js caricati prima.
 */
window.STAuthBoot = (async function stAuthBoot() {
  if (typeof SRAuth === 'undefined') {
    location.replace('../index.html?err=api');
    throw new Error('Auth hub non disponibile');
  }
  try {
    if (!SRAuth.hasN8nToken()) await SRAuth.ensureN8nSession();
    if (!SRAuth.hasN8nToken()) throw new Error('Sessione JWT assente');
    if (!SRAuth.canAccessHubApp('steritalia')) {
      location.replace('../index.html');
      throw new Error('Permessi insufficienti');
    }
  } catch (ex) {
    if (SRAuth.isNotEnabledError(ex)) {
      SRAuth.redirectNotEnabled();
      throw ex;
    }
    location.replace('../index.html?err=api');
    throw ex;
  }
})();
