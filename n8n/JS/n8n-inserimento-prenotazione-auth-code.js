// n8n Code — CRUD prenotazione auth (webhook inserimento-cancellazione-prenotazione-auth)
// Webhook: JWT Auth (HS256)
//
// Azioni ammesse: get, insert (delete/erase rifiutati — usare update-prenotazione-auth)
//
// Colonna Data Table richiesta: email (string) — email Azure al momento dell'insert
// Colonna Data Table nuova: numero_trasferta (string)
//   — obbligatoria se tipo_utilizzo = "Trasferta"
//   — vuota se "Roma e dintorni"
//
// Body insert:
//   { "action": "insert", "operatore", "tipo_utilizzo", "data_da", "data_a", "note?", "numero_trasferta?" }
//
// Output insert include email dal JWT (ignora email inviata dal client se presente).
// Mapping Insert row: includere numero_trasferta = {{ $json.numero_trasferta }}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function emailFromJwt(raw) {
  const headers = raw.headers || {};
  const auth = headers.authorization || headers.Authorization || '';
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  const payload = decodeJwtPayload(token);
  if (!payload) return '';
  return String(payload.sub || payload.email || '').trim().toLowerCase();
}

function dateOnly(val) {
  const m = String(val || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function toStorageDate(val) {
  const d = dateOnly(val);
  return d ? `${d}T12:00:00.000Z` : '';
}

function normalizeNumeroTrasferta(tipoUtilizzo, raw) {
  const tipo = String(tipoUtilizzo || '').trim();
  const value = String(raw == null ? '' : raw).trim();
  if (tipo.toLowerCase() === 'trasferta') {
    if (!value) {
      return { ok: false, error: 'numero_trasferta obbligatorio se tipo è Trasferta' };
    }
    return { ok: true, value };
  }
  return { ok: true, value: '' };
}

const raw = $input.first().json;
const body = raw.body ?? raw;
const action = String(body.action || 'get').toLowerCase().trim();
const callerEmail = emailFromJwt(raw);

if (!callerEmail) {
  return [{ json: { action: 'error', message: 'Token JWT non valido o email assente' } }];
}

if (action === 'get') {
  return [{ json: { action: 'get' } }];
}

if (action === 'delete' || action === 'erase') {
  return [{ json: { action: 'error', message: 'Usa update-prenotazione-auth per cancellare' } }];
}

if (action !== 'insert') {
  return [{ json: { action: 'error', message: 'action non valida: ' + action } }];
}

const operatore = String(body.operatore || '').trim();
const tipo_utilizzo = String(body.tipo_utilizzo || '').trim();
const data_da = dateOnly(body.data_da);
const data_a = dateOnly(body.data_a);
const note = body.note != null ? String(body.note).trim() : '';
const numTr = normalizeNumeroTrasferta(tipo_utilizzo, body.numero_trasferta);

if (!operatore || !tipo_utilizzo || !data_da || !data_a) {
  return [{ json: { action: 'error', message: 'campi obbligatori mancanti' } }];
}
if (data_a < data_da) {
  return [{ json: { action: 'error', message: 'data fine precedente a data inizio' } }];
}
if (!numTr.ok) {
  return [{ json: { action: 'error', message: numTr.error } }];
}

return [{
  json: {
    action: 'insert',
    operatore,
    tipo_utilizzo,
    data_da: toStorageDate(data_da),
    data_a: toStorageDate(data_a),
    note,
    numero_trasferta: numTr.value,
    email: callerEmail,
    creato_il: new Date().toISOString(),
    creato_da: callerEmail
  }
}];
