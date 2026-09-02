/**
 * Helper scontrini benzina — parse / append JSON Data Table + URL Drive.
 */
(function (global) {
  function parseScontriniJson(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.filter(isScontrino);
    if (typeof raw === 'object' && isScontrino(raw)) return [raw];
    const s = String(raw).trim();
    if (!s) return [];
    try {
      const data = JSON.parse(s);
      if (Array.isArray(data)) return data.filter(isScontrino);
      if (data && Array.isArray(data.scontrini)) return data.scontrini.filter(isScontrino);
      if (isScontrino(data)) return [data];
    } catch {
      return [];
    }
    return [];
  }

  function isScontrino(obj) {
    return !!(obj && typeof obj === 'object' && (obj.foto_id || obj.foto_url || obj.fileId));
  }

  function fileIdFrom(item) {
    if (!item) return '';
    const direct = String(item.foto_id || item.fileId || '').trim();
    if (direct) return direct;
    const url = String(item.foto_url || item.url || '');
    const m = url.match(/[-\w]{25,}/);
    return m ? m[0] : '';
  }

  function viewUrl(item) {
    const id = fileIdFrom(item);
    if (id) return 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(id);
    return String(item && (item.foto_url || item.url) || '');
  }

  function previewUrl(item) {
    const id = fileIdFrom(item);
    if (id) return 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview';
    return viewUrl(item);
  }

  function downloadUrl(item) {
    const id = fileIdFrom(item);
    if (id) return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id);
    return viewUrl(item);
  }

  function uid() {
    return 'sc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function appendScontrino(existingRaw, incoming) {
    const list = parseScontriniJson(existingRaw);
    const item = {
      id: incoming.id || uid(),
      created_at: incoming.created_at || new Date().toISOString(),
      indirizzo: String(incoming.indirizzo || '').trim(),
      lat: incoming.lat == null || incoming.lat === '' ? null : Number(incoming.lat),
      lng: incoming.lng == null || incoming.lng === '' ? null : Number(incoming.lng),
      foto_url: String(incoming.foto_url || incoming.url || '').trim(),
      foto_id: String(incoming.foto_id || incoming.fileId || '').trim(),
      mime: String(incoming.mime || 'image/jpeg')
    };
    if (!item.foto_id && !item.foto_url) {
      throw new Error('Scontrino senza file Drive');
    }
    list.push(item);
    return list;
  }

  function stringify(list) {
    return JSON.stringify(Array.isArray(list) ? list : []);
  }

  global.SRScontrini = {
    parseScontriniJson,
    appendScontrino,
    stringify,
    fileIdFrom,
    viewUrl,
    previewUrl,
    downloadUrl,
    uid
  };
})(typeof window !== 'undefined' ? window : globalThis);
