window.STApi = (function () {
  const DEMO_KEY = 'st_infortuni_demo';

  function webhookUrl(path) {
    const base = (window.ST_CONFIG?.WEBHOOK_BASE || '').replace(/\/$/, '');
    if (!base) return '';
    return base + path;
  }

  function isDemo() {
    if (window.SRAuth && typeof window.SRAuth.hasN8nToken === 'function' && window.SRAuth.hasN8nToken()) {
      return false;
    }
    return !window.ST_CONFIG?.WEBHOOK_BASE || window.ST_CONFIG.DEMO_MODE;
  }

  function demoRecords() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveDemoRecords(rows) {
    localStorage.setItem(DEMO_KEY, JSON.stringify(rows));
  }

  function uid() {
    return 'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function stripSystemFields(row) {
    if (!row || typeof row !== 'object') return row;
    const copy = { ...row };
    delete copy.id;
    delete copy.createdAt;
    delete copy.updatedAt;
    return copy;
  }

  function isRecord(obj) {
    return obj && typeof obj === 'object' && (obj.record_uid || obj.infortunato);
  }

  function normalizeRows(data) {
    if (!data) return [];

    // Oggetto singolo con wrapper rows
    if (!Array.isArray(data) && Array.isArray(data.rows)) {
      return data.rows.map(stripSystemFields);
    }
    if (!Array.isArray(data) && Array.isArray(data.data)) {
      return data.data.map(stripSystemFields);
    }

    if (Array.isArray(data)) {
      // n8n "All Incoming Items": [{ rows: [...] }]
      if (data.length === 1 && Array.isArray(data[0]?.rows)) {
        return data[0].rows.map(stripSystemFields);
      }
      if (data.every((item) => Array.isArray(item?.rows))) {
        return data.flatMap((item) => item.rows.map(stripSystemFields));
      }
      // Array piatto di record
      if (data.every((item) => isRecord(item?.json ?? item))) {
        return data.map((item) => stripSystemFields(item?.json ?? item));
      }
      // Fallback: estrai rows annidate dove presenti
      const flattened = [];
      for (const item of data) {
        const obj = item?.json ?? item;
        if (Array.isArray(obj?.rows)) {
          flattened.push(...obj.rows.map(stripSystemFields));
        } else if (isRecord(obj)) {
          flattened.push(stripSystemFields(obj));
        }
      }
      if (flattened.length) return flattened;
    }

    if (Array.isArray(data.rows)) return data.rows.map(stripSystemFields);
    if (Array.isArray(data.data)) return data.data.map(stripSystemFields);

    if (isRecord(data)) {
      return [stripSystemFields(data.row ?? data)];
    }

    if (data.row) return [stripSystemFields(data.row)];
    return [];
  }

  async function request(url, options) {
    const opts = {
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...(options?.headers || {})
      }
    };

    const doFetch =
      window.SRAuth && typeof window.SRAuth.fetch === 'function'
        ? (u, o) => window.SRAuth.fetch(u, o)
        : (u, o) => fetch(u, o);

    const res = await doFetch(url, opts);

    if (res.status === 304) {
      throw new Error('Risposta in cache (304). Riprova o correggi il Respond to Webhook.');
    }

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      console.error('Risposta non JSON da n8n:', text);
      throw new Error('Risposta webhook non valida (JSON atteso)');
    }

    if (!res.ok) {
      const msg = (data && data.message) || (typeof data === 'string' ? data : '') || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function getInfortuni() {
    if (isDemo()) {
      return STScadenze.enrichAll(demoRecords());
    }
    const base = webhookUrl(ST_CONFIG.WEBHOOK_GET);
    const url = base + (base.includes('?') ? '&' : '?') + '_=' + Date.now();
    const data = await request(url, { method: 'GET' });
    return STScadenze.enrichAll(normalizeRows(data));
  }

  async function createInfortunio(payload) {
    const body = {
      infortunato: payload.infortunato?.trim(),
      centrale: payload.centrale?.trim(),
      data_infortunio: payload.data_infortunio || STScadenze.todayISO(),
      hiv_autorizzato: payload.hiv_autorizzato || '',
      note: payload.note || '',
      stato: 'attivo',
      fase_corrente: 'tempo_zero'
    };

    if (isDemo()) {
      const rows = demoRecords();
      const record = {
        record_uid: uid(),
        ...body,
        data_esami_tempo_zero: '',
        data_prevista_45gg: '',
        data_effettiva_45gg: '',
        data_prevista_3m: '',
        data_effettiva_3m: '',
        data_prevista_6m: '',
        data_effettiva_6m: '',
        prossima_fase: '',
        prossima_scadenza: '',
        data_registrazione: new Date().toISOString(),
        ultimo_aggiornamento: new Date().toISOString()
      };
      rows.unshift(STScadenze.enrichRecord(record));
      saveDemoRecords(rows.map(stripComputed));
      return rows[0];
    }

    const url = webhookUrl(ST_CONFIG.WEBHOOK_CREATE);
    const data = await request(url, { method: 'POST', body: JSON.stringify(body) });
    const rows = normalizeRows(data);
    return STScadenze.enrichRecord(rows[0] || data);
  }

  function applyPatch(record, patch) {
    const merged = {
      ...stripComputed(record),
      ...patch,
      ultimo_aggiornamento: patch.ultimo_aggiornamento || new Date().toISOString()
    };
    return STScadenze.enrichRecord(merged);
  }

  async function updateInfortunio(recordUid, patch, existingRecord) {
    const body = {
      record_uid: recordUid,
      action: 'update',
      ...patch,
      ultimo_aggiornamento: new Date().toISOString()
    };

    if (isDemo()) {
      const rows = demoRecords();
      const idx = rows.findIndex((r) => r.record_uid === recordUid);
      if (idx < 0) throw new Error('Record non trovato');
      rows[idx] = { ...rows[idx], ...patch, ultimo_aggiornamento: body.ultimo_aggiornamento };
      const enriched = STScadenze.enrichRecord(rows[idx]);
      rows[idx] = stripComputed(enriched);
      saveDemoRecords(rows);
      return enriched;
    }

    const url = webhookUrl(ST_CONFIG.WEBHOOK_UPDATE);
    const data = await request(url, { method: 'POST', body: JSON.stringify(body) });
    const rows = normalizeRows(data);
    if (rows[0] && (rows[0].record_uid || rows[0].infortunato)) {
      return STScadenze.enrichRecord(rows[0]);
    }
    if (existingRecord) return applyPatch(existingRecord, { ...patch, ultimo_aggiornamento: body.ultimo_aggiornamento });
    return STScadenze.enrichRecord({ record_uid: recordUid, ...patch, ultimo_aggiornamento: body.ultimo_aggiornamento });
  }

  async function deleteInfortunio(recordUid) {
    const body = { record_uid: recordUid, action: 'delete' };

    if (isDemo()) {
      const rows = demoRecords().filter((r) => r.record_uid !== recordUid);
      saveDemoRecords(rows);
      return { ok: true };
    }

    const url = webhookUrl(ST_CONFIG.WEBHOOK_UPDATE);
    return request(url, { method: 'POST', body: JSON.stringify(body) });
  }

  function stripComputed(record) {
    const copy = { ...record };
    delete copy.milestones;
    delete copy.stato_calcolato;
    return copy;
  }

  return {
    isDemo,
    getInfortuni,
    createInfortunio,
    updateInfortunio,
    deleteInfortunio,
    applyPatch
  };
})();
