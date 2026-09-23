(function (g) {
  'use strict';

  const MAX_IMAGE = 10 * 1024 * 1024;
  const MAX_DOC = 12 * 1024 * 1024;
  const IMAGE_MIME = {
    'image/jpeg': 1,
    'image/jpg': 1,
    'image/png': 1,
    'image/webp': 1,
    'image/heic': 1,
    'image/heif': 1
  };
  const DOC_MIME = {
    'application/pdf': 1,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 1,
    'application/msword': 1
  };

  function fail(message) {
    return { ok: false, message: message };
  }

  function ok(extra) {
    const out = { ok: true };
    if (extra) {
      const keys = Object.keys(extra);
      for (let i = 0; i < keys.length; i++) out[keys[i]] = extra[keys[i]];
    }
    return out;
  }

  function sanitizeFileName(name) {
    let s = String(name || '').replace(/\\/g, '/');
    s = s.split('/').pop() || '';
    s = s.replace(/[<>:"|?*\x00-\x1f]/g, '_');
    s = s.replace(/\.\.+/g, '.');
    s = s.replace(/^\.+/, '');
    s = s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    if (!s || s === '.') s = 'file';
    return s;
  }

  function extOf(name) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function inspectFile(file, kind) {
    if (!file) return fail('File mancante');
    const name = sanitizeFileName(file.name || '');
    const mime = String(file.type || '').toLowerCase().split(';')[0].trim();
    const size = Number(file.size) || 0;
    const k = kind === 'documento' ? 'documento' : 'image';
    if (k === 'image') {
      if (size > MAX_IMAGE) return fail('File troppo grande (max 10 MB)');
      const ext = extOf(file.name);
      if (ext && !/^(jpe?g|png|webp|heic|heif)$/i.test(ext)) return fail('Estensione non ammessa');
      if (mime && !IMAGE_MIME[mime]) return fail('Solo foto JPEG, PNG o WEBP');
      if (!mime && !ext) return fail('Tipo file non riconosciuto');
      return ok({ mime: mime || 'image/jpeg', name: name, kind: 'image' });
    }
    if (size > MAX_DOC) return fail('File troppo grande (max 12 MB)');
    const ext = extOf(file.name);
    if (!/^(pdf|docx|doc)$/i.test(ext)) return fail('Solo PDF o DOCX');
    if (mime && !DOC_MIME[mime]) return fail('Solo PDF o DOCX');
    let docMime = mime;
    if (!docMime) {
      if (ext === 'pdf') docMime = 'application/pdf';
      else if (ext === 'doc') docMime = 'application/msword';
      else docMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return ok({ mime: docMime, name: name, kind: 'documento' });
  }

  function asciiHead(u8, n) {
    const lim = Math.min(u8.length, n || 16);
    let s = '';
    for (let i = 0; i < lim; i++) s += String.fromCharCode(u8[i]);
    return s;
  }

  function sniffBytes(bytes, kind) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!u8.length) return fail('File vuoto');
    const head = asciiHead(u8, 32).toLowerCase();
    if (head.indexOf('<svg') >= 0 || head.indexOf('<html') >= 0 || head.indexOf('<!doctype') >= 0 || head.indexOf('<script') >= 0) {
      return fail('Contenuto non ammesso');
    }
    if (kind !== 'documento') {
      if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return ok({ mime: 'image/jpeg' });
      if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return ok({ mime: 'image/png' });
      if (u8.length >= 12 && asciiHead(u8, 4) === 'RIFF' && asciiHead(u8, 12).slice(8, 12) === 'WEBP') {
        return ok({ mime: 'image/webp' });
      }
      if (u8.length >= 12 && asciiHead(u8, 8).slice(4, 8) === 'ftyp') return ok({ mime: 'image/heic' });
      return fail('Formato immagine non valido');
    }
    if (asciiHead(u8, 5) === '%PDF-') return ok({ mime: 'application/pdf' });
    if (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07)) {
      return ok({ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
    if (u8.length >= 4 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) {
      return ok({ mime: 'application/msword' });
    }
    return fail('Formato documento non valido');
  }

  function prefixFromBase64(b64, byteLen) {
    const chars = Math.ceil((byteLen || 64) / 3) * 4;
    let chunk = String(b64 || '').replace(/\s/g, '').slice(0, chars);
    while (chunk.length % 4) chunk += '=';
    try {
      const bin = atob(chunk);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    } catch (e) {
      return null;
    }
  }

  function inspectDataUrl(dataUrl, kind) {
    const raw = String(dataUrl || '');
    const m = raw.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!m) return fail('Data URL non valida');
    const declared = m[1].toLowerCase().split(';')[0].trim();
    const k = kind === 'documento' ? 'documento' : 'image';
    if (k === 'image' && !IMAGE_MIME[declared]) return fail('MIME dichiarato non ammesso');
    if (k === 'documento' && !DOC_MIME[declared]) return fail('MIME dichiarato non ammesso');
    const u8 = prefixFromBase64(m[2], 64);
    if (!u8) return fail('Base64 non valido');
    const sniff = sniffBytes(u8, k);
    if (!sniff.ok) return sniff;
    return ok({ mime: sniff.mime });
  }

  function withSession(payload) {
    const out = {};
    const src = payload || {};
    const keys = Object.keys(src);
    for (let i = 0; i < keys.length; i++) out[keys[i]] = src[keys[i]];
    const Auth = g.SRAuth;
    if (Auth && typeof Auth.getGasToken === 'function') {
      const t = Auth.getGasToken();
      if (t) out.token = t;
    }
    if (!out.email && Auth && typeof Auth.getUser === 'function') {
      const u = Auth.getUser() || {};
      if (u.email) out.email = u.email;
    }
    return out;
  }

  g.SRUploadGuard = {
    inspectFile: inspectFile,
    inspectDataUrl: inspectDataUrl,
    sniffBytes: sniffBytes,
    sanitizeFileName: sanitizeFileName,
    withSession: withSession,
    MAX_IMAGE: MAX_IMAGE,
    MAX_DOC: MAX_DOC
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
