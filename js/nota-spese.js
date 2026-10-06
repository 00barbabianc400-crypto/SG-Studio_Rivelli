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

  const GRACE_DAYS_AFTER_END = 3;

  function addDaysYmd(ymd, days) {
    const s = toYmd(ymd);
    if (!s) return '';
    const d = new Date(s + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + Number(days || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function diffDaysYmd(fromIso, toIso) {
    const a = toYmd(fromIso);
    const b = toYmd(toIso);
    if (!a || !b) return 0;
    const t0 = new Date(a + 'T12:00:00').getTime();
    const t1 = new Date(b + 'T12:00:00').getTime();
    if (Number.isNaN(t0) || Number.isNaN(t1)) return 0;
    return Math.round((t1 - t0) / 86400000);
  }

  function inizioTrasfertaYmd(tappe) {
    let min = '';
    (tappe || []).forEach(t => {
      const da = toYmd(t && t.data_arrivo);
      if (da && (!min || da < min)) min = da;
    });
    return min;
  }

  function fineTrasfertaYmd(tappe) {
    let max = '';
    (tappe || []).forEach(t => {
      const a = toYmd(t && t.data_partenza) || toYmd(t && t.data_arrivo);
      if (a && (!max || a > max)) max = a;
    });
    return max;
  }

  function deadlineNotaSpeseYmd(tappe, graceDays) {
    const fine = fineTrasfertaYmd(tappe);
    if (!fine) return '';
    const g = graceDays == null ? GRACE_DAYS_AFTER_END : Number(graceDays);
    return addDaysYmd(fine, g);
  }

  /** Visibile da inizio trasferta fino a fine + 3 giorni (Europe/Rome). */
  function isTrasfertaNotaAccessibile(tappe, ymd, graceDays) {
    const day = ymd || todayYmdRome();
    const inizio = inizioTrasfertaYmd(tappe);
    const deadline = deadlineNotaSpeseYmd(tappe, graceDays);
    if (!inizio || !deadline || !day) return false;
    return day >= inizio && day <= deadline;
  }

  function giorniResiduiNotaSpese(tappe, ymd, graceDays) {
    const day = ymd || todayYmdRome();
    const deadline = deadlineNotaSpeseYmd(tappe, graceDays);
    if (!deadline || !day) return 0;
    return Math.max(0, diffDaysYmd(day, deadline));
  }

  function trasfertaIds(rows) {
    const ids = [];
    const seen = Object.create(null);
    (rows || []).forEach(r => {
      const tid = String(r && r.trasferta_id || '').trim();
      if (!tid || seen[tid]) return;
      seen[tid] = true;
      ids.push(tid);
    });
    return ids;
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

  /** Chip hub / accesso nota spese: trasferta aperta fino a fine+3gg. */
  function hasTrasfertaInCorso(rows, ymd) {
    const day = ymd || todayYmdRome();
    return trasfertaIds(rows).some(tid => {
      const tappe = (rows || []).filter(r => String(r.trasferta_id || '').trim() === tid);
      return isTrasfertaNotaAccessibile(tappe, day);
    });
  }

  function notaSpeseMode(rows, ymd) {
    return tappaAttuale(rows, ymd) ? 'trasferta' : 'ordinaria';
  }

  function tappaAttuale(rows, ymd) {
    const day = ymd || todayYmdRome();
    const inCorso = tappeAttiveOggi(rows, day);
    if (inCorso.length) return inCorso[0];
    for (let i = 0; i < trasfertaIds(rows).length; i++) {
      const tid = trasfertaIds(rows)[i];
      const tappe = sortTappe((rows || []).filter(r => String(r.trasferta_id || '').trim() === tid));
      if (!isTrasfertaNotaAccessibile(tappe, day)) continue;
      if (tappe.length) return tappe[tappe.length - 1];
    }
    return null;
  }

  function alertNotaSpeseMancanti(rows, ymd) {
    const day = ymd || todayYmdRome();
    let best = null;
    trasfertaIds(rows).forEach(tid => {
      const tappe = (rows || []).filter(r => String(r.trasferta_id || '').trim() === tid);
      if (!isTrasfertaNotaAccessibile(tappe, day)) return;
      const notes = [];
      tappe.forEach(t => { notes.push.apply(notes, parseNotaSpeseJson(t && t.nota_spese_json)); });
      if (notes.length) return;
      const fine = fineTrasfertaYmd(tappe);
      const deadline = deadlineNotaSpeseYmd(tappe);
      const daysLeft = giorniResiduiNotaSpese(tappe, day);
      const cand = { trasferta_id: tid, fine: fine, deadline: deadline, daysLeft: daysLeft };
      if (!best || daysLeft < best.daysLeft) best = cand;
    });
    return best;
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

  function isRimborsoKm(obj) {
    return !!(obj && typeof obj === 'object'
      && String(obj.categoria || '') === 'rimborso_km'
      && Number(obj.km) > 0);
  }

  function isNotaItem(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (isRimborsoKm(obj)) return true;
    return !!(obj.foto_id || obj.foto_url || obj.fileId)
      && (obj.tipo || obj.categoria || obj.importo != null);
  }

  function dayYmdRomeOf(v) {
    const s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return todayYmdRome(d);
    return toYmd(v);
  }

  function parseNotaOrdinariaList(raw) {
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);
    return list.filter(it => it && typeof it === 'object' && (
      it.categoria || it.tipo || it.km != null || it.foto_id || it.foto_url || it.id != null
    ));
  }

  function unwrapGetNotaOrdinaria(data) {
    let root = data;
    if (Array.isArray(root)) {
      const hit = root.find(x => x && (
        Array.isArray(x.note)
        || x.action === 'get_nota_ordinaria'
        || x.action === 'error'
        || (x.json && typeof x.json === 'object')
      ));
      root = hit || root[0] || {};
    }
    if (root && root.json && typeof root.json === 'object'
      && (Array.isArray(root.json.note) || root.json.action)) {
      root = root.json;
    }
    const note = root && Array.isArray(root.note) ? root.note : null;
    const failed = !!(root && (root.ok === false || root.action === 'error'));
    return {
      ok: !failed,
      action: root && root.action,
      message: root && root.message,
      note
    };
  }

  function groupNoteOrdinarieByDay(rows) {
    const map = new Map();
    parseNotaOrdinariaList(rows).forEach(n => {
      const day = dayYmdRomeOf(n.data || n.created_at);
      if (!day) return;
      const person = String(n.dipendente || '').trim();
      const key = day + '\t' + person.toLowerCase();
      if (!map.has(key)) map.set(key, { day: day, person: person, note: [] });
      const g = map.get(key);
      if (!g.person && person) g.person = person;
      g.note.push(n);
    });
    return [...map.values()].sort((a, b) =>
      a.day.localeCompare(b.day) || a.person.localeCompare(b.person, 'it'));
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

  function parseKm(v) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 10) / 10;
    const s = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n) || n <= 0) throw new Error('Chilometri non validi');
    return Math.round(n * 10) / 10;
  }

  function parseImporto(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100;
    const s = String(v == null ? '' : v).trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n) || n < 0) throw new Error('Importo non valido');
    return Math.round(n * 100) / 100;
  }

  const KM_EURO_RATE = 0.31;
  const MESI_ESTESI = [
    'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
  ];

  function roundEuro(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function importoVoce(it) {
    if (!it || typeof it !== 'object') return 0;
    if (isRimborsoKm(it) || String(it.categoria || '') === 'rimborso_km') {
      const km = Number(it.km);
      if (!Number.isFinite(km) || km <= 0) return 0;
      return roundEuro(km * KM_EURO_RATE);
    }
    try { return parseImporto(it.importo); } catch { return 0; }
  }

  function totaleVoci(list) {
    return roundEuro((list || []).reduce((s, it) => s + importoVoce(it), 0));
  }

  function vociDelMese(list, meseYmd) {
    const prefix = String(toYmd(meseYmd) || todayYmdRome()).slice(0, 7);
    return (list || []).filter(it => {
      const d = dayYmdRomeOf(it.data || it.created_at) || '';
      return d.slice(0, 7) === prefix;
    });
  }

  function noteOrdinarieAmbitoVerbale(list, ymd, person) {
    const day = dayYmdRomeOf(ymd) || String(ymd || '').slice(0, 10);
    const prefix = day.slice(0, 7);
    const want = String(person || '').trim().toLowerCase();
    const monthNotes = (list || []).filter(it => {
      const d = dayYmdRomeOf(it && (it.data || it.created_at)) || '';
      if (!prefix || d.slice(0, 7) !== prefix) return false;
      if (!want) return true;
      return String(it.dipendente || '').trim().toLowerCase() === want;
    }).slice();
    monthNotes.sort((a, b) => {
      const da = dayYmdRomeOf(a && (a.data || a.created_at)) || '';
      const db = dayYmdRomeOf(b && (b.data || b.created_at)) || '';
      if (da !== db) return da.localeCompare(db);
      return String((a && a.created_at) || '').localeCompare(String((b && b.created_at) || ''));
    });
    const dayNotes = monthNotes.filter(it => (dayYmdRomeOf(it.data || it.created_at) || '') === day);
    const hasOtherDays = monthNotes.some(it => (dayYmdRomeOf(it.data || it.created_at) || '') !== day);
    return { day, prefix, dayNotes, monthNotes, hasOtherDays };
  }

  function meseEstesoFromYmd(ymd) {
    const s = toYmd(ymd) || String(ymd || '').slice(0, 10);
    const m = Number(s.slice(5, 7));
    const y = s.slice(0, 4);
    const nome = MESI_ESTESI[m - 1];
    if (!nome || !/^\d{4}$/.test(y)) return '';
    return nome.charAt(0).toUpperCase() + nome.slice(1) + ' ' + y;
  }

  function fmtEuroIt(n) {
    return roundEuro(n).toFixed(2).replace('.', ',') + ' €';
  }

  function displayImporto(it) {
    if (isRimborsoKm(it)) {
      const km = String(it.km).replace('.', ',');
      return km + ' km · ' + fmtEuroIt(importoVoce(it));
    }
    return fmtEuroIt(importoVoce(it));
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid() {
    return 'ns_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  const DETTAGLIO_MAX = 120;
  const CLIENTE_MAX = 80;
  const SEDE_MAX = 80;

  function clipText(raw, max) {
    return String(raw == null ? '' : raw).trim().slice(0, max);
  }

  function requiresCliente(categoria) {
    const cat = String(categoria || '').trim();
    return cat === 'cibi_bevande' || cat === 'altro' || cat === 'mezzi' || cat === 'rimborso_km';
  }

  function requiresSede(categoria) {
    return requiresCliente(categoria);
  }

  function normalizeCliente(categoria, raw) {
    const s = clipText(raw, CLIENTE_MAX);
    if (requiresCliente(categoria) && !s) throw new Error('Cliente obbligatorio');
    return s || null;
  }

  function normalizeSede(categoria, mezzo, raw) {
    const s = clipText(raw, SEDE_MAX);
    if (requiresSede(categoria) && !s) throw new Error('Sede di riferimento obbligatoria');
    return requiresSede(categoria) ? s : null;
  }

  function suggerimentiClienteSedeGiorno(list, ymd) {
    const day = String(ymd || todayYmdRome()).slice(0, 10);
    const items = Array.isArray(list) ? list.slice() : [];
    const sameDay = items.filter((it) => dayYmdRomeOf(it && (it.data || it.created_at)) === day);
    sameDay.sort((a, b) => {
      const ta = Date.parse(a && a.created_at) || 0;
      const tb = Date.parse(b && b.created_at) || 0;
      if (ta !== tb) return ta - tb;
      return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
    });
    let cliente = '';
    let sede = '';
    for (let i = 0; i < sameDay.length; i++) {
      const c = clipText(sameDay[i] && sameDay[i].cliente, CLIENTE_MAX);
      if (c) cliente = c;
      const s = clipText(sameDay[i] && sameDay[i].sede, SEDE_MAX);
      if (s) sede = s;
    }
    return { cliente, sede };
  }

  function viewerClienteSede(it) {
    return {
      cliente: clipText(it && it.cliente, CLIENTE_MAX),
      sede: clipText(it && it.sede, SEDE_MAX)
    };
  }

  function normalizeDettaglio(categoria, raw) {
    const cat = String(categoria || '').trim();
    const clipped = String(raw == null ? '' : raw).trim().slice(0, DETTAGLIO_MAX);
    if (cat === 'altro') {
      if (!clipped) throw new Error('Specifica di cosa si tratta');
      return clipped;
    }
    return clipped || null;
  }

  function appendNotaSpesa(existingRaw, incoming) {
    const list = parseNotaSpeseJson(existingRaw);
    const categoria = String(incoming.categoria || '').trim();
    if (!categoria) throw new Error('Categoria obbligatoria');

    if (categoria === 'rimborso_km') {
      const km = parseKm(incoming.km);
      list.push({
        id: incoming.id || uid(),
        created_at: incoming.created_at || new Date().toISOString(),
        tipo: 'rimborso',
        categoria: 'rimborso_km',
        pasto: null,
        mezzo: null,
        dettaglio: normalizeDettaglio(categoria, incoming.dettaglio),
        cliente: normalizeCliente(categoria, incoming.cliente),
        sede: normalizeSede(categoria, null, incoming.sede),
        km,
        importo: 0,
        foto_url: '',
        foto_id: '',
        mime: ''
      });
      return list;
    }

    const tipo = String(incoming.tipo || '').trim().toLowerCase();
    if (tipo !== 'scontrino' && tipo !== 'fattura') {
      throw new Error('Tipo documento non valido');
    }

    let pasto = incoming.pasto ? String(incoming.pasto).trim() : null;
    let mezzo = incoming.mezzo ? String(incoming.mezzo).trim() : null;
    let dettaglio = normalizeDettaglio(categoria, incoming.dettaglio);

    if (categoria === 'cibi_bevande') {
      mezzo = null;
      if (!pasto) throw new Error('Pasto obbligatorio');
    } else if (categoria === 'mezzi') {
      pasto = null;
      if (!mezzo) throw new Error('Mezzo obbligatorio');
    } else if (categoria === 'altro') {
      pasto = null;
      mezzo = null;
    } else {
      if (categoria !== 'cibi_bevande') pasto = null;
    }

    const item = {
      id: incoming.id || uid(),
      created_at: incoming.created_at || new Date().toISOString(),
      tipo,
      categoria,
      pasto,
      mezzo,
      dettaglio,
      cliente: normalizeCliente(categoria, incoming.cliente),
      sede: normalizeSede(categoria, mezzo, incoming.sede),
      importo: parseImporto(incoming.importo),
      foto_url: String(incoming.foto_url || incoming.url || '').trim(),
      foto_id: String(incoming.foto_id || incoming.fileId || '').trim(),
      mime: String(incoming.mime || 'image/jpeg')
    };
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
      if (tipo === 'rimborso' || String(it && it.categoria || '') === 'rimborso_km') return;
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
    if (hit) return hit.label;
    if (id === 'parcheggio') return 'Parcheggio';
    if (id === 'benzina') return 'Benzina';
    return String(id || 'Altro');
  }

  function labelSottotipo(it) {
    if (!it) return '';
    if (it.pasto) {
      const p = PASTI.find(x => x.id === it.pasto);
      return p ? p.label : String(it.pasto);
    }
    if (it.mezzo) {
      const m = MEZZI.find(x => x.id === it.mezzo);
      return m ? m.label : String(it.mezzo);
    }
    if (it.km != null && Number(it.km) > 0) {
      const km = String(it.km).replace('.', ',');
      return km + ' km';
    }
    if (it.dettaglio) return String(it.dettaglio).trim();
    return '';
  }

  function labelVoce(it, opts) {
    if (!it) return '—';
    const cat = labelCategoria(it.categoria);
    const sub = labelSottotipo(it);
    const parts = [cat];
    if (sub) parts.push(sub);
    const includeNote = !opts || opts.includeNote !== false;
    const note = String(it.dettaglio || '').trim();
    if (includeNote && note && parts.indexOf(note) < 0) parts.push(note);
    return parts.join(' · ');
  }

  function nominativiUnici(list) {
    const out = [];
    (list || []).forEach(it => {
      const n = String(it && it.dipendente || '').trim();
      if (n && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }

  function studioLogoUrl() {
    try {
      const base = (typeof document !== 'undefined' && document.baseURI)
        || (typeof location !== 'undefined' && location.href)
        || '';
      return base ? new URL('assets/logo.jpg', base).href : 'assets/logo.jpg';
    } catch {
      return 'assets/logo.jpg';
    }
  }

  function buildVerbaleModel(opts) {
    const o = opts || {};
    const voci = o.voci || [];
    const names = nominativiUnici(voci);
    const nominativo = String(o.nominativo || '').trim() || names.join(' · ');
    const meseYmd = o.meseYmd
      || dayYmdRomeOf(voci[0] && (voci[0].data || voci[0].created_at))
      || todayYmdRome();
    const dataPresenteYmd = o.dataPresenteYmd || todayYmdRome();
    const blankRows = o.blankRows == null ? 3 : Math.max(0, Number(o.blankRows) || 0);
    const logoUrl = o.logoUrl || studioLogoUrl();
    const mapped = voci.map(it => {
      const km = isRimborsoKm(it);
      let descr = labelVoce(it);
      if (km) descr += ' × 0,31 €/km';
      return {
        kind: km ? 'km' : 'spesa',
        data: fmtDateIt(dayYmdRomeOf(it.data || it.created_at) || meseYmd),
        nominativo: String(it.dipendente || nominativo || '').trim(),
        descrizione: descr,
        cliente: String(it.cliente || '').trim(),
        sede: String(it.sede || '').trim(),
        importo: importoVoce(it)
      };
    });
    const rowsKm = mapped.filter(r => r.kind === 'km');
    const rowsSpesa = mapped.filter(r => r.kind === 'spesa');
    return {
      titolo: 'Verbale di rimborso nota spese',
      mese: meseEstesoFromYmd(meseYmd),
      nominativo,
      dataPresente: fmtDateIt(dataPresenteYmd),
      rows: mapped,
      rowsKm,
      rowsSpesa,
      blankRows,
      totale: totaleVoci(voci.filter(it => !isRimborsoKm(it))),
      totaleCartaCarburante: totaleVoci(voci.filter(it => isRimborsoKm(it))),
      vistoDirezione: 'Visto dalla direzione',
      vistoContabilita: 'Visto dalla contabilità',
      logoUrl
    };
  }

  function verbalePrintHtml(model) {
    const m = model || {};
    const rowsKm = m.rowsKm || (m.rows || []).filter(r => r && r.kind === 'km');
    const rowsSpesa = m.rowsSpesa || (m.rows || []).filter(r => r && r.kind !== 'km');
    function trOf(list) {
      return (list || []).map(r => (
        '<tr><td class="d">' + escHtml(r.data) + '</td><td>' + escHtml(r.nominativo) + '</td><td>'
        + escHtml(r.descrizione) + '</td><td>' + escHtml(r.cliente || '—') + '</td><td>'
        + escHtml(r.sede || '—') + '</td><td class="num">' + escHtml(fmtEuroIt(r.importo)) + '</td></tr>'
      )).join('');
    }
    function section(title, rows, foot, amt, blanks) {
      if (!(rows && rows.length)) return '';
      let body = trOf(rows);
      const n = Number(blanks) || 0;
      for (let i = 0; i < n; i++) {
        body += '<tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
      }
      return '<h2>' + escHtml(title) + '</h2>'
        + '<table><thead><tr><th>Data</th><th>Nominativo</th><th>Voce</th><th>Cliente</th><th>Sede</th><th>Importo</th></tr></thead><tbody>'
        + body + '</tbody><tfoot><tr class="tot"><td colspan="5">' + escHtml(foot)
        + '</td><td class="num">' + escHtml(fmtEuroIt(amt)) + '</td></tr></tfoot></table>';
    }
    const kmBlock = section(
      'Rimborsi chilometrici',
      rowsKm,
      'Totale da poter utilizzare con la carta carburante',
      m.totaleCartaCarburante,
      0
    );
    const spBlock = section(
      'Rimborsi spesa',
      rowsSpesa,
      'Totale rimborso',
      m.totale,
      m.blankRows
    );
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>'
      + escHtml(m.titolo || 'Verbale') + '</title><style>'
      + 'body{font-family:"DM Sans",Segoe UI,sans-serif;color:#1e293b;margin:0;padding:24px;background:#fff}'
      + '.sheet{max-width:800px;margin:0 auto}'
      + 'header{display:flex;align-items:center;gap:16px;margin-bottom:20px}'
      + 'header img{height:52px;width:auto}'
      + 'h1{font-size:18px;margin:0}'
      + 'h2{font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#334155;margin:22px 0 8px}'
      + '.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin:16px 0 8px;font-size:13px}'
      + '.meta span{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b}'
      + 'table{width:100%;border-collapse:collapse;font-size:13px}'
      + 'th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}'
      + 'th{background:#f8fafc;font-size:10px;text-transform:uppercase;letter-spacing:.04em}'
      + 'td.d{white-space:nowrap}'
      + 'td.num,.tot td{text-align:right;font-variant-numeric:tabular-nums}'
      + 'tr.blank td{height:28px}'
      + '.tot{font-weight:700}'
      + '.signs,.visti{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}'
      + '.sign-box{border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;min-height:34px;font-size:12px}'
      + '.sign-box span{display:block;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;margin-bottom:4px}'
      + '@media print{body{padding:12mm}}'
      + '</style></head><body><div class="sheet"><header>'
      + '<img src="' + escHtml(m.logoUrl || 'assets/logo.jpg') + '" alt="Studio Rivelli Consulting">'
      + '<div><h1>' + escHtml(m.titolo) + '</h1>'
      + '<p style="margin:4px 0 0;font-size:13px;color:#64748b">Studio Rivelli Consulting</p></div></header>'
      + '<div class="meta"><div><span>Mese di riferimento</span><b>' + escHtml(m.mese) + '</b></div>'
      + '<div><span>Nominativo</span><b>' + escHtml(m.nominativo) + '</b></div></div>'
      + kmBlock + spBlock
      + '<div class="signs"><div class="sign-box"><span>Data</span>' + escHtml(m.dataPresente) + '</div>'
      + '<div class="sign-box"><span>Firma</span></div></div>'
      + '<div class="visti"><div class="sign-box"><span>' + escHtml(m.vistoDirezione) + '</span></div>'
      + '<div class="sign-box"><span>' + escHtml(m.vistoContabilita) + '</span></div></div>'
      + '</div></body></html>';
  }

  function verbaleFileName(model) {
    const mese = String(model && model.mese || 'nota-spese')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9\-]/g, '');
    return 'verbale-rimborso-' + (mese || 'nota-spese') + '.html';
  }

  function printVerbale(model) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const html = verbalePrintHtml(model);
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) throw new Error('Consenti i popup per stampare il verbale');
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () {
      try { w.print(); } catch (_) {}
    }, 350);
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
    { id: 'mezzi', label: 'Mezzi' },
    { id: 'altro', label: 'Altro' },
    { id: 'rimborso_km', label: 'Rimborso chilometrico' }
  ];
  const PASTI = [
    { id: 'colazione', label: 'Colazione' },
    { id: 'pranzo', label: 'Pranzo' },
    { id: 'cena', label: 'Cena' }
  ];
  const MEZZI = [
    { id: 'taxi', label: 'Taxi' },
    { id: 'treno', label: 'Treno' },
    { id: 'autobus', label: 'Autobus' },
    { id: 'benzina', label: 'Benzina' }
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
    notaSpeseMode,
    parseKm,
    isRimborsoKm,
    KM_EURO_RATE,
    roundEuro,
    importoVoce,
    totaleVoci,
    vociDelMese,
    noteOrdinarieAmbitoVerbale,
    meseEstesoFromYmd,
    fmtEuroIt,
    displayImporto,
    buildVerbaleModel,
    verbalePrintHtml,
    verbaleFileName,
    printVerbale,
    studioLogoUrl,
    labelTappa,
    fmtDateIt,
    parseNotaSpeseJson,
    parseNotaOrdinariaList,
    unwrapGetNotaOrdinaria,
    groupNoteOrdinarieByDay,
    dayYmdRomeOf,
    appendNotaSpesa,
    stringify,
    extractTappeFromAuthRows,
    parseImporto,
    sumImportiByTipo,
    groupByCategoria,
    labelCategoria,
    labelSottotipo,
    labelVoce,
    tappeStessaTrasferta,
    aggregateTrasferta,
    addDaysYmd,
    fineTrasfertaYmd,
    inizioTrasfertaYmd,
    deadlineNotaSpeseYmd,
    isTrasfertaNotaAccessibile,
    giorniResiduiNotaSpese,
    alertNotaSpeseMancanti,
    GRACE_DAYS_AFTER_END,
    uid,
    DETTAGLIO_MAX,
    CLIENTE_MAX,
    SEDE_MAX,
    requiresCliente,
    requiresSede,
    normalizeCliente,
    normalizeSede,
    suggerimentiClienteSedeGiorno,
    viewerClienteSede,
    normalizeDettaglio,
    CATEGORIE,
    PASTI,
    MEZZI,
    TIPI
  };
})(typeof window !== 'undefined' ? window : globalThis);
