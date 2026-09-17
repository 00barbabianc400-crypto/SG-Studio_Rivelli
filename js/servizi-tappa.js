/**
 * Servizi tappa — servizi_json DT.
 * Canonico: array [{ id, tipo, ...campi }]
 * Legacy: oggetto { hotel: {...}, treno: {...} }
 */
(function (global) {
  function uidSrv() {
    return 'srv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function parseCosto(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (!s) return 0;
    let n;
    if (s.includes(',')) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else n = parseFloat(s.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function formatCostoIt(n) {
    if (!Number.isFinite(n) || n === 0) return '';
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  function stripMeta(dati) {
    if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return {};
    const out = { ...dati };
    delete out.id;
    delete out.tipo;
    return out;
  }

  const MIME_PDF = 'application/pdf';
  const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const MIME_DOC = 'application/msword';

  function isAllegatoMimeOk(mime) {
    const m = String(mime || '').toLowerCase().split(';')[0].trim();
    return m === MIME_PDF || m === MIME_DOCX || m === MIME_DOC;
  }

  function isAllegatoExtOk(name) {
    return /\.(pdf|docx|doc)$/i.test(String(name || ''));
  }

  function uidAllegato() {
    return 'al_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function driveFileId(item) {
    if (!item || typeof item !== 'object') return '';
    const direct = String(item.fileId || item.foto_id || '').trim();
    if (direct) return direct;
    const url = String(item.url || item.foto_url || '');
    const m = url.match(/[-\w]{25,}/);
    return m ? m[0] : '';
  }

  function isDriveUrl(url) {
    return /^https:\/\/(drive\.google\.com|lh3\.googleusercontent\.com)\//i.test(String(url || ''));
  }

  function driveViewUrl(item) {
    const id = driveFileId(item);
    if (id) return 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view';
    const raw = String(item && (item.url || item.foto_url) || '');
    return isDriveUrl(raw) ? raw : '';
  }

  function driveDownloadUrl(item) {
    const id = driveFileId(item);
    if (id) return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id);
    return driveViewUrl(item);
  }

  function normalizeAllegati(raw) {
    let data = raw;
    if (data == null || data === '') return [];
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return []; }
    }
    if (!Array.isArray(data)) {
      if (data && typeof data === 'object') data = [data];
      else return [];
    }
    return data.map(it => {
      if (!it || typeof it !== 'object') return null;
      const nome = String(it.nome || it.fileName || it.name || '').trim();
      const mime = String(it.mime || '').trim();
      const fileId = driveFileId(it);
      const url = String(it.url || it.foto_url || '').trim();
      const dataUrl = String(it.dataUrl || '').trim();
      const pending = !!it._pending;
      if (!fileId && !url && !dataUrl && !pending) return null;
      const out = {
        id: it.id ? String(it.id) : uidAllegato(),
        nome: nome || 'allegato',
        mime: mime || (/\.pdf$/i.test(nome) ? MIME_PDF : MIME_DOCX),
        fileId,
        url: url || (fileId ? ('https://drive.google.com/open?id=' + fileId) : '')
      };
      if (dataUrl) out.dataUrl = dataUrl;
      if (pending || (dataUrl && !fileId)) out._pending = true;
      return out;
    }).filter(Boolean);
  }

  function persistAllegati(raw) {
    return normalizeAllegati(raw)
      .filter(a => a.fileId || isDriveUrl(a.url))
      .map(a => ({
        id: a.id,
        nome: a.nome,
        mime: a.mime,
        fileId: a.fileId,
        url: a.fileId ? ('https://drive.google.com/open?id=' + a.fileId) : a.url
      }));
  }

  function isPendingAllegato(a) {
    if (!a || typeof a !== 'object') return false;
    if (a.fileId || isDriveUrl(a.url)) return false;
    return !!(a._pending || a.dataUrl);
  }

  function pendingAllegati(raw) {
    return normalizeAllegati(raw).filter(isPendingAllegato);
  }

  function asItem(tipo, dati, keepId) {
    const t = String(tipo || dati && dati.tipo || '').trim();
    if (!t) return null;
    const rest = stripMeta(dati);
    if (Object.prototype.hasOwnProperty.call(rest, 'allegati')) {
      rest.allegati = normalizeAllegati(rest.allegati);
    }
    const id = (keepId && dati && dati.id) ? String(dati.id) : (dati && dati.id ? String(dati.id) : uidSrv());
    return { id: id || uidSrv(), tipo: t, ...rest };
  }

  function parseJson(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'object') return raw;
    const s = String(raw).trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  }

  /** Oggetto legacy o array → lista canonica. */
  function normalizeServizi(raw) {
    const data = parseJson(raw);
    if (data == null) return [];
    if (Array.isArray(data)) {
      return data.map(item => {
        if (!item || typeof item !== 'object') return null;
        if (item.tipo) return asItem(item.tipo, item, true);
        const keys = Object.keys(item).filter(k => k !== 'id');
        if (keys.length === 1 && item[keys[0]] && typeof item[keys[0]] === 'object') {
          return asItem(keys[0], { id: item.id, ...item[keys[0]] }, true);
        }
        return null;
      }).filter(Boolean);
    }
    if (typeof data !== 'object') return [];
    return Object.entries(data).map(([tipo, dati]) => {
      if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return null;
      return asItem(tipo, dati, true);
    }).filter(Boolean);
  }

  function serializeServizi(list) {
    const arr = normalizeServizi(list).map(s => {
      const out = { ...s };
      if (out.allegati) out.allegati = persistAllegati(out.allegati);
      return out;
    });
    return JSON.stringify(arr);
  }

  function sommaCosti(list) {
    return normalizeServizi(list).reduce((acc, it) => acc + parseCosto(it.costo), 0);
  }

  function costiAggregati(list) {
    const map = {};
    normalizeServizi(list).forEach(it => {
      const n = parseCosto(it.costo);
      if (n <= 0) return;
      map[it.tipo] = (map[it.tipo] || 0) + n;
    });
    const out = {};
    Object.keys(map).forEach(k => { out[k] = formatCostoIt(map[k]); });
    return out;
  }

  function mergeCostoColonna(list, tipo, costoStr) {
    const arr = normalizeServizi(list);
    const c = String(costoStr == null ? '' : costoStr).trim();
    if (!c || !tipo) return arr;
    const hit = arr.find(x => x.tipo === tipo);
    if (hit) {
      if (hit.costo == null || String(hit.costo).trim() === '') hit.costo = c;
      return arr;
    }
    arr.push(asItem(tipo, { costo: c, stato: 'da_prenotare' }, false));
    return arr;
  }

  function ensureList(tappa) {
    if (!tappa) return [];
    tappa.servizi = normalizeServizi(tappa.servizi);
    return tappa.servizi;
  }

  function firstNonEmpty() {
    for (let i = 0; i < arguments.length; i++) {
      const s = arguments[i] == null ? '' : String(arguments[i]).trim();
      if (s) return s;
    }
    return '';
  }

  function campiPagamento(dati) {
    const d = dati && typeof dati === 'object' ? dati : {};
    const po = d.prenotazione_operatrice && typeof d.prenotazione_operatrice === 'object'
      ? d.prenotazione_operatrice
      : {};
    return {
      metodo_pagamento: firstNonEmpty(po.metodo_pagamento, d.metodo_pagamento),
      valore_voucher: firstNonEmpty(po.valore_voucher, d.valore_voucher),
      metodo_pagamento_differenza: firstNonEmpty(po.metodo_pagamento_differenza, d.metodo_pagamento_differenza)
    };
  }

  function statoServizio(dati) {
    const d = dati && typeof dati === 'object' ? dati : {};
    const po = d.prenotazione_operatrice && typeof d.prenotazione_operatrice === 'object'
      ? d.prenotazione_operatrice
      : {};
    const top = firstNonEmpty(d.stato);
    if (top) return top;
    if (po.prenotato) return 'prenotato';
    return '';
  }

  function mergePagamentoSuServizio(dati, pag) {
    const d = { ...(dati && typeof dati === 'object' ? dati : {}) };
    const incoming = pag && typeof pag === 'object' ? pag : {};
    const keep = campiPagamento(d);
    const metodo = firstNonEmpty(incoming.metodo_pagamento, keep.metodo_pagamento);
    const isVoucher = metodo === 'voucher';
    const voucher = isVoucher
      ? firstNonEmpty(incoming.valore_voucher, keep.valore_voucher)
      : '';
    const diffMetodo = isVoucher
      ? firstNonEmpty(incoming.metodo_pagamento_differenza, keep.metodo_pagamento_differenza)
      : '';
    d.metodo_pagamento = metodo;
    if (isVoucher && voucher) d.valore_voucher = voucher;
    else delete d.valore_voucher;
    if (isVoucher && diffMetodo) d.metodo_pagamento_differenza = diffMetodo;
    else delete d.metodo_pagamento_differenza;
    const po = {
      ...(d.prenotazione_operatrice && typeof d.prenotazione_operatrice === 'object'
        ? d.prenotazione_operatrice
        : {})
    };
    po.metodo_pagamento = metodo;
    if (incoming.costo_servizio != null && String(incoming.costo_servizio).trim() !== '') {
      po.costo_servizio = incoming.costo_servizio;
    }
    if (isVoucher) {
      po.valore_voucher = voucher;
      po.metodo_pagamento_differenza = diffMetodo;
      if (incoming.differenza_pagamento != null) po.differenza_pagamento = incoming.differenza_pagamento;
    } else {
      po.valore_voucher = '';
      po.metodo_pagamento_differenza = '';
      po.differenza_pagamento = 0;
    }
    if (incoming.giornate_da != null) po.giornate_da = incoming.giornate_da;
    if (incoming.giornate_a != null) po.giornate_a = incoming.giornate_a;
    if (incoming.prenotato != null) po.prenotato = !!incoming.prenotato;
    d.prenotazione_operatrice = po;
    return d;
  }

  function noteTappaDaSorgenti(tappaNote, noteGenerali, precedente) {
    return firstNonEmpty(tappaNote, precedente, noteGenerali);
  }

  /** Copia File dal DataTransfer prima che il browser lo revochi dopo il drop. */
  function snapshotFile(file) {
    if (file == null) return file;
    if (typeof File === 'undefined') return file;
    try {
      const name = file.name || 'allegato';
      const type = file.type || 'application/octet-stream';
      return new File([file], name, { type, lastModified: file.lastModified || Date.now() });
    } catch {
      return file;
    }
  }

  global.SRServiziTappa = {
    uidSrv,
    parseCosto,
    formatCostoIt,
    normalizeServizi,
    serializeServizi,
    sommaCosti,
    costiAggregati,
    mergeCostoColonna,
    ensureList,
    firstNonEmpty,
    campiPagamento,
    statoServizio,
    mergePagamentoSuServizio,
    noteTappaDaSorgenti,
    snapshotFile,
    uidAllegato,
    isAllegatoMimeOk,
    isAllegatoExtOk,
    normalizeAllegati,
    persistAllegati,
    isPendingAllegato,
    pendingAllegati,
    isDriveUrl,
    driveFileId,
    driveViewUrl,
    driveDownloadUrl
  };
  if (typeof window !== 'undefined') window.SRServiziTappa = global.SRServiziTappa;
})(typeof globalThis !== 'undefined' ? globalThis : window);
