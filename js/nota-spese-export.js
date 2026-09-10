/**
 * Export Excel (.xlsx) delle transazioni nota spese — senza foto.
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
    const cols = 6;
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

  global.SRNotaSpeseExport = {
    buildTransazioniSheet,
    buildTransazioniRows,
    autofitWidths,
    styleForKind,
    buildWorkbookBuffer,
    downloadTransazioniExcel,
    fmtTimestamp,
    neutralizeExcelFormula
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
