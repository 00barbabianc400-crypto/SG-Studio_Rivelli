/**
 * n8n Code — push-subscribe-auth
 * Nome: "Code Push Subscribe"
 *
 * FLUSSO:
 *   Webhook (JWT Auth) → Code Push Subscribe → Data Table upsert → Respond { ok: true }
 *
 * DT consigliata `push_subscriptions`:
 *   email, name, dipendente, endpoint, p256dh, auth, platform, active, updated_at
 *
 * Output json pronto per Upsert (match su email+endpoint o solo email).
 */

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
  const authH = headers.authorization || headers.Authorization || '';
  const token = String(authH).replace(/^Bearer\s+/i, '').trim();
  const payload = decodeJwtPayload(token);
  if (!payload) return { email: '', name: '' };
  return {
    email: String(payload.sub || payload.email || '').trim().toLowerCase(),
    name: String(payload.name || payload.displayName || '').trim()
  };
}

const raw = $input.first().json;
const body = raw.body && typeof raw.body === 'object' ? raw.body : raw;
const { email: jwtEmail, name: jwtName } = emailFromJwt(raw);

const email = String(body.email || jwtEmail || '').trim().toLowerCase();
const name = String(body.name || jwtName || '').trim();
const sub = body.subscription || {};
const endpoint = String(sub.endpoint || body.endpoint || '').trim();
const p256dh = String(sub.keys?.p256dh || body.p256dh || '').trim();
const auth = String(sub.keys?.auth || body.auth || '').trim();

if (!email || !endpoint || !p256dh || !auth) {
  return [{
    json: {
      ok: false,
      message: 'Servono email + subscription.endpoint + keys.p256dh + keys.auth'
    }
  }];
}

if (jwtEmail && jwtEmail !== email) {
  return [{ json: { ok: false, message: 'Email body non coincide col JWT' } }];
}

return [{
  json: {
    ok: true,
    email,
    name,
    dipendente: name,
    endpoint,
    p256dh,
    auth,
    platform: String(body.platform || 'unknown'),
    active: true,
    updated_at: new Date().toISOString()
  }
}];
