/** Endpoint n8n + Azure AD (app registration single-tenant) */
window.SR_CONFIG = {
  WEBHOOK_AUTH: 'https://studiorivelli.app.n8n.cloud/webhook/macchina-auth-login',
  WEBHOOK_CRUD: 'https://studiorivelli.app.n8n.cloud/webhook/inserimento-cancellazione-prenotazione-auth',
  WEBHOOK_RICHIESTA: 'https://studiorivelli.app.n8n.cloud/webhook/richiesta-update-prenotazione-auth',
  WEBHOOK_UPDATE: 'https://studiorivelli.app.n8n.cloud/webhook/update-prenotazione-auth',

  /** Azure Portal → App registrations → Application (client) ID */
  AZURE_CLIENT_ID: 'f16e7f48-7775-4461-b27d-53e95aa61b82',
  /** Entra ID → Overview → Tenant ID */
  AZURE_TENANT_ID: '6598f73a-3511-440a-bb95-3482c4fc5676',
  AZURE_SCOPES: ['User.Read'],

  TOKEN_KEY: 'sr_jwt',
  TOKEN_EXP_KEY: 'sr_jwt_exp',
  USER_KEY: 'sr_user',
  RATE_KEY: 'sr_auth_rate',

  /** Google Apps Script — Deploy as Web App → URL ending in /exec */
  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyWzTxNMwCGV8mJY9bdNIZwwpSlVFysI7hHlqdd9qb5KBo89skYRkmmNoFp_WYWag8anw/exec'
};
