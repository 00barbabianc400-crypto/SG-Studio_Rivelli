/**
 * Elenco dipendenti + contesto Excel/prenotazioni auto (webhook recupero-dipendenti).
 */
(function (global) {
  const MESI = {
    gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
    luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12
  };

  function normEmail(v) {
    return String(v || '').trim().toLowerCase();
  }

  function todayYmdRome() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  }

  function dateOnly(val) {
    const m = String(val || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function prenotazioneDaOggi(p, todayYmd) {
    if (!p) return false;
    const today = todayYmd || todayYmdRome();
    const fine = dateOnly(p.data_a) || dateOnly(p.data_da);
    if (!fine) return true;
    return fine >= today;
  }

  function isTrasfertaTipo(p) {
    return String(p && p.tipo_utilizzo || '').trim().toLowerCase() === 'trasferta';
  }

  function cellStr(v) {
    if (v == null || v === '') return '';
    return String(v).trim();
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fracToHm(n) {
    const total = Math.round(n * 24 * 60);
    const h = Math.floor(total / 60) % 24;
    const m = ((total % 60) + 60) % 60;
    return pad2(h) + ':' + pad2(m);
  }

  function formatExcelOra(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1) return fracToHm(v);
    const s = String(v).trim();
    if (!s) return '';
    if (/^\d{1,2}:\d{2}/.test(s)) return s;
    const n = Number(s.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0 && n < 1) return fracToHm(n);
    return s;
  }

  function parseMeseCell(s) {
    const t = String(s || '').trim();
    if (!t) return { mese: '', month: 0, oraFromMese: '' };
    const lower = t.toLowerCase();
    let month = 0;
    let nome = '';
    Object.keys(MESI).forEach(k => {
      if (lower.indexOf(k) === 0 || lower.indexOf(k) !== -1 && !nome) {
        if (lower.indexOf(k) === 0 || new RegExp('\\b' + k + '\\b', 'i').test(t)) {
          month = MESI[k];
          nome = k.charAt(0).toUpperCase() + k.slice(1);
        }
      }
    });
    const time = t.match(/(\d{1,2}:\d{2})/);
    return { mese: nome || t, month, oraFromMese: time ? time[1] : '' };
  }

  function parseGiorni(dataCell) {
    const t = String(dataCell || '').trim();
    if (!t) return [];
    const nums = t.match(/\d{1,2}/g);
    if (!nums) return [];
    const days = nums.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 31);
    const range = t.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      const out = [];
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let d = lo; d <= hi; d++) out.push(d);
      return out;
    }
    return days;
  }

  function isoDate(year, month, day) {
    if (!year || !month || !day) return '';
    return year + '-' + pad2(month) + '-' + pad2(day);
  }

  function excelRowDates(row, year) {
    const y = year || new Date().getFullYear();
    const parsed = parseMeseCell(row && row.mese);
    const days = parseGiorni(row && row.data);
    if (!parsed.month || !days.length) return [];
    return days.map(d => isoDate(y, parsed.month, d)).filter(Boolean);
  }

  function normalizeNumero(n) {
    return String(n || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function enrichExcelRow(raw, year) {
    const meseInfo = parseMeseCell(raw.mese);
    let ora = formatExcelOra(raw.ora);
    if (!ora && meseInfo.oraFromMese) ora = meseInfo.oraFromMese;
    return {
      numero_trasferta: raw.numero_trasferta == null ? '' : String(raw.numero_trasferta).trim(),
      data: raw.data == null ? '' : String(raw.data).trim(),
      mese: meseInfo.mese || String(raw.mese || '').trim(),
      month: meseInfo.month,
      attivita_luogo: String(raw.attivita_luogo || '').trim(),
      driver: Array.isArray(raw.driver) ? raw.driver.filter(Boolean) : [],
      mezzo: String(raw.mezzo || '').trim(),
      note: String(raw.note || '').trim(),
      ora,
      dates: excelRowDates({ data: raw.data, mese: raw.mese }, year)
    };
  }

  function parseExcelValues(values, year) {
    if (!Array.isArray(values) || values.length < 2) return [];
    const y = year || new Date().getFullYear();
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!Array.isArray(row)) continue;
      const cells = row.map(cellStr);
      if (cells.every(c => !c)) continue;
      const driver = [cells[4], cells[5], cells[6]].filter(Boolean);
      if (!cells[0] && !cells[3] && !driver.length) continue;
      out.push(enrichExcelRow({
        numero_trasferta: cells[0],
        data: cells[1],
        mese: cells[2],
        attivita_luogo: cells[3],
        driver,
        mezzo: cells[7] || '',
        note: cells[8] || '',
        ora: cells[9]
      }, y));
    }
    return out;
  }

  function tokensNome(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .split(/[\s.,;/+-]+/)
      .filter(t => t.length >= 2);
  }

  function driverMatchesNome(driver, nome) {
    const d = String(driver || '').trim().toLowerCase();
    const n = String(nome || '').trim().toLowerCase();
    if (!d || !n) return false;
    if (n === d || n.indexOf(d) !== -1 || d.indexOf(n) !== -1) return true;
    const nt = tokensNome(nome);
    const dt = tokensNome(driver);
    if (!nt.length || !dt.length) return false;
    if (nt[nt.length - 1] === dt[dt.length - 1]) return true;
    return dt.some(t => t.length >= 3 && nt.indexOf(t) !== -1);
  }

  function unwrapPayload(data) {
    if (data == null) return null;
    if (Array.isArray(data)) {
      if (!data.length) return null;
      const first = data[0];
      return unwrapPayload(first && first.json && (first.json.dipendenti || first.json.ok != null) ? first.json : first);
    }
    if (data.json && typeof data.json === 'object' && (data.json.dipendenti || data.json.ok != null)) {
      return unwrapPayload(data.json);
    }
    return data;
  }

  function slimPrenotazione(p) {
    if (!p || typeof p !== 'object') return null;
    return {
      id: p.id,
      operatore: String(p.operatore || '').trim(),
      email: normEmail(p.email),
      tipo_utilizzo: String(p.tipo_utilizzo || '').trim(),
      data_da: dateOnly(p.data_da) || String(p.data_da || '').trim(),
      data_a: dateOnly(p.data_a) || String(p.data_a || '').trim(),
      note: String(p.note || '').trim(),
      numero_trasferta: p.numero_trasferta == null || p.numero_trasferta === ''
        ? ''
        : String(p.numero_trasferta).trim()
    };
  }

  function isWebhookOnlyItem(row) {
    if (!row || typeof row !== 'object') return false;
    return !!(row.headers || row.webhookUrl || row.jwtPayload) && !row.email && !row.values;
  }

  function isExcelItem(row) {
    return !!(row && Array.isArray(row.values) && Array.isArray(row.values[0]));
  }

  function isPrenotazioneItem(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.tipo_utilizzo != null && String(row.tipo_utilizzo).trim() !== '') return true;
    return !!(row.operatore && row.data_da && row.Dipendenti == null && row.dipendente == null);
  }

  function isDipendenteItem(row) {
    if (!row || typeof row !== 'object') return false;
    if (isPrenotazioneItem(row) || isExcelItem(row)) return false;
    const email = normEmail(row.email);
    const nome = String(row.dipendente || row.Dipendenti || '').trim();
    return !!(email && nome);
  }

  function bookingRange(p) {
    const da = dateOnly(p.data_da) || String(p.data_da || '').trim();
    const a = dateOnly(p.data_a) || da;
    return { da, a };
  }

  function datesOverlapRange(dates, da, a) {
    if (!da || !dates || !dates.length) return 0;
    const fine = a || da;
    let n = 0;
    dates.forEach(d => {
      if (d >= da && d <= fine) n++;
    });
    return n;
  }

  function monthsInRange(da, a) {
    const start = da || a;
    const end = a || da;
    if (!start) return [];
    const out = [];
    let y = parseInt(start.slice(0, 4), 10);
    let m = parseInt(start.slice(5, 7), 10);
    const ey = parseInt(end.slice(0, 4), 10);
    const em = parseInt(end.slice(5, 7), 10);
    while (y < ey || (y === ey && m <= em)) {
      out.push(m);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function fuzzyScore(booking, rows) {
    const blob = (booking.note || '') + ' ' + (booking.tipo_utilizzo || '');
    const hay = rows.map(r => [r.attivita_luogo, r.note, r.mese, r.mezzo].join(' ')).join(' ');
    const bt = tokensNome(blob).filter(t => t.length >= 3);
    const ht = new Set(tokensNome(hay));
    let n = 0;
    bt.forEach(t => { if (ht.has(t)) n++; });
    return n;
  }

  function groupExcelByNumero(rows) {
    const map = new Map();
    rows.forEach(r => {
      const key = normalizeNumero(r.numero_trasferta) || ('row-' + (r.attivita_luogo || '') + r.data);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }

  function publicExcelRow(r) {
    return {
      numero_trasferta: r.numero_trasferta,
      data: r.data,
      mese: r.mese,
      attivita_luogo: r.attivita_luogo,
      driver: r.driver,
      mezzo: r.mezzo,
      note: r.note,
      ora: r.ora
    };
  }

  function pickExcelGroupForBooking(booking, groups, nome) {
    if (!isTrasfertaTipo(booking)) return [];
    const { da, a } = bookingRange(booking);
    const months = monthsInRange(da, a);
    const candidates = [];
    groups.forEach((rows, key) => {
      const mine = rows.filter(r => (r.driver || []).some(dr => driverMatchesNome(dr, nome)));
      if (!mine.length) return;
      const dates = [];
      mine.forEach(r => (r.dates || []).forEach(d => dates.push(d)));
      const overlap = datesOverlapRange(dates, da, a);
      const monthHit = mine.some(r => r.month && months.indexOf(r.month) !== -1);
      candidates.push({ key, rows: mine, dates, overlap, monthHit, score: fuzzyScore(booking, mine) });
    });
    if (!candidates.length) return [];

    const wanted = normalizeNumero(booking.numero_trasferta);
    if (wanted) {
      const hit = candidates.find(c => c.key === wanted);
      if (hit && (hit.overlap || (!hit.dates.length && hit.monthHit))) return hit.rows;
      if (hit && hit.overlap) return hit.rows;
      return [];
    }

    const dated = candidates.filter(c => c.overlap > 0);
    if (dated.length) {
      dated.sort((x, y) => y.overlap - x.overlap || y.score - x.score);
      return dated[0].rows;
    }
    const undated = candidates.filter(c => !c.dates.length && c.monthHit && c.score > 0);
    if (undated.length) {
      undated.sort((x, y) => y.score - x.score);
      return undated[0].rows;
    }
    return [];
  }

  function attachExcelToPrenotazioni(prenotazioni, excelRighe, nome, year) {
    const y = year || (excelRighe[0] && excelRighe[0].dates && excelRighe[0].dates[0]
      ? parseInt(excelRighe[0].dates[0].slice(0, 4), 10)
      : new Date().getFullYear());
    const enriched = excelRighe.map(r => (r.dates ? r : enrichExcelRow(r, y)));
    const groups = groupExcelByNumero(enriched);
    const attached = [];
    const pren = (prenotazioni || []).map(p => {
      const slim = Object.assign({}, p);
      const rows = pickExcelGroupForBooking(slim, groups, nome);
      slim.excel = rows.map(publicExcelRow);
      if (!slim.numero_trasferta && rows[0] && rows[0].numero_trasferta) {
        slim.numero_trasferta = String(rows[0].numero_trasferta);
      }
      rows.forEach(r => attached.push(r));
      return slim;
    });
    const seen = new Set();
    const excel = [];
    attached.forEach(r => {
      const k = [r.numero_trasferta, r.data, r.attivita_luogo, r.ora].join('|');
      if (seen.has(k)) return;
      seen.add(k);
      excel.push(publicExcelRow(r));
    });
    return { prenotazioni: pren, excel };
  }

  function packContestoFromMergeItems(rawItems, todayYmd) {
    const today = todayYmd || todayYmdRome();
    const year = parseInt(String(today).slice(0, 4), 10) || new Date().getFullYear();
    const items = (rawItems || []).map(it => {
      if (!it) return null;
      if (it.json && typeof it.json === 'object' && !isExcelItem(it)) return it.json;
      return it;
    }).filter(Boolean);

    let excelRighe = [];
    const dips = [];
    const seenDip = new Set();
    const prenotazioni = [];

    items.forEach(row => {
      if (isWebhookOnlyItem(row)) return;
      if (isExcelItem(row)) {
        const parsed = parseExcelValues(row.values, year);
        if (parsed.length && !excelRighe.length) excelRighe = parsed;
        return;
      }
      if (isPrenotazioneItem(row)) {
        const slim = slimPrenotazione(row);
        if (slim && prenotazioneDaOggi(slim, today)) prenotazioni.push(slim);
        return;
      }
      if (isDipendenteItem(row)) {
        const email = normEmail(row.email);
        if (!email || seenDip.has(email)) return;
        seenDip.add(email);
        dips.push({
          email,
          dipendente: String(row.dipendente || row.Dipendenti || '').trim(),
          role: String(row.role || row.Role || 'Dipendente').trim(),
          excel: [],
          prenotazioni: []
        });
      }
    });

    dips.forEach(d => {
      const mine = prenotazioni.filter(p => {
        if (p.email) return p.email === d.email;
        return driverMatchesNome(p.operatore, d.dipendente) || driverMatchesNome(d.dipendente, p.operatore);
      });
      const linked = attachExcelToPrenotazioni(mine, excelRighe, d.dipendente, year);
      d.prenotazioni = linked.prenotazioni;
      d.excel = linked.excel;
    });

    dips.sort((a, b) => a.dipendente.localeCompare(b.dipendente, 'it', { sensitivity: 'base' }));
    return dips;
  }

  function parseDipendentiList(data) {
    const root = unwrapPayload(data);
    let rows = [];
    if (root && Array.isArray(root.dipendenti)) rows = root.dipendenti;
    else if (Array.isArray(data)) rows = data;
    else if (data && Array.isArray(data.users)) rows = data.users;
    else if (data && Array.isArray(data.dipendenti)) rows = data.dipendenti;
    else if (data && Array.isArray(data.json)) rows = data.json;

    const out = [];
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const inner = row.json && typeof row.json === 'object' && !row.email ? row.json : row;
      const email = normEmail(inner.email);
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const nome = String(
        inner.dipendente || inner.Dipendenti || inner.nome || inner.nome_cognome || ''
      ).trim();
      out.push({ email, nome: nome || email });
    }
    out.sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
    return out;
  }

  function parseContestoRecupero(data, todayYmd) {
    const root = unwrapPayload(data);
    const today = todayYmd || todayYmdRome();
    const year = parseInt(String(today).slice(0, 4), 10) || new Date().getFullYear();
    if (root && Array.isArray(root.dipendenti)) {
      return root.dipendenti.map(d => {
        const nome = String(d.dipendente || d.nome || '').trim();
        const pren = (Array.isArray(d.prenotazioni) ? d.prenotazioni : []).filter(p => prenotazioneDaOggi(p, today));
        const excelSrc = [];
        (Array.isArray(d.excel) ? d.excel : []).forEach(r => excelSrc.push(r));
        pren.forEach(p => {
          (Array.isArray(p.excel) ? p.excel : []).forEach(r => excelSrc.push(r));
        });
        const linked = attachExcelToPrenotazioni(pren, excelSrc, nome, year);
        return {
          email: normEmail(d.email),
          nome,
          dipendente: nome,
          role: String(d.role || '').trim(),
          excel: linked.excel,
          prenotazioni: linked.prenotazioni
        };
      }).filter(d => d.email);
    }
    return parseDipendentiList(data).map(d => ({
      email: d.email,
      nome: d.nome,
      dipendente: d.nome,
      role: '',
      excel: [],
      prenotazioni: []
    }));
  }

  function listaTrasferteRilevate(dipendenti) {
    const out = [];
    (dipendenti || []).forEach(d => {
      const nome = String(d.dipendente || d.nome || '').trim();
      const email = normEmail(d.email);
      (Array.isArray(d.prenotazioni) ? d.prenotazioni : []).forEach(p => {
        if (!isTrasfertaTipo(p)) return;
        if (!prenotazioneDaOggi(p)) return;
        out.push({
          email,
          nome,
          id: p.id,
          tipo_utilizzo: String(p.tipo_utilizzo || 'Trasferta').trim(),
          data_da: dateOnly(p.data_da) || String(p.data_da || '').trim(),
          data_a: dateOnly(p.data_a) || String(p.data_a || '').trim(),
          note: String(p.note || '').trim(),
          numero_trasferta: p.numero_trasferta == null ? '' : String(p.numero_trasferta).trim(),
          excel: Array.isArray(p.excel) ? p.excel : []
        });
      });
    });
    out.sort((a, b) => String(a.data_da).localeCompare(String(b.data_da)) || String(a.nome).localeCompare(String(b.nome), 'it'));
    return out;
  }

  function selectedDipendente(selectEl) {
    const email = normEmail(selectEl && selectEl.value);
    if (!email) return null;
    const opt = selectEl.selectedOptions && selectEl.selectedOptions[0];
    let nome = '';
    if (opt) {
      nome = String((opt.getAttribute && opt.getAttribute('data-nome')) || opt.textContent || '').trim();
    }
    return { email, nome: nome || email };
  }

  global.SRDipendenti = {
    parseDipendentiList,
    parseContestoRecupero,
    packContestoFromMergeItems,
    parseExcelValues,
    driverMatchesNome,
    prenotazioneDaOggi,
    formatExcelOra,
    excelRowDates,
    listaTrasferteRilevate,
    todayYmdRome,
    selectedDipendente
  };
})(typeof window !== 'undefined' ? window : globalThis);
