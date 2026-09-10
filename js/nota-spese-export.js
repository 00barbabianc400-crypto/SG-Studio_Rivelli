/**
 * Export Excel (SpreadsheetML) delle transazioni nota spese — senza foto.
 */
(function (global) {
  function escXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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
   * Un solo foglio: righe transazione + totali per tappa + totale trasferta.
   * Colonne: Timestamp | Tappa | Categoria | Tipo | Voce | Importo
   * Importo numerico solo sulle transazioni; i totali sono stringhe (non entrano in SUM).
   * Nessun campo foto.
   */
  function buildTransazioniSheet(tappe) {
    const list = Array.isArray(tappe) ? tappe : [];
    const N = NS();
    const headers = ['Timestamp', 'Tappa', 'Categoria', 'Tipo', 'Voce', 'Importo'];
    const aoa = [headers];
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
        aoa.push([
          neutralizeExcelFormula(fmtTimestamp(it && it.created_at)),
          neutralizeExcelFormula(tappaLabel),
          neutralizeExcelFormula(cat),
          tipo,
          neutralizeExcelFormula(voce),
          importo
        ]);
      });

      const sums = N && typeof N.sumImportiByTipo === 'function'
        ? N.sumImportiByTipo(notes)
        : { scontrino: 0, fattura: 0, totale: 0 };
      aoa.push(['', neutralizeExcelFormula('Totale tappa · ' + tappaLabel), '', 'Σ Scontrini', '', String(sums.scontrino)]);
      aoa.push(['', neutralizeExcelFormula('Totale tappa · ' + tappaLabel), '', 'Σ Fatture', '', String(sums.fattura)]);
      aoa.push(['', neutralizeExcelFormula('Totale tappa · ' + tappaLabel), '', 'Totale', '', String(sums.totale)]);
    });

    const grand = N && typeof N.aggregateTrasferta === 'function'
      ? N.aggregateTrasferta(list)
      : { scontrino: 0, fattura: 0, totale: 0 };
    aoa.push(['', 'Totale trasferta', '', 'Σ Scontrini', '', String(grand.scontrino)]);
    aoa.push(['', 'Totale trasferta', '', 'Σ Fatture', '', String(grand.fattura)]);
    aoa.push(['', 'Totale trasferta', '', 'Totale speso', '', String(grand.totale)]);

    return {
      filename: 'transazioni_' + safeFilenamePart(tid) + '.xls',
      sheetName: 'Transazioni',
      aoa
    };
  }

  function aoaToSpreadsheetMl(aoa, sheetName) {
    const name = escXml(String(sheetName || 'Transazioni').slice(0, 31));
    const rows = (aoa || []).map(row => {
      const cells = (row || []).map(cell => {
        if (typeof cell === 'number' && Number.isFinite(cell)) {
          return '<Cell><Data ss:Type="Number">' + cell + '</Data></Cell>';
        }
        return '<Cell><Data ss:Type="String">' + escXml(neutralizeExcelFormula(cell)) + '</Data></Cell>';
      }).join('');
      return '<Row>' + cells + '</Row>';
    }).join('');
    return '<?xml version="1.0"?>\n'
      + '<?mso-application progid="Excel.Sheet"?>\n'
      + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n'
      + ' xmlns:o="urn:schemas-microsoft-com:office:office"\n'
      + ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n'
      + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
      + '<Worksheet ss:Name="' + name + '"><Table>' + rows + '</Table></Worksheet>\n'
      + '</Workbook>';
  }

  function downloadTransazioniExcel(tappe) {
    const sheet = buildTransazioniSheet(tappe);
    const xml = aoaToSpreadsheetMl(sheet.aoa, sheet.sheetName);
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
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
    aoaToSpreadsheetMl,
    downloadTransazioniExcel,
    fmtTimestamp,
    neutralizeExcelFormula
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
