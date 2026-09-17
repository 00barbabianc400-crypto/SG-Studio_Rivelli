/**
 * Slot auto riservati da trasferte (mezzo auto aziendale) + merge calendario / scontrini benzina.
 */
(function (global) {
  function toYmd(v) {
    const s = String(v || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  function rangesOverlap(a1, a2, b1, b2) {
    const x1 = toYmd(a1);
    const x2 = toYmd(a2);
    const y1 = toYmd(b1);
    const y2 = toYmd(b2);
    if (!x1 || !x2 || !y1 || !y2) return false;
    return x1 <= y2 && y1 <= x2;
  }

  function normName(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function namesMatch(a, b) {
    const na = normName(a);
    const nb = normName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const pa = na.split(' ').filter(Boolean);
    const pb = nb.split(' ').filter(Boolean);
    if (!pa.length || !pb.length) return false;
    const cognA = pa[pa.length - 1];
    const cognB = pb[pb.length - 1];
    if (cognA !== cognB) return false;
    const setB = new Set(pb);
    const shared = pa.filter(p => p !== cognA && setB.has(p));
    return shared.length > 0 || (pa.length === 1 && pb.length === 1);
  }

  function emailsMatch(a, b) {
    const ea = String(a || '').trim().toLowerCase();
    const eb = String(b || '').trim().toLowerCase();
    return !!(ea && eb && ea === eb);
  }

  function isAutoAzMezzo(nome) {
    const n = String(nome || '').toLowerCase().replace(/\./g, '').trim();
    return n.includes('auto az') || n === 'auto aziendale';
  }

  function parseServizi(raw) {
    if (global.SRServiziTappa && typeof global.SRServiziTappa.normalizeServizi === 'function') {
      return global.SRServiziTappa.normalizeServizi(raw);
    }
    if (raw == null || raw === '') return [];
    let data = raw;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return []; }
    }
    return Array.isArray(data) ? data : [];
  }

  function tappaHasAutoAz(tappa) {
    if (!tappa || typeof tappa !== 'object') return false;
    if (isAutoAzMezzo(tappa.mezzo_raggiungimento)) return true;
    const list = parseServizi(tappa.servizi_json != null ? tappa.servizi_json : tappa.servizi);
    return list.some(s => {
      if (!s || typeof s !== 'object') return false;
      const tipo = String(s.tipo || '').trim().toLowerCase();
      if (tipo === 'auto_az') return true;
      return isAutoAzMezzo(s.nome || s.mezzo || s.label);
    });
  }

  function isTripDriver(tappa, operatore) {
    if (!tappa) return false;
    return namesMatch(tappa.nome_persona, operatore);
  }

  function autoAzDateRange(tappa) {
    let da = toYmd(tappa && (tappa.data_arrivo || tappa.data_da));
    let a = toYmd(tappa && (tappa.data_partenza || tappa.data_a)) || da;
    const list = parseServizi(tappa && (tappa.servizi_json != null ? tappa.servizi_json : tappa.servizi));
    list.forEach(s => {
      if (!s || typeof s !== 'object') return;
      const tipo = String(s.tipo || '').trim().toLowerCase();
      if (tipo !== 'auto_az' && !isAutoAzMezzo(s.nome || s.mezzo || s.label)) return;
      const po = s.prenotazione_operatrice && typeof s.prenotazione_operatrice === 'object'
        ? s.prenotazione_operatrice
        : {};
      const gda = toYmd(s.giornate_da || po.giornate_da);
      const ga = toYmd(s.giornate_a || po.giornate_a) || gda;
      if (!gda) return;
      if (!da || gda < da) da = gda;
      if (!a || ga > a) a = ga;
    });
    return { da: da, a: a || da };
  }

  function findReservedSlot(tappe, opts) {
    const o = opts || {};
    const da = o.data_da;
    const a = o.data_a;
    const list = Array.isArray(tappe) ? tappe : [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!tappaHasAutoAz(t)) continue;
      const rng = autoAzDateRange(t);
      if (!rangesOverlap(da, a, rng.da, rng.a)) continue;
      if (isTripDriver(t, o.operatore)) continue;
      return t;
    }
    return null;
  }

  function reservedPopupCopy(tappa) {
    return {
      driver: String((tappa && tappa.nome_persona) || '').trim() || '—',
      cliente: String((tappa && (tappa.cliente_tappa || tappa.cliente)) || '').trim() || '—'
    };
  }

  function mergeCalendarEvents(macchinaEvents, trasfertaEvents) {
    const trfIn = Array.isArray(trasfertaEvents) ? trasfertaEvents : [];
    const macIn = Array.isArray(macchinaEvents) ? macchinaEvents : [];
    const trfOut = trfIn.map(ev => {
      const has = ev.hasAutoAz === true
        || (Array.isArray(ev.tappe) && ev.tappe.some(tappaHasAutoAz))
        || tappaHasAutoAz(ev.raw);
      if (!has) return ev;
      return { ...ev, kind: 'macchina_trasferta', hasAutoAz: true };
    });
    const macOut = macIn.filter(m => {
      return !trfOut.some(ev =>
        ev.hasAutoAz
        && namesMatch(m.person, ev.person)
        && rangesOverlap(m.data_da, m.data_a, ev.data_da, ev.data_a)
      );
    });
    return [...macOut, ...trfOut];
  }

  function tappeAutoAzFromPayload(data) {
    let rows = data;
    if (rows && !Array.isArray(rows)) {
      if (Array.isArray(rows.body)) rows = rows.body;
      else if (Array.isArray(rows.data)) rows = rows.data;
      else if (rows.json) return tappeAutoAzFromPayload(rows.json);
      else rows = [rows];
    }
    return (Array.isArray(rows) ? rows : []).filter(r => {
      if (!r || typeof r !== 'object') return false;
      if (r.tipo_utilizzo != null) return false;
      if (r.trasferta_id == null && r.nome_persona == null && r.citta == null) return false;
      return tappaHasAutoAz(r);
    });
  }

  function scontriniAutoAsNotaBenzina(tappa, prenotazioni) {
    const tDa = tappa && (tappa.data_arrivo || tappa.data_da);
    const tA = tappa && (tappa.data_partenza || tappa.data_a || tDa);
    const person = tappa && tappa.nome_persona;
    const Scontrini = global.SRScontrini;
    const parse = Scontrini && Scontrini.parseScontriniJson
      ? Scontrini.parseScontriniJson
      : function (raw) {
          if (raw == null || raw === '') return [];
          if (Array.isArray(raw)) return raw;
          if (typeof raw === 'string') {
            try {
              const data = JSON.parse(raw);
              return Array.isArray(data) ? data : [];
            } catch {
              return [];
            }
          }
          return [];
        };
    const out = [];
    (prenotazioni || []).forEach(p => {
      if (!p) return;
      if (!namesMatch(p.operatore, person)) return;
      if (!rangesOverlap(p.data_da, p.data_a, tDa, tA)) return;
      parse(p.scontrini_json).forEach(sc => {
        out.push({
          id: sc.id || ('auto_' + (sc.foto_id || sc.foto_url || out.length)),
          created_at: sc.created_at || '',
          tipo: 'scontrino',
          categoria: 'benzina',
          pasto: null,
          mezzo: 'benzina',
          dettaglio: '',
          importo: null,
          foto_url: sc.foto_url || sc.url || '',
          foto_id: sc.foto_id || sc.fileId || '',
          mime: sc.mime || 'image/jpeg',
          fonte: 'macchina'
        });
      });
    });
    return out;
  }

  function mergeNotaConBenzinaAuto(notaItems, benzinaItems) {
    const a = Array.isArray(notaItems) ? notaItems.slice() : [];
    const b = Array.isArray(benzinaItems) ? benzinaItems : [];
    const seen = new Set(a.map(it => String(it && (it.foto_id || it.id) || '')));
    b.forEach(it => {
      const k = String(it && (it.foto_id || it.id) || '');
      if (k && seen.has(k)) return;
      if (k) seen.add(k);
      a.push(it);
    });
    return a;
  }

  global.SRSlotAutoTrasferta = {
    rangesOverlap,
    namesMatch,
    tappaHasAutoAz,
    isTripDriver,
    findReservedSlot,
    reservedPopupCopy,
    tappeAutoAzFromPayload,
    mergeCalendarEvents,
    scontriniAutoAsNotaBenzina,
    mergeNotaConBenzinaAuto
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
