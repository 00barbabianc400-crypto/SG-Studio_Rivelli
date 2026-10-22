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

  function itemsWithFoto(list) {
    return (Array.isArray(list) ? list : []).filter(it =>
      !!(fileIdFrom(it) || String((it && (it.foto_url || it.url)) || '').trim())
    );
  }

  function needsDownloadChoice(pool) {
    return itemsWithFoto(pool).length > 1;
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bundleRow(label, value) {
    const v = String(value == null ? '' : value).trim();
    if (!v) return '';
    return '<div style="margin:0 0 4px"><span style="font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6b7280">'
      + escHtml(label) + '</span><div style="font-size:14px;font-weight:600;color:#111827">'
      + escHtml(v) + '</div></div>';
  }

  function bundleCaption(it) {
    if (!it) return '';
    const tipo = String(it.tipo || '').toLowerCase();
    let tipoLabel = '';
    if (tipo === 'fattura') tipoLabel = 'Fattura';
    else if (tipo === 'scontrino') tipoLabel = 'Scontrino';
    else if (tipo === 'rimborso') tipoLabel = 'Rimborso';
    else if (it.indirizzo) tipoLabel = 'Scontrino benzina';
    const voce = [it.categoria, it.pasto, it.mezzo, it.dettaglio]
      .map(x => String(x || '').trim()).filter(Boolean).join(' · ');
    let importo = '';
    if (it.importo != null && it.importo !== '') {
      const n = Number(it.importo);
      if (Number.isFinite(n)) importo = n.toFixed(2).replace('.', ',') + ' €';
    }
    let orario = '';
    const rawWhen = it.created_at || it.data || '';
    if (rawWhen) {
      const d = new Date(rawWhen);
      orario = Number.isNaN(d.getTime()) ? String(rawWhen) : d.toLocaleString('it-IT');
    }
    const rif = it.id != null && String(it.id).trim() !== '' ? String(it.id) : '';
    return '<figcaption style="margin:12px 0 0;padding:12px 14px;background:#f3f4f6;border:1px solid #eceef2;border-radius:12px">'
      + bundleRow('Rif.', rif)
      + bundleRow('Tipo', tipoLabel)
      + bundleRow('Voce', voce)
      + bundleRow('Cliente', it.cliente)
      + bundleRow('Sede', it.sede)
      + bundleRow('Luogo', it.indirizzo)
      + bundleRow('Importo', importo)
      + bundleRow('Orario', orario)
      + '</figcaption>';
  }

  function printBundleHtml(items) {
    const figs = itemsWithFoto(items).map(it => {
      const src = String(thumbnailUrl(it) || '').replace(/"/g, '');
      return '<figure style="page-break-after:always;margin:0 0 24px">'
        + '<img src="' + src + '" style="max-width:100%;height:auto" alt="">'
        + bundleCaption(it)
        + '</figure>';
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Giustificativi</title></head>'
      + '<body style="margin:16px;font-family:\'DM Sans\',sans-serif">' + figs + '</body></html>';
  }

  const ICO_RECEIPT = '<svg class="sc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 3.5h12v17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V3.5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>';
  const ICO_PENCIL = '<svg class="sc-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/></svg>';
  const ICO_DOWNLOAD = '<svg class="sc-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 4v12"/><path d="M7 12l5 5 5-5"/><path d="M5 20h14"/></svg>';
  const ICO_PRINT = '<svg class="sc-ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 8V4h10v4"/><path d="M7 16H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 12h10v8H7z"/></svg>';

  const FOTO_ZOOM_HINT = 'Clicca per zoomare';
  const FOTO_ZOOM_CLASS = 'is-foto-zoom';

  function isFotoZoomed(modal) {
    return !!(modal && modal.classList && modal.classList.contains(FOTO_ZOOM_CLASS));
  }

  function setFotoZoom(modal, on) {
    if (!modal || !modal.classList) return false;
    modal.classList.toggle(FOTO_ZOOM_CLASS, !!on);
    return isFotoZoomed(modal);
  }

  function handleFotoChiudi(modal) {
    if (isFotoZoomed(modal)) {
      setFotoZoom(modal, false);
      return 'unzoom';
    }
    return 'close';
  }

  function syncFotoZoomWrap(wrap, img) {
    if (!wrap || !img) return;
    const hidden = img.style.display === 'none' || !String(img.getAttribute('src') || img.src || '').trim();
    wrap.classList.toggle('hidden', hidden);
  }

  function resetFotoViewer(modal, wrap, img) {
    setFotoZoom(modal, false);
    syncFotoZoomWrap(wrap, img);
  }

  function ensureFotoZoomStyles() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.getElementById('sr-foto-zoom-css')) return;
    const st = document.createElement('style');
    st.id = 'sr-foto-zoom-css';
    st.textContent =
      '.sc-view-foto{position:relative;border-radius:16px;overflow:hidden;background:#f3f4f6;cursor:zoom-in;border:1px solid #eceef2}'
      + '.sc-view-foto.hidden{display:none!important}'
      + '.sc-view-foto .sc-view-img{width:100%;max-height:min(52vh,420px);object-fit:contain;display:block;background:#f3f4f6}'
      + '.sc-view-zoom-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.72);opacity:0;transition:opacity .15s;pointer-events:none}'
      + '.sc-view-zoom-hint span{background:#fff;color:#2563eb;border:1px solid #eceef2;box-shadow:0 2px 8px rgba(17,24,39,.06);border-radius:999px;padding:10px 16px;font-size:13px;font-weight:600}'
      + '.sc-view-foto:hover .sc-view-zoom-hint{opacity:1}'
      + '@media (hover:none){.sc-view-zoom-hint{opacity:1;background:linear-gradient(to top,rgba(255,255,255,.92),rgba(255,255,255,0) 55%);align-items:flex-end;padding-bottom:14px}}'
      + '.modal-sc.is-foto-zoom .sc-view-dl{display:none!important}'
      + '.modal-sc.is-foto-zoom .sc-view-zoom-hint{display:none}'
      + '.modal-sc.is-foto-zoom .sc-view-foto{cursor:default}'
      + '.modal-sc.is-foto-zoom .sc-view-foto .sc-view-img{max-height:min(78vh,760px)}'
      + '.modal-sc.is-foto-zoom .modal-foot a,.modal-sc.is-foto-zoom .modal-foot .btn-icon{display:none!important}';
    document.head.appendChild(st);
  }

  function bindFotoZoom(opts) {
    const wrap = opts && opts.wrap;
    const img = (opts && opts.img) || (wrap && wrap.querySelector && wrap.querySelector('img'));
    const modal = opts && opts.modal;
    if (!wrap || !img || !modal) return;
    ensureFotoZoomStyles();
    if (wrap.getAttribute('data-sr-foto-zoom') === '1') return;
    wrap.setAttribute('data-sr-foto-zoom', '1');
    wrap.addEventListener('click', () => {
      if (img.style.display === 'none') return;
      if (isFotoZoomed(modal)) return;
      setFotoZoom(modal, true);
    });
  }

  global.SRScontrini = {
    parseScontriniJson,
    appendScontrino,
    stringify,
    fileIdFrom,
    viewUrl,
    previewUrl,
    downloadUrl,
    thumbnailUrl,
    itemsWithFoto,
    needsDownloadChoice,
    printBundleHtml,
    ICO_RECEIPT,
    ICO_PENCIL,
    ICO_DOWNLOAD,
    ICO_PRINT,
    uid,
    FOTO_ZOOM_HINT,
    isFotoZoomed,
    setFotoZoom,
    handleFotoChiudi,
    syncFotoZoomWrap,
    resetFotoViewer,
    bindFotoZoom
  };
})(typeof window !== 'undefined' ? window : globalThis);
