(function (g) {
  'use strict';

  function isDriveUrl(url) {
    return /^https:\/\/(drive\.google\.com|lh3\.googleusercontent\.com)\//i.test(String(url || ''));
  }

  function fileId(id, url) {
    const direct = String(id || '').trim();
    if (/^[-\w]{25,}$/.test(direct)) return direct;
    const m = String(url || '').match(/\/(?:file\/d\/|open\?id=|uc\?export=download&id=)?([-\w]{25,})/);
    if (m && m[1]) return m[1];
    const fallback = String(url || '').match(/[-\w]{25,}/);
    return fallback ? fallback[0] : '';
  }

  function normalize(fotoId, fotoUrl) {
    const url = String(fotoUrl || '').trim();
    const id = fileId(fotoId, url);
    if (id) {
      return {
        ok: true,
        foto_id: id,
        foto_url: isDriveUrl(url) ? url : ('https://drive.google.com/open?id=' + id)
      };
    }
    if (isDriveUrl(url)) return { ok: true, foto_id: '', foto_url: url };
    return { ok: false, message: 'Link file non Drive' };
  }

  g.SRDriveFoto = {
    isDriveUrl: isDriveUrl,
    fileId: fileId,
    normalize: normalize
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
