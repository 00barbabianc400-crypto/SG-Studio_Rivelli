/**
 * Prenotazione auto aziendale — vincolo numero_trasferta.
 * Colonna DT: numero_trasferta (string). Obbligatoria solo se tipo_utilizzo = Trasferta.
 */
(function (global) {
  function isTipoTrasferta(tipoUtilizzo) {
    return String(tipoUtilizzo || '').trim().toLowerCase() === 'trasferta';
  }

  function normalizeNumeroTrasferta(tipoUtilizzo, raw) {
    const value = String(raw == null ? '' : raw).trim();
    if (isTipoTrasferta(tipoUtilizzo)) {
      if (!value) {
        return { ok: false, value: '', error: 'Indica il numero della trasferta' };
      }
      return { ok: true, value: value };
    }
    return { ok: true, value: '' };
  }

  global.SRPrenotazioneAuto = { isTipoTrasferta, normalizeNumeroTrasferta };
})(typeof globalThis !== 'undefined' ? globalThis : window);
