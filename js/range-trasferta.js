/**
 * Date range / validazione trasferte — niente swap automatico in UI.
 * Estensione anagrafica solo a salvataggio/invio dopo conferma.
 */
(function (global) {
  function snapshotRange(inizio, fine) {
    return {
      inizio: String(inizio || '').trim(),
      fine: String(fine || '').trim()
    };
  }

  /** True se da ≤ a (stesso giorno ok). Vuoti ammessi. */
  function isDateOrderOk(da, a) {
    const d = String(da || '').trim();
    const x = String(a || '').trim();
    if (!d || !x) return true;
    return d <= x;
  }

  /**
   * Serve conferma se lo span tappe esce dal periodo anagrafica già impostato.
   * snapshot = anagrafica corrente; live = span tappe (inizio/fine del periodo proposto).
   */
  function rangeNeedsExtendConfirm(snapshot, live) {
    const sIn = String(snapshot && snapshot.inizio || '').trim();
    const sFine = String(snapshot && snapshot.fine || '').trim();
    const lIn = String(live && live.inizio || '').trim();
    const lFine = String(live && live.fine || '').trim();
    if (!sIn && !sFine) return false;
    if (lIn && sIn && lIn < sIn) return true;
    if (lFine && sFine && lFine > sFine) return true;
    return false;
  }

  /** Nuovo periodo dopo "Sì, estendi" (allarga solo i bordi necessari). */
  function extendedRange(anagrafica, span) {
    const aIn = String(anagrafica && anagrafica.inizio || '').trim();
    const aFine = String(anagrafica && anagrafica.fine || '').trim();
    const sIn = String(span && span.inizio || '').trim();
    const sFine = String(span && span.fine || '').trim();
    if (!aIn && !aFine) return snapshotRange(sIn, sFine);
    return {
      inizio: (sIn && aIn) ? (sIn < aIn ? sIn : aIn) : (sIn || aIn),
      fine: (sFine && aFine) ? (sFine > aFine ? sFine : aFine) : (sFine || aFine)
    };
  }

  global.SRRangeTrasferta = {
    rangeNeedsExtendConfirm,
    snapshotRange,
    isDateOrderOk,
    extendedRange
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
