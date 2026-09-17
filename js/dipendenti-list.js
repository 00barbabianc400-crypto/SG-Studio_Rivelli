/**
 * Elenco dipendenti + contesto Excel/prenotazioni auto (webhook recupero-dipendenti).
 */
(function (global) {
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

  function cellStr(v) {
    if (v == null || v === '') return '';
    return String(v).trim();
  }

  function parseExcelValues(values) {
    if (!Array.isArray(values) || values.length < 2) return [];
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!Array.isArray(row)) continue;
      const cells = row.map(cellStr);
      if (cells.every(c => !c)) continue;
      const driver = [cells[4], cells[5], cells[6]].filter(Boolean);
      if (!cells[0] && !cells[3] && !driver.length) continue;
      out.push({
        numero_trasferta: cells[0],
        data: cells[1],
        mese: cells[2],
        attivita_luogo: cells[3],
        driver: driver,
        mezzo: cells[7] || '',
        note: cells[8] || '',
        ora: cells[9] || ''
      });
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

  function packContestoFromMergeItems(rawItems, todayYmd) {
    const today = todayYmd || todayYmdRome();
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
        const parsed = parseExcelValues(row.values);
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
      d.excel = excelRighe.filter(r =>
        (r.driver || []).some(dr => driverMatchesNome(dr, d.dipendente))
      );
      d.prenotazioni = prenotazioni.filter(p => {
        if (p.email) return p.email === d.email;
        return driverMatchesNome(p.operatore, d.dipendente) || driverMatchesNome(d.dipendente, p.operatore);
      });
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
    if (root && Array.isArray(root.dipendenti)) {
      return root.dipendenti.map(d => ({
        email: normEmail(d.email),
        nome: String(d.dipendente || d.nome || '').trim(),
        dipendente: String(d.dipendente || d.nome || '').trim(),
        role: String(d.role || '').trim(),
        excel: Array.isArray(d.excel) ? d.excel : [],
        prenotazioni: (Array.isArray(d.prenotazioni) ? d.prenotazioni : []).filter(p => prenotazioneDaOggi(p, today))
      })).filter(d => d.email);
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
    todayYmdRome,
    selectedDipendente
  };
})(typeof window !== 'undefined' ? window : globalThis);
