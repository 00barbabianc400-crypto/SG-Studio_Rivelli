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

  function thumbnailUrl(item) {
    const id = fileIdFrom(item);
    if (id) return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w1200';
    return viewUrl(item);
  }

  const ICO_RECEIPT = '<svg class="sc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 3.5h12v17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V3.5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>';
  const ICO_PENCIL = '<svg class="sc-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/></svg>';
  const ICO_DOWNLOAD = '<svg class="sc-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 4v12"/><path d="M7 12l5 5 5-5"/><path d="M5 20h14"/></svg>';
  const ICO_PRINT = '<svg class="sc-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 8V4h10v4"/><path d="M7 16H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 12h10v8H7z"/></svg>';

  global.SRScontrini = {
    parseScontriniJson,
    appendScontrino,
    stringify,
    fileIdFrom,
    viewUrl,
    previewUrl,
    downloadUrl,
    thumbnailUrl,
    ICO_RECEIPT,
    ICO_PENCIL,
    ICO_DOWNLOAD,
    ICO_PRINT,
    uid
  };
})(typeof window !== 'undefined' ? window : globalThis);
