/**
 * Export transazioni: Excel + ZIP (Scontrini / Allegati di trasferta).
 * Richiede ExcelJS locale: assets/vendor/exceljs.min.js
 */
(function (global) {
  function fmtTimestamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  }

  function safeFilenamePart(s) {
    return String(s || 'trasferta').replace(/[^\w.-]+/g, '_').slice(0, 80);
  }

  function neutralizeExcelFormula(s) {
    const str = String(s == null ? '' : s);
    return /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
  }

  const CRC32_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC32_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  }

  function u32(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  }

  function concatBytes(chunks) {
    let len = 0;
    (chunks || []).forEach(c => { len += c.length; });
    const out = new Uint8Array(len);
    let o = 0;
    (chunks || []).forEach(c => { out.set(c, o); o += c.length; });
    return out;
  }

  function zipStore(entries) {
    const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    function encStr(s) {
      if (enc) return enc.encode(s);
      const a = [];
      const str = String(s || '');
      for (let i = 0; i < str.length; i++) a.push(str.charCodeAt(i) & 0xff);
      return new Uint8Array(a);
    }
    const locals = [];
    const centrals = [];
    let offset = 0;
    const list = Array.isArray(entries) ? entries : [];
    list.forEach(e => {
      const name = encStr(String(e.path || 'file').replace(/\\/g, '/'));
      const data = e.bytes instanceof Uint8Array ? e.bytes : new Uint8Array(e.bytes || []);
      const crc = crc32(data);
      const local = concatBytes([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),
        u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), name, data
      ]);
      locals.push(local);
      centrals.push(concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), name
      ]));
      offset += local.length;
    });
    const cd = concatBytes(centrals);
    return concatBytes(locals.concat([
      cd,
      concatBytes([
        u32(0x06054b50), u16(0), u16(0),
        u16(list.length), u16(list.length),
        u32(cd.length), u32(offset), u16(0)
      ])
    ]));
  }

  function collectPacchettoFiles(tappe) {
    const S = global.SRScontrini;
    const ST = global.SRServiziTappa;
    const N = NS();
    const used = Object.create(null);
    const out = [];
    function takeName(folder, name) {
      let n = name;
      let i = 2;
      while (used[folder + '/' + n]) {
        const m = name.match(/^(.*)(\.[^.]+)$/);
        n = m ? (m[1] + '_' + i + m[2]) : (name + '_' + i);
        i++;
      }
      used[folder + '/' + n] = 1;
      return n;
    }
    (Array.isArray(tappe) ? tappe : []).forEach(t => {
      const tappaNo = String(t && t.tappa_numero != null ? t.tappa_numero : '?');
      const citta = safeFilenamePart(t && t.citta || 'tappa');
      const notes = N && typeof N.parseNotaSpeseJson === 'function'
        ? N.parseNotaSpeseJson(t && t.nota_spese_json)
        : [];
      notes.forEach((it, i) => {
        const hasFoto = S && typeof S.itemsWithFoto === 'function'
          ? S.itemsWithFoto([it]).length > 0
          : !!(it && (it.foto_id || it.foto_url || it.fileId));
        if (!hasFoto) return;
        const url = S && typeof S.downloadUrl === 'function' ? S.downloadUrl(it) : '';
        const fileId = S && typeof S.fileIdFrom === 'function'
          ? S.fileIdFrom(it)
          : String((it && (it.foto_id || it.fileId)) || '');
        if (!url && !fileId) return;
        const tipo = String(it.tipo || '').toLowerCase() === 'fattura' ? 'fattura' : 'scontrino';
        const ext = /png/i.test(String(it.mime || '')) ? 'png' : 'jpg';
        const folder = 'Scontrini';
        out.push({
          folder,
          name: takeName(folder, 'Tappa' + tappaNo + '_' + citta + '_' + tipo + '_' + String(i + 1).padStart(2, '0') + '.' + ext),
          url,
          fileId,
          kind: 'scontrino'
        });
      });
      const servizi = ST && typeof ST.normalizeServizi === 'function'
        ? ST.normalizeServizi(t && (t.servizi_json != null ? t.servizi_json : t.servizi))
        : [];
      servizi.forEach(sv => {
        const allegati = ST && typeof ST.normalizeAllegati === 'function'
          ? ST.normalizeAllegati(sv && sv.allegati)
          : [];
        allegati.forEach(a => {
          const url = ST && typeof ST.driveDownloadUrl === 'function' ? ST.driveDownloadUrl(a) : '';
          const fileId = ST && typeof ST.driveFileId === 'function'
            ? ST.driveFileId(a)
            : String((a && (a.fileId || a.foto_id)) || '');
          if (!url && !fileId) return;
          const orig = String(a.nome || 'allegato');
          const extM = orig.match(/(\.[a-z0-9]+)$/i);
          const ext = extM ? extM[1] : (/pdf/i.test(String(a.mime || '')) ? '.pdf' : '');
          const base = safeFilenamePart(orig.replace(/\.[a-z0-9]+$/i, '')) || 'allegato';
          const tipoSrv = safeFilenamePart(sv && sv.tipo || 'servizio');
          const folder = 'Allegati di trasferta';
          out.push({
            folder,
            name: takeName(folder, 'Tappa' + tappaNo + '_' + tipoSrv + '_' + base + ext),
            url,
            fileId,
            kind: 'allegato'
          });
        });
      });
    });
    return out;
  }

  function looksLikeBinaryFile(u8) {
    if (!u8 || !u8.length) return false;
    if (u8[0] === 0x3c || u8[0] === 0x7b) return false;
    return true;
  }

  function bundlePrintItems(tappe) {
    const S = global.SRScontrini;
    const ST = global.SRServiziTappa;
    const N = NS();
    const out = [];
    (Array.isArray(tappe) ? tappe : []).forEach(t => {
      const notes = N && typeof N.parseNotaSpeseJson === 'function'
        ? N.parseNotaSpeseJson(t && t.nota_spese_json)
        : [];
      notes.forEach(it => {
        const hasFoto = S && typeof S.itemsWithFoto === 'function'
          ? S.itemsWithFoto([it]).length > 0
          : !!(it && (it.foto_id || it.foto_url || it.fileId));
        if (hasFoto) out.push(it);
      });
      const servizi = ST && typeof ST.normalizeServizi === 'function'
        ? ST.normalizeServizi(t && (t.servizi_json != null ? t.servizi_json : t.servizi))
        : [];
      servizi.forEach(sv => {
        const allegati = ST && typeof ST.normalizeAllegati === 'function'
          ? ST.normalizeAllegati(sv && sv.allegati)
          : [];
        const tipoSrv = String(sv && sv.tipo || 'servizio').trim() || 'servizio';
        let importo = sv && sv.costo;
        allegati.forEach(a => {
          const id = ST && typeof ST.driveFileId === 'function'
            ? ST.driveFileId(a)
            : String((a && (a.fileId || a.foto_id)) || '');
          if (!id) return;
          out.push({
            tipo: 'allegato',
            tipoLabel: 'Allegato · ' + tipoSrv,
            importo: importo,
            foto_id: id,
            fileId: id,
            mime: a.mime || '',
            dettaglio: a.nome || ''
          });
        });
      });
    });
    return out;
  }

  function triggerNativeDownloads(files) {
    if (typeof document === 'undefined') return;
    (files || []).forEach((f, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = f.url;
        a.setAttribute('download', f.name || 'allegato');
        a.rel = 'noopener';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  }

  function openPrintBundle(items) {
    const S = global.SRScontrini;
    if (typeof window === 'undefined' || !S || typeof S.printBundleHtml !== 'function') return false;
    if (!(items || []).length) return false;
    const w = window.open('', '_blank');
    if (!w) throw new Error('Consenti i popup per il PDF dei giustificativi');
    w.document.write(S.printBundleHtml(items));
    w.document.close();
    return true;
  }

  function b64ToBytes(b64) {
    const s = String(b64 || '').replace(/\s/g, '');
    if (!s) return new Uint8Array(0);
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function parseGasDownloadResponse(data) {
    if (!data || data.ok !== true) {
      throw new Error(String((data && data.message) || 'Download Drive non riuscito'));
    }
    const bytes = b64ToBytes(data.b64);
    if (!bytes.length) throw new Error('File vuoto');
    return {
      ok: true,
      bytes: bytes,
      mime: String(data.mime || ''),
      name: String(data.name || 'file')
    };
  }

  async function fetchDriveFileViaGas(fileId, opts) {
    const id = String(fileId || '').trim();
    if (!id) throw new Error('fileId obbligatorio');
    const url = String((opts && opts.scriptUrl) || (global.SR_CONFIG || {}).GOOGLE_SCRIPT_URL || '');
    if (!url || url.indexOf('INSERISCI') >= 0) throw new Error('GOOGLE_SCRIPT_URL non configurato');
    const fetchFn = (opts && opts.fetch) || global.fetch;
    if (typeof fetchFn !== 'function') throw new Error('fetch non disponibile');
    const Guard = global.SRUploadGuard;
    const Auth = global.SRAuth;
    const payload = Guard && typeof Guard.withSession === 'function'
      ? Guard.withSession({ action: 'downloadfile', fileId: id })
      : { action: 'downloadfile', fileId: id };
    if (!payload.token && Auth && typeof Auth.getGasToken === 'function') {
      const t = Auth.getGasToken();
      if (t) payload.token = t;
    }
    if (!payload.email && Auth && typeof Auth.getUser === 'function') {
      const u = Auth.getUser() || {};
      if (u.email) payload.email = u.email;
    }
    if (!payload.token) throw new Error('Sessione Drive assente: effettua di nuovo l\'accesso');
    const resp = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Risposta non valida dallo script Google');
    }
    return parseGasDownloadResponse(data);
  }

  async function buildPacchettoZip(tappe, opts) {
    const files = collectPacchettoFiles(tappe);
    const downloadFile = opts && opts.downloadFile;
    if (typeof downloadFile !== 'function') throw new Error('downloadFile mancante');
    const entries = [];
    if (opts && opts.xlsxBytes) {
      entries.push({
        path: String(opts.xlsxName || 'transazioni.xlsx'),
        bytes: opts.xlsxBytes instanceof Uint8Array ? opts.xlsxBytes : new Uint8Array(opts.xlsxBytes)
      });
    }
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (opts && typeof opts.onProgress === 'function') {
        opts.onProgress('File Drive ' + (i + 1) + '/' + files.length + '…');
      }
      const got = await downloadFile(f.fileId);
      entries.push({
        path: f.folder + '/' + f.name,
        bytes: got && got.bytes instanceof Uint8Array ? got.bytes : new Uint8Array((got && got.bytes) || [])
      });
    }
    return zipStore(entries);
  }

  function triggerZipDownload(bytes, filename) {
    if (typeof document === 'undefined') return;
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'pacchetto.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function downloadTransazioniPacchetto(tappe, opts) {
    const onProgress = (opts && opts.onProgress) || function () {};
    onProgress('Excel…');
    const { sheet, buffer } = await buildWorkbookBuffer(tappe);
    const xlsxBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const files = collectPacchettoFiles(tappe);
    const zipBytes = await buildPacchettoZip(tappe, {
      xlsxBytes: xlsxBytes,
      xlsxName: sheet.filename,
      onProgress: onProgress,
      downloadFile: function (id) {
        return fetchDriveFileViaGas(id, opts);
      }
    });
    if (!(opts && opts.skipDownload)) {
      triggerZipDownload(zipBytes, safeFilenamePart(sheet.filename.replace(/\.xlsx$/i, '')) + '.zip');
    }
    return {
      sheet: sheet,
      zipBytes: zipBytes,
      files: files.length
    };
  }

  function NS() {
    return global.SRNotaSpese || null;
  }

  /**
   * Righe tipizzate per lo stile Excel.
   * kind: header | tx | tappa | trasferta
   * values: [Timestamp, Tappa, Categoria, Tipo, Voce, Importo]
   * Importo numerico sulle tx e sui totali (i totali non vanno sommati alle tx).
   */
  function buildTransazioniRows(tappe) {
    const list = Array.isArray(tappe) ? tappe : [];
    const N = NS();
    const rows = [{
      kind: 'header',
      values: ['Timestamp', 'Tappa', 'Categoria', 'Tipo', 'Voce', 'Importo']
    }];
    const tid = list[0] && list[0].trasferta_id ? String(list[0].trasferta_id) : 'trasferta';

    list.forEach(t => {
      const notes = N && typeof N.parseNotaSpeseJson === 'function'
        ? N.parseNotaSpeseJson(t && t.nota_spese_json)
        : [];
      const tappaLabel = 'Tappa ' + (t && t.tappa_numero != null ? t.tappa_numero : '?')
        + ' · ' + (String(t && t.citta || '').trim() || '—');

      notes.forEach(it => {
        const tipo = String(it && it.tipo || '').toLowerCase() === 'fattura' ? 'Fattura' : 'Scontrino';
        const cat = N && typeof N.labelCategoria === 'function'
          ? N.labelCategoria(it.categoria)
          : String(it && it.categoria || '');
        const voce = N && typeof N.labelVoce === 'function'
          ? N.labelVoce(it)
          : String((it && (it.dettaglio || it.pasto || it.mezzo)) || '');
        let importo = 0;
        try {
          importo = N && typeof N.parseImporto === 'function'
            ? N.parseImporto(it && it.importo)
            : Number(it && it.importo) || 0;
        } catch {
          importo = 0;
        }
        rows.push({
          kind: 'tx',
          values: [
            neutralizeExcelFormula(fmtTimestamp(it && it.created_at)),
            neutralizeExcelFormula(tappaLabel),
            neutralizeExcelFormula(cat),
            tipo,
            neutralizeExcelFormula(voce),
            importo
          ]
        });
      });

      const sums = N && typeof N.sumImportiByTipo === 'function'
        ? N.sumImportiByTipo(notes)
        : { scontrino: 0, fattura: 0, totale: 0 };
      rows.push({
        kind: 'tappa',
        values: ['', neutralizeExcelFormula('Totale tappa · ' + tappaLabel), '', 'Σ Scontrini', '', sums.scontrino]
      });
      rows.push({
        kind: 'tappa',
        values: ['', neutralizeExcelFormula('Totale tappa · ' + tappaLabel), '', 'Σ Fatture', '', sums.fattura]
      });
      rows.push({
        kind: 'tappa',
        values: ['', neutralizeExcelFormula('Totale tappa · ' + tappaLabel), '', 'Totale', '', sums.totale]
      });
    });

    const grand = N && typeof N.aggregateTrasferta === 'function'
      ? N.aggregateTrasferta(list)
      : { scontrino: 0, fattura: 0, totale: 0 };
    rows.push({ kind: 'trasferta', values: ['', 'Totale trasferta', '', 'Σ Scontrini', '', grand.scontrino] });
    rows.push({ kind: 'trasferta', values: ['', 'Totale trasferta', '', 'Σ Fatture', '', grand.fattura] });
    rows.push({ kind: 'trasferta', values: ['', 'Totale trasferta', '', 'Totale speso', '', grand.totale] });

    return {
      filename: 'transazioni_' + safeFilenamePart(tid) + '.xlsx',
      sheetName: 'Transazioni',
      rows,
      aoa: rows.map(r => r.values)
    };
  }

  /** @deprecated alias — usa buildTransazioniRows */
  function buildTransazioniSheet(tappe) {
    return buildTransazioniRows(tappe);
  }

  function autofitWidths(rows) {
    let cols = 6;
    (rows || []).forEach(r => {
      if ((r.values || []).length > cols) cols = r.values.length;
    });
    const widths = Array(cols).fill(10);
    (rows || []).forEach(r => {
      (r.values || []).forEach((cell, i) => {
        const len = String(cell == null ? '' : cell).length;
        const w = Math.min(42, Math.max(8, len + 2));
        if (w > widths[i]) widths[i] = w;
      });
    });
    return widths;
  }

  function styleForKind(kind) {
    if (kind === 'header') {
      return {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E4FA3' } },
        alignment: { vertical: 'middle', horizontal: 'left' },
        border: {
          bottom: { style: 'thin', color: { argb: 'FF1E3A6E' } }
        }
      };
    }
    if (kind === 'tappa') {
      return {
        font: { bold: true, name: 'Calibri', size: 10, color: { argb: 'FF1E3050' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
      };
    }
    if (kind === 'trasferta') {
      return {
        font: { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      };
    }
    return {
      font: { name: 'Calibri', size: 10, color: { argb: 'FF111827' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    };
  }

  function getExcelJS() {
    const X = global.ExcelJS;
    if (!X || typeof X.Workbook !== 'function') {
      throw new Error('ExcelJS non caricato (assets/vendor/exceljs.min.js)');
    }
    return X;
  }

  async function buildWorkbookBuffer(tappe) {
    const ExcelJS = getExcelJS();
    const sheet = buildTransazioniRows(tappe);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Studio Rivelli';
    wb.created = new Date();
    const ws = wb.addWorksheet(sheet.sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    sheet.rows.forEach((row, idx) => {
      const excelRow = ws.addRow(row.values);
      const style = styleForKind(row.kind);
      excelRow.height = row.kind === 'header' ? 22 : 18;
      excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = style.font;
        cell.fill = style.fill;
        if (style.alignment) cell.alignment = style.alignment;
        if (style.border) cell.border = Object.assign({}, cell.border, style.border);
        if (colNumber === 6 && typeof row.values[5] === 'number') {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        if (row.kind === 'tx' && colNumber === 4) {
          const tipo = String(row.values[3] || '');
          if (tipo === 'Fattura') {
            cell.font = Object.assign({}, style.font, { color: { argb: 'FF1D4ED8' } });
          } else {
            cell.font = Object.assign({}, style.font, { color: { argb: 'FF166534' } });
          }
        }
      });
      if (idx === 0) {
        excelRow.eachCell(cell => {
          cell.protection = { locked: true };
        });
      }
    });

    const widths = autofitWidths(sheet.rows);
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 6 }
    };

    const buffer = await wb.xlsx.writeBuffer();
    return { sheet, buffer };
  }

  async function downloadTransazioniExcel(tappe) {
    const { sheet, buffer } = await buildWorkbookBuffer(tappe);
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sheet.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return sheet;
  }

  function dayOnly(v) {
    const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  function cell(v) {
    return neutralizeExcelFormula(v == null ? '' : v);
  }

  function sharePointUrl(v) {
    const s = String(v == null ? '' : v).trim();
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:') return '';
      if (!/\.sharepoint\.com$/i.test(u.hostname)) return '';
      return s;
    } catch {
      return '';
    }
  }

  function itemLink(it) {
    return cell(sharePointUrl(it && (it.web_url || it.webUrl)));
  }

  function importoOf(v) {
    const N = NS();
    try {
      if (N && typeof N.parseImporto === 'function') return N.parseImporto(v);
    } catch { /* fall through */ }
    const n = Number(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function voceOf(it) {
    const N = NS();
    if (N && typeof N.labelVoce === 'function') return N.labelVoce(it);
    return String((it && (it.dettaglio || it.indirizzo || it.pasto || it.mezzo)) || '');
  }

  function catOf(it) {
    const N = NS();
    if (N && typeof N.labelCategoria === 'function') return N.labelCategoria(it && it.categoria);
    return String((it && it.categoria) || '');
  }

  function buildArchivioSheets(view) {
    const macchinaRows = [{
      kind: 'header',
      values: ['Prenotazione', 'Operatore', 'Tipo', 'Dal', 'Al', 'Note', 'Data scontrino', 'Luogo', 'Link']
    }];
    (view && view.macchina || []).forEach(p => {
      const sc = Array.isArray(p.scontrini) ? p.scontrini : [];
      if (!sc.length) {
        macchinaRows.push({
          kind: 'tx',
          values: [cell(p.id), cell(p.operatore), cell(p.tipo_utilizzo), cell(dayOnly(p.data_da)), cell(dayOnly(p.data_a)), cell(p.note), '', '', '']
        });
        return;
      }
      sc.forEach(s => {
        macchinaRows.push({
          kind: 'tx',
          values: [cell(p.id), cell(p.operatore), cell(p.tipo_utilizzo), cell(dayOnly(p.data_da)), cell(dayOnly(p.data_a)), cell(p.note), cell(fmtTimestamp(s.created_at)), cell(s.indirizzo), itemLink(s)]
        });
      });
    });

    const trasferteRows = [{
      kind: 'header',
      values: ['Trasferta', 'Persona', 'Tappa', 'Città', 'Cliente', 'Dal', 'Al', 'Tipo riga', 'Voce', 'Importo', 'Link']
    }];
    (view && view.trasferte || []).forEach(tr => {
      (tr.tappe || []).forEach(t => {
        const tappaLabel = 'Tappa ' + (t.tappa_numero == null ? '?' : t.tappa_numero);
        const base = [cell(tr.trasferta_id), cell(tr.nome_persona), cell(tappaLabel), cell(t.citta), cell(t.cliente_tappa), cell(dayOnly(t.data_arrivo)), cell(dayOnly(t.data_partenza))];
        const notes = Array.isArray(t.note) ? t.note : [];
        notes.forEach(n => {
          const tipo = String(n.tipo || '').toLowerCase() === 'fattura' ? 'Fattura' : 'Scontrino';
          trasferteRows.push({
            kind: 'tx',
            values: base.concat([tipo, cell(voceOf(n) || catOf(n)), importoOf(n.importo), itemLink(n)])
          });
        });
        (t.servizi || []).forEach(sv => {
          (sv.allegati || []).forEach(a => {
            trasferteRows.push({
              kind: 'tx',
              values: base.concat(['Allegato', cell((sv.tipo ? sv.tipo + ' · ' : '') + (a.nome || 'file')), '', itemLink(a)])
            });
          });
        });
        if (!notes.length && !(t.servizi || []).some(sv => (sv.allegati || []).length)) {
          trasferteRows.push({
            kind: 'tappa',
            values: base.concat(['Tappa', '', '', ''])
          });
        }
      });
    });

    const romaRows = [{
      kind: 'header',
      values: ['Id', 'Dipendente', 'Data', 'Tipo', 'Categoria', 'Voce', 'Importo', 'Km', 'Link']
    }];
    (view && view.roma_e_dintorni || []).forEach(n => {
      const items = Array.isArray(n.note) && n.note.length ? n.note : [n];
      items.forEach(it => {
        const kmRaw = it.km == null || it.km === '' ? '' : Number(it.km);
        const km = typeof kmRaw === 'number' && Number.isFinite(kmRaw) ? kmRaw : '';
        romaRows.push({
          kind: 'tx',
          values: [
            cell(n.id || it.dt_id || it.id),
            cell(it.dipendente || n.dipendente),
            cell(dayOnly(n.data || it.data)),
            cell(it.tipo_doc || it.tipo),
            cell(catOf(it)),
            cell(voceOf(it)),
            importoOf(it.importo),
            km,
            itemLink(it) || itemLink(n)
          ]
        });
      });
    });

    return {
      filename: 'archivio_storico.xlsx',
      macchina: macchinaRows,
      trasferte: trasferteRows,
      roma_e_dintorni: romaRows
    };
  }

  async function downloadArchivioExcel(view) {
    const ExcelJS = getExcelJS();
    const built = buildArchivioSheets(view);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Studio Rivelli';
    wb.created = new Date();
    function addSheet(name, rows, moneyCol) {
      const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      rows.forEach((row, idx) => {
        const excelRow = ws.addRow(row.values);
        const style = styleForKind(row.kind);
        excelRow.height = row.kind === 'header' ? 22 : 18;
        excelRow.eachCell({ includeEmpty: true }, (cellObj, colNumber) => {
          cellObj.font = style.font;
          cellObj.fill = style.fill;
          if (style.alignment) cellObj.alignment = style.alignment;
          if (style.border) cellObj.border = Object.assign({}, cellObj.border, style.border);
          if (moneyCol && colNumber === moneyCol && typeof row.values[moneyCol - 1] === 'number') {
            cellObj.numFmt = '#,##0.00';
            cellObj.alignment = { horizontal: 'right', vertical: 'middle' };
          }
          const raw = row.values[colNumber - 1];
          if (typeof raw === 'string' && /^https:\/\//i.test(raw)) {
            cellObj.value = { text: raw, hyperlink: raw };
            cellObj.font = Object.assign({}, style.font, { underline: true, color: { argb: 'FF1E4FA3' } });
          }
        });
        if (idx === 0) excelRow.eachCell(c => { c.protection = { locked: true }; });
      });
      autofitWidths(rows).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      if (rows[0] && rows[0].values) {
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: rows[0].values.length } };
      }
    }
    addSheet('Macchina', built.macchina);
    addSheet('Trasferte', built.trasferte, 10);
    addSheet('Roma e dintorni', built.roma_e_dintorni, 7);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = built.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return built;
  }

  global.SRNotaSpeseExport = {
    buildTransazioniSheet,
    buildTransazioniRows,
    autofitWidths,
    styleForKind,
    buildWorkbookBuffer,
    downloadTransazioniExcel,
    collectPacchettoFiles,
    bundlePrintItems,
    zipStore,
    parseGasDownloadResponse,
    fetchDriveFileViaGas,
    buildPacchettoZip,
    downloadTransazioniPacchetto,
    buildArchivioSheets,
    downloadArchivioExcel,
    fmtTimestamp,
    neutralizeExcelFormula
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
