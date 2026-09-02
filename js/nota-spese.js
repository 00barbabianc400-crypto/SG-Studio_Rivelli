/**
 * Nota spese trasferte — tappe in corso (Europe/Rome) + JSON giustificativi.
 */
(function (global) {
  const MESI_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  function todayYmdRome(now) {
    const d = now instanceof Date ? now : new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    // en-CA → YYYY-MM-DD
    return fmt.format(d);
  }

  function toYmd(v) {
    const s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    return '';
  }

  function isTappaInCorso(row, ymd) {
    const day = ymd || todayYmdRome();
    const da = toYmd(row && row.data_arrivo);
    const a = toYmd(row && row.data_partenza) || da;
    if (!da || !day) return false;
    return day >= da && day <= a;
  }

  function sortTappe(rows) {
    return (rows || []).slice().sort((a, b) => {
      const tid = String(a.trasferta_id || '').localeCompare(String(b.trasferta_id || ''));
      if (tid) return tid;
      return Number(a.tappa_numero) - Number(b.tappa_numero);
    });
  }

  function tappeAttiveOggi(rows, ymd) {
    const day = ymd || todayYmdRome();
    return sortTappe(rows).filter(r => isTappaInCorso(r, day));
  }

  function hasTrasfertaInCorso(rows, ymd) {
    return tappeAttiveOggi(rows, ymd).length > 0;
  }

  function tappaAttuale(rows, ymd) {
    const list = tappeAttiveOggi(rows, ymd);
    return list[0] || null;
  }

  function fmtDateIt(ymd) {
    const s = toYmd(ymd);
    if (!s) return '—';
    const [y, m, d] = s.split('-').map(Number);
    return d + ' ' + MESI_IT[(m || 1) - 1] + ' ' + y;
  }

  function labelTappa(row) {
    if (!row) return '—';
    const n = row.tappa_numero != null ? String(row.tappa_numero) : '?';
    const citta = String(row.citta || '').trim() || '—';
    const da = fmtDateIt(row.data_arrivo);
    const a = fmtDateIt(row.data_partenza || row.data_arrivo);
    return 'Tappa ' + n + ' · ' + citta + ' · ' + da + (a !== da ? ' – ' + a : '');
  }

  function isNotaItem(obj) {
    return !!(obj && typeof obj === 'object' && (obj.foto_id || obj.foto_url || obj.fileId)
      && (obj.tipo || obj.categoria || obj.importo != null));
  }

  function parseNotaSpeseJson(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.filter(isNotaItem);
    if (typeof raw === 'object' && isNotaItem(raw)) return [raw];
    const s = String(raw).trim();
    if (!s) return [];
    try {
      const data = JSON.parse(s);
      if (Array.isArray(data)) return data.filter(isNotaItem);
      if (data && Array.isArray(data.note)) return data.note.filter(isNotaItem);
      if (isNotaItem(data)) return [data];
    } catch {
      return [];
    }
    return [];
  }

  function parseImporto(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100;
    const s = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n) || n < 0) throw new Error('Importo non valido');
    return Math.round(n * 100) / 100;
  }

  function uid() {
    return 'ns_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function appendNotaSpesa(existingRaw, incoming) {
    const list = parseNotaSpeseJson(existingRaw);
    const tipo = String(incoming.tipo || '').trim().toLowerCase();
    if (tipo !== 'scontrino' && tipo !== 'fattura') {
      throw new Error('Tipo documento non valido');
    }
    const categoria = String(incoming.categoria || '').trim();
    if (!categoria) throw new Error('Categoria obbligatoria');
    const item = {
      id: incoming.id || uid(),
      created_at: incoming.created_at || new Date().toISOString(),
      tipo,
      categoria,
      pasto: incoming.pasto ? String(incoming.pasto).trim() : null,
      importo: parseImporto(incoming.importo),
      foto_url: String(incoming.foto_url || incoming.url || '').trim(),
      foto_id: String(incoming.foto_id || incoming.fileId || '').trim(),
      mime: String(incoming.mime || 'image/jpeg')
    };
    if (categoria !== 'cibi_bevande') item.pasto = null;
    if (!item.foto_id && !item.foto_url) {
      throw new Error('Giustificativo senza file Drive');
    }
    list.push(item);
    return list;
  }

  function stringify(list) {
    return JSON.stringify(Array.isArray(list) ? list : []);
  }

  function extractTappeFromAuthRows(rows, userEmail) {
    if (!Array.isArray(rows)) return [];
    const email = String(userEmail || '').trim().toLowerCase();
    return rows.filter(r => {
      if (!r || typeof r !== 'object') return false;
      if (r.token) return false;
      if (r.endpoint && (r.p256dh || (r.keys && r.keys.p256dh))) return false;
      const isTappa = r.trasferta_id != null || (r.tappa_numero != null && r.citta != null);
      if (!isTappa) return false;
      if (!email) return true;
      const rowEmail = String(r.email || '').trim().toLowerCase();
      return !rowEmail || rowEmail === email;
    });
  }

  function sumImportiByTipo(list) {
    const out = { scontrino: 0, fattura: 0, totale: 0 };
    (list || []).forEach(it => {
      let n = 0;
      try { n = parseImporto(it && it.importo); } catch { n = 0; }
      const tipo = String(it && it.tipo || '').toLowerCase();
      if (tipo === 'fattura') out.fattura += n;
      else out.scontrino += n;
      out.totale += n;
    });
    out.scontrino = Math.round(out.scontrino * 100) / 100;
    out.fattura = Math.round(out.fattura * 100) / 100;
    out.totale = Math.round(out.totale * 100) / 100;
    return out;
  }

  function groupByCategoria(list) {
    const map = {};
    (list || []).forEach(it => {
      const cat = String(it && it.categoria || 'altro').trim() || 'altro';
      if (!map[cat]) map[cat] = [];
      map[cat].push(it);
    });
    return map;
  }

  function labelCategoria(id) {
    const hit = CATEGORIE.find(c => c.id === id);
    return hit ? hit.label : String(id || 'Altro');
  }

  function tappeStessaTrasferta(rows, trasfertaId) {
    const tid = String(trasfertaId || '').trim();
    if (!tid) return [];
    return (rows || [])
      .filter(r => String(r.trasferta_id || '').trim() === tid)
      .slice()
      .sort((a, b) => Number(a.tappa_numero) - Number(b.tappa_numero)
        || String(a.data_arrivo || '').localeCompare(String(b.data_arrivo || '')));
  }

  function aggregateTrasferta(tappe) {
    const all = [];
    (tappe || []).forEach(t => {
      all.push.apply(all, parseNotaSpeseJson(t && t.nota_spese_json));
    });
    return sumImportiByTipo(all);
  }

  const CATEGORIE = [
    { id: 'cibi_bevande', label: 'Cibi e bevande' },
    { id: 'parcheggio', label: 'Parcheggio' },
    { id: 'benzina', label: 'Benzina' }
  ];
  const PASTI = [
    { id: 'colazione', label: 'Colazione' },
    { id: 'pranzo', label: 'Pranzo' },
    { id: 'cena', label: 'Cena' }
  ];
  const TIPI = [
    { id: 'scontrino', label: 'Scontrino' },
    { id: 'fattura', label: 'Fattura' }
  ];

  global.SRNotaSpese = {
    todayYmdRome,
    toYmd,
    isTappaInCorso,
    tappeAttiveOggi,
    hasTrasfertaInCorso,
    tappaAttuale,
    labelTappa,
    fmtDateIt,
    parseNotaSpeseJson,
    appendNotaSpesa,
    stringify,
    extractTappeFromAuthRows,
    parseImporto,
    sumImportiByTipo,
    groupByCategoria,
    labelCategoria,
    tappeStessaTrasferta,
    aggregateTrasferta,
    uid,
    CATEGORIE,
    PASTI,
    TIPI
  };
})(typeof window !== 'undefined' ? window : globalThis);
