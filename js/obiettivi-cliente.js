/**
 * Obiettivi cliente (Ore presenze) — JSON DT Clienti:
 *   attivita_x_ore, obiettivi_x_attivita_x_conteggio
 * attivita_x_ore = denormalizzazione (somma ore per attività) ricalcolata al save.
 */
(function (global) {
  function uidObj() {
    return 'obj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function parseNumber(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (!s) return NaN;
    // IT: "1.500,50" | "1500,50" | "1.500" (migliaia) | "1500.50" (EN)
    let normalized = s;
    if (s.includes(',')) {
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      // solo separatori migliaia IT senza decimali: 1.500 → 1500
      normalized = s.replace(/\./g, '');
    }
    const n = parseFloat(normalized.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function isMilestone(m) {
    return !!(m && typeof m === 'object' && String(m.attivita || '').trim());
  }

  function isObiettivo(o) {
    return !!(o && typeof o === 'object' && (o.nome || o.id || (Array.isArray(o.milestone) && o.milestone.length)));
  }

  function parseJsonArray(raw, itemOk) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.filter(itemOk);
    if (typeof raw === 'object') return itemOk(raw) ? [raw] : [];
    const s = String(raw).trim();
    if (!s) return [];
    try {
      const data = JSON.parse(s);
      if (Array.isArray(data)) return data.filter(itemOk);
      if (itemOk(data)) return [data];
    } catch {
      return [];
    }
    return [];
  }

  function parseObiettiviJson(raw) {
    return parseJsonArray(raw, isObiettivo).map(o => {
      try { return normalizeObiettivo(o, { keepId: true, soft: true }); }
      catch { return null; }
    }).filter(Boolean);
  }

  function parseAttivitaOreJson(raw) {
    return parseJsonArray(raw, m => isMilestone(m)).map(m => ({
      attivita: String(m.attivita || '').trim(),
      ore: round2(Math.max(0, parseNumber(m.ore) || 0))
    })).filter(m => m.attivita);
  }

  function normalizeMilestone(m) {
    const attivita = String(m && m.attivita || '').trim();
    if (!attivita) throw new Error('Attività milestone obbligatoria');
    const ore = parseNumber(m && m.ore);
    if (!Number.isFinite(ore) || ore < 0) throw new Error('Ore milestone non valide');
    return { attivita, ore: round2(ore) };
  }

  function normalizeObiettivo(raw, opts) {
    const soft = !!(opts && opts.soft);
    const keepId = !!(opts && opts.keepId);
    const nome = String(raw && raw.nome || '').trim();
    if (!nome && !soft) throw new Error('Nome obiettivo obbligatorio');
    const costo = parseNumber(raw && raw.costo);
    if (!Number.isFinite(costo) || costo < 0) {
      if (!soft) throw new Error('Costo obiettivo non valido');
    }
    const list = Array.isArray(raw && raw.milestone) ? raw.milestone : [];
    const seen = new Set();
    const milestone = [];
    for (const m of list) {
      let nm;
      try { nm = normalizeMilestone(m); }
      catch (e) {
        if (soft) continue;
        throw e;
      }
      const key = nm.attivita.toLowerCase();
      if (seen.has(key)) {
        if (soft) continue;
        throw new Error('Attività duplicata nello stesso obiettivo: ' + nm.attivita);
      }
      seen.add(key);
      milestone.push(nm);
    }
    if (!milestone.length && !soft) throw new Error('Aggiungi almeno una milestone');
    const id = (keepId && raw && raw.id) ? String(raw.id) : (raw && raw.id ? String(raw.id) : uidObj());
    return {
      id: id || uidObj(),
      nome: nome || 'Obiettivo',
      costo: Number.isFinite(costo) && costo >= 0 ? round2(costo) : 0,
      milestone
    };
  }

  function deriveAttivitaXOre(obiettivi) {
    const map = new Map();
    (obiettivi || []).forEach(o => {
      (o.milestone || []).forEach(m => {
        const key = String(m.attivita || '').trim();
        if (!key) return;
        const ore = Number(m.ore) || 0;
        map.set(key, round2((map.get(key) || 0) + ore));
      });
    });
    return [...map.entries()]
      .map(([attivita, ore]) => ({ attivita, ore }))
      .sort((a, b) => a.attivita.localeCompare(b.attivita, 'it'));
  }

  function serializeJson(value) {
    return JSON.stringify(value == null ? [] : value);
  }

  function normalizeClienteRow(row) {
    if (!row || typeof row !== 'object') return null;
    const nome = String(row.Cliente || row.cliente || row.nome || '').trim();
    if (!nome) return null;
    const id = row.id != null && row.id !== '' ? row.id : null;
    const obiettivi = parseObiettiviJson(
      row.obiettivi_x_attivita_x_conteggio != null
        ? row.obiettivi_x_attivita_x_conteggio
        : row.obiettivi
    );
    let attivita_x_ore = parseAttivitaOreJson(
      row.attivita_x_ore != null ? row.attivita_x_ore : row.attivitaOre
    );
    if (!attivita_x_ore.length && obiettivi.length) {
      attivita_x_ore = deriveAttivitaXOre(obiettivi);
    }
    return { id, nome, obiettivi, attivita_x_ore };
  }

  function buildUpdatePayload(row, obiettivi) {
    const list = (obiettivi || []).map(o => normalizeObiettivo(o, { keepId: true }));
    const flat = deriveAttivitaXOre(list);
    const id = row && row.id;
    if (id == null || id === '') {
      return {
        action: 'insert',
        cliente: row && row.nome ? String(row.nome).trim() : '',
        obiettivi_x_attivita_x_conteggio: serializeJson(list),
        attivita_x_ore: serializeJson(flat)
      };
    }
    return {
      action: 'update',
      id,
      cliente: row && row.nome ? String(row.nome).trim() : undefined,
      obiettivi_x_attivita_x_conteggio: serializeJson(list),
      attivita_x_ore: serializeJson(flat)
    };
  }

  function buildBatchUpdatePayload(rows, obiettivoTemplate) {
    const tmpl = normalizeObiettivo(obiettivoTemplate);
    const items = (rows || [])
      .filter(r => r && r.id != null && r.id !== '')
      .map(r => {
        const obiettivi = [...(r.obiettivi || []), {
          id: uidObj(),
          nome: tmpl.nome,
          costo: tmpl.costo,
          milestone: tmpl.milestone.map(m => ({ ...m }))
        }];
        const flat = deriveAttivitaXOre(obiettivi);
        return {
          id: r.id,
          obiettivi_x_attivita_x_conteggio: serializeJson(obiettivi),
          attivita_x_ore: serializeJson(flat)
        };
      });
    return { action: 'update', items };
  }

  function stripObiettivi(rows) {
    return (rows || []).map(r => ({
      id: r.id,
      nome: r.nome,
      obiettivi: [],
      attivita_x_ore: []
    }));
  }

  function bucketProgresso(pct) {
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 20) return 'sotto20';
    if (n < 70) return 'circa50';
    return 'sopra70';
  }

  function normalizeDipendenteRow(row) {
    if (!row || typeof row !== 'object') return null;
    const nome = String(row.Dipendenti || row.dipendente || row.nome || '').trim();
    if (!nome) return null;
    const n = parseNumber(row.costo_orario);
    return {
      nome,
      costo_orario: Number.isFinite(n) && n >= 0 ? round2(n) : 0
    };
  }

  function buildCostoOrarioMap(rows) {
    const map = new Map();
    (rows || []).forEach(r => {
      const d = r && r.nome != null && r.costo_orario != null && !r.Dipendenti
        ? { nome: String(r.nome).trim(), costo_orario: Number(r.costo_orario) || 0 }
        : normalizeDipendenteRow(r);
      if (!d || !d.nome) return;
      map.set(d.nome.toLowerCase(), Number(d.costo_orario) || 0);
    });
    return map;
  }

  function lookupCostoOrario(map, nome) {
    if (!map) return 0;
    const k = String(nome || '').trim().toLowerCase();
    if (!k) return 0;
    if (typeof map.get === 'function' && map.has(k)) return map.get(k) || 0;
    if (map && typeof map === 'object' && !map.get && map[k] != null) return Number(map[k]) || 0;
    if (typeof map.entries === 'function') {
      for (const [key, val] of map.entries()) {
        if (k.includes(key) || key.includes(k)) return val || 0;
      }
    }
    return 0;
  }

  function keyNorm(s) {
    return String(s || '').trim().toLowerCase();
  }

  function aggregateDipendenti(rows, rates) {
    const map = new Map();
    (rows || []).forEach(r => {
      const nome = String(r.dipendente || '').trim() || '(non indicato)';
      const ore = Number(r.ore_ore) || 0;
      if (ore <= 0) return;
      const rate = lookupCostoOrario(rates, r.dipendente);
      const prev = map.get(nome) || { dipendente: nome, ore: 0, costo_orario: rate, costo: 0 };
      prev.ore = round2(prev.ore + ore);
      prev.costo = round2(prev.costo + ore * rate);
      if (rate > 0) prev.costo_orario = rate;
      map.set(nome, prev);
    });
    return [...map.values()].sort((a, b) => b.ore - a.ore || a.dipendente.localeCompare(b.dipendente, 'it'));
  }

  function computeProgressione(clienti, righe, rates) {
    const bucketCounts = { sotto20: 0, circa50: 0, sopra70: 0 };
    const outClienti = [];
    (clienti || []).forEach(c => {
      const obiettiviIn = (c && c.obiettivi) || [];
      if (!obiettiviIn.length) return;
      const nomeCli = c.nome;
      const rowsCli = (righe || []).filter(r => keyNorm(r.cliente) === keyNorm(nomeCli));
      const obiettivi = obiettiviIn.map(o => {
        const msIn = o.milestone || [];
        const ore_target = round2(msIn.reduce((s, m) => s + (Number(m.ore) || 0), 0));
        const attSet = new Set(msIn.map(m => keyNorm(m.attivita)));
        const rowsObj = rowsCli.filter(r => attSet.has(keyNorm(r.attivita)));
        const ore_fatte = round2(rowsObj.reduce((s, r) => s + (Number(r.ore_ore) || 0), 0));
        const costo_interno = round2(rowsObj.reduce((s, r) => {
          return s + (Number(r.ore_ore) || 0) * lookupCostoOrario(rates, r.dipendente);
        }, 0));
        const pct = ore_target > 0 ? round2((ore_fatte / ore_target) * 100) : 0;
        const costo_proiettato = ore_fatte > 0
          ? round2(costo_interno * (ore_target / ore_fatte))
          : null;
        const costo = Number(o.costo) || 0;
        const missingRate = rowsObj.some(r =>
          (Number(r.ore_ore) || 0) > 0 && lookupCostoOrario(rates, r.dipendente) <= 0);
        const rientro = (costo_proiettato == null || missingRate) ? null : costo_proiettato <= costo;
        const dipendenti = aggregateDipendenti(rowsObj, rates);
        const milestone = msIn.map(m => {
          const target = Number(m.ore) || 0;
          const rowsM = rowsCli.filter(r => keyNorm(r.attivita) === keyNorm(m.attivita));
          const oreM = round2(rowsM.reduce((s, r) => s + (Number(r.ore_ore) || 0), 0));
          const mpct = target > 0 ? round2((oreM / target) * 100) : 0;
          const bucket = bucketProgresso(mpct);
          bucketCounts[bucket] += 1;
          return {
            attivita: m.attivita,
            ore_target: target,
            ore_fatte: oreM,
            pct: mpct,
            bucket,
            dipendenti: aggregateDipendenti(rowsM, rates)
          };
        });
        return {
          id: o.id,
          nome: o.nome,
          costo,
          ore_target,
          ore_fatte,
          pct,
          costo_interno,
          costo_proiettato,
          rientro,
          missing_rate: missingRate,
          dipendenti,
          milestone
        };
      });
      outClienti.push({ id: c.id, nome: nomeCli, obiettivi });
    });
    return { bucketCounts, clienti: outClienti };
  }

  global.SRObiettiviCliente = {
    uidObj,
    parseNumber,
    parseObiettiviJson,
    parseAttivitaOreJson,
    normalizeMilestone,
    normalizeObiettivo,
    deriveAttivitaXOre,
    serializeJson,
    normalizeClienteRow,
    buildUpdatePayload,
    buildBatchUpdatePayload,
    stripObiettivi,
    bucketProgresso,
    normalizeDipendenteRow,
    buildCostoOrarioMap,
    lookupCostoOrario,
    computeProgressione
  };
  if (typeof window !== 'undefined') window.SRObiettiviCliente = global.SRObiettiviCliente;
})(typeof globalThis !== 'undefined' ? globalThis : window);
