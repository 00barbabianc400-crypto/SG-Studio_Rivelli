
window.SR_CONFIG = {
  WEBHOOK_AUTH: 'https://studiorivelli.app.n8n.cloud/webhook/macchina-auth-login',
  WEBHOOK_CRUD: 'https://studiorivelli.app.n8n.cloud/webhook/inserimento-cancellazione-prenotazione-auth',
  WEBHOOK_RICHIESTA: 'https://studiorivelli.app.n8n.cloud/webhook/richiesta-update-prenotazione-auth',
  WEBHOOK_UPDATE: 'https://studiorivelli.app.n8n.cloud/webhook/update-prenotazione-auth',

  
  WEBHOOK_TS_RETRIEVE: 'https://studiorivelli.app.n8n.cloud/webhook/retrieve-data-auth',
  WEBHOOK_TS_SAVE: 'https://studiorivelli.app.n8n.cloud/webhook/save-data-auth',
  WEBHOOK_TS_UPDATE: 'https://studiorivelli.app.n8n.cloud/webhook/update-data-auth',
  WEBHOOK_TS_MONITOR: 'https://studiorivelli.app.n8n.cloud/webhook/monitor-data-auth',
  WEBHOOK_TS_LOAD: 'https://studiorivelli.app.n8n.cloud/webhook/load-timesheet-auth',

  /* Push: crea webhook JWT-auth "push-subscribe-auth" in n8n; VAPID_PRIVATE solo in Variables n8n */
  WEBHOOK_PUSH_SUBSCRIBE: 'https://studiorivelli.app.n8n.cloud/webhook/push-subscribe-auth',
  VAPID_PUBLIC: 'BKEDDuiZTy1wDbZWK_VPB47Mc8fwylHJYcX7hwIfWBNz_AUuRsGA4VRwQE8JvwWdspiQ7TNZIgzq3gCIxoq3qa8',

  AZURE_CLIENT_ID: 'f16e7f48-7775-4461-b27d-53e95aa61b82',
  AZURE_TENANT_ID: '6598f73a-3511-440a-bb95-3482c4fc5676',
  AZURE_SCOPES: ['User.Read'],

  TOKEN_KEY: 'sr_jwt',
  TOKEN_EXP_KEY: 'sr_jwt_exp',
  USER_KEY: 'sr_user',
  RATE_KEY: 'sr_auth_rate',

  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxbiATbcWjYVCKRQsM4mBGCv8r9bvvgaS-9QNaummPYkYz7wwur7-WsKZimPIGSRLRFkg/exec'
};
