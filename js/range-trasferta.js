/**
 * Estensione periodo trasferta: sync live vs conferma al salvataggio/invio.
 */
(function (global) {
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

  function snapshotRange(inizio, fine) {
    return {
      inizio: String(inizio || '').trim(),
      fine: String(fine || '').trim()
    };
  }

  global.SRRangeTrasferta = {
    rangeNeedsExtendConfirm,
    snapshotRange
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
