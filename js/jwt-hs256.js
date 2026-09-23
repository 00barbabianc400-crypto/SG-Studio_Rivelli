(function (g) {
  'use strict';
  const crypto = require('crypto');

  function b64url(input) {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function sign(payload, secret) {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return header + '.' + body + '.' + sig;
  }

  function verify(token, secret) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || !secret) return null;
    const expect = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (expect !== parts[2]) return null;
    try {
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp != null && now >= Number(payload.exp)) return null;
      return payload;
    } catch (e) {
      return null;
    }
  }

  function deriveGasUploadKey(secret) {
    return crypto.createHash('sha256').update(String(secret || ''), 'utf8').digest('hex');
  }

  g.SRJwtHs256 = { sign: sign, verify: verify, deriveGasUploadKey: deriveGasUploadKey };
})(typeof globalThis !== 'undefined' ? globalThis : this);
