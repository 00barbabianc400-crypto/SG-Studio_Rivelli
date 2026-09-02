
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

  WEBHOOK_GESTIONE_AMMINISTRATIVA: 'https://studiorivelli.app.n8n.cloud/webhook/gestione-amministrativa-auth',
  WEBHOOK_GESTIONE_UTENTI: 'https://studiorivelli.app.n8n.cloud/webhook/gestione-utenti',
  WEBHOOK_RECUPERO_DIPENDENTI: 'https://studiorivelli.app.n8n.cloud/webhook/recupero-dipendenti',

  WEBHOOK_TR_RECUPERO: 'https://studiorivelli.app.n8n.cloud/webhook/recupero-dati',
  WEBHOOK_TR_SALVATAGGIO: 'https://studiorivelli.app.n8n.cloud/webhook/salvataggio-dati',
  WEBHOOK_TR_INVIO: 'https://studiorivelli.app.n8n.cloud/webhook/invio-dati',
  WEBHOOK_TR_CANCELLA: 'https://studiorivelli.app.n8n.cloud/webhook/cancellazione-dati',
  WEBHOOK_TR_NUOVA: 'https://studiorivelli.app.n8n.cloud/webhook/informazioni-trasferte',
  WEBHOOK_APPEND_NOTA_SPESA: 'https://studiorivelli.app.n8n.cloud/webhook/append-nota-spesa-auth',

  WEBHOOK_ST_CREATE: 'https://studiorivelli.app.n8n.cloud/webhook/caricamento-infortuni',
  WEBHOOK_ST_GET: 'https://studiorivelli.app.n8n.cloud/webhook/get-infortuni',
  WEBHOOK_ST_UPDATE: 'https://studiorivelli.app.n8n.cloud/webhook/update-delete-infortuni',

  AZURE_CLIENT_ID: 'f16e7f48-7775-4461-b27d-53e95aa61b82',
  AZURE_TENANT_ID: '6598f73a-3511-440a-bb95-3482c4fc5676',
  AZURE_SCOPES: ['User.Read'],

  TOKEN_KEY: 'sr_jwt',
  TOKEN_EXP_KEY: 'sr_jwt_exp',
  USER_KEY: 'sr_user',
  TRASFERTE_KEY: 'sr_trasferte_tappe',
  RATE_KEY: 'sr_auth_rate',

  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxbiATbcWjYVCKRQsM4mBGCv8r9bvvgaS-9QNaummPYkYz7wwur7-WsKZimPIGSRLRFkg/exec'
};
