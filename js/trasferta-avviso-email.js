/**
 * Avviso email al leader — HTML itinerario (Outlook-safe) + flag auto_az.
 */
(function (global) {
  function esc(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isAutoAzMezzo(nome) {
    const n = String(nome || '').toLowerCase().replace(/\./g, '').trim();
    return n.includes('auto az') || n === 'auto aziendale';
  }

  function normalizeServizi(raw) {
    let data = raw;
    if (data == null || data === '') return [];
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return []; }
    }
    if (Array.isArray(data)) {
      return data.filter(it => it && typeof it === 'object' && String(it.tipo || '').trim());
    }
    if (typeof data !== 'object') return [];
    return Object.entries(data).map(([tipo, dati]) => {
      if (!dati || typeof dati !== 'object' || Array.isArray(dati)) return null;
      return { tipo: String(tipo), ...dati };
    }).filter(Boolean);
  }

  function mezziTappa(tappa) {
    if (!tappa) return [];
    if (Array.isArray(tappa.mezzo_per_raggiungere)) {
      return tappa.mezzo_per_raggiungere.filter(m => m != null && String(m).trim() !== '');
    }
    const s = String(tappa.mezzo_raggiungimento || '').trim();
    if (!s) return [];
    return s.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
  }

  function hasAutoAz(itinerario) {
    return (itinerario || []).some(t => {
      if (normalizeServizi(t && t.servizi).some(s => String(s.tipo).toLowerCase() === 'auto_az')) return true;
      return mezziTappa(t).some(isAutoAzMezzo);
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const raw = String(dateStr);
    const d = new Date(raw.length === 10 ? raw + 'T12:00:00' : raw);
    if (isNaN(d.getTime())) return esc(raw);
    return d.toLocaleDateString('it-IT', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function parsePartecipanti(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(99, Math.floor(n));
  }

  const servizioNomi = {
    hotel: 'Hotel', aereo: 'Aereo', treno: 'Treno', noleggio: 'Noleggio auto',
    parcheggio: 'Parcheggio', auto_az: 'Auto aziendale', bus: 'Bus', moto: 'Moto'
  };

  function renderServizi(servizi) {
    const list = normalizeServizi(servizi);
    if (!list.length) return '';
    return list.map(s => {
      const nome = servizioNomi[s.tipo] || s.tipo;
      const stato = s.stato ? String(s.stato).replace(/_/g, ' ') : '';
      const tratta = s.tratta ? ' · ' + s.tratta : '';
      return '<div style="font-size:12px;color:#4a6180;margin:2px 0;">• '
        + esc(nome) + (tratta ? esc(tratta) : '')
        + (stato ? ' <em>(' + esc(stato) + ')</em>' : '')
        + '</div>';
    }).join('');
  }

  function build(opts) {
    const o = opts || {};
    const ana = o.anagrafica || {};
    const itinerario = Array.isArray(o.itinerario) ? o.itinerario : [];
    const trasferta_id = String(o.trasferta_id || '').trim() || '—';
    const toEmail = String(ana.email || o.email_to || '').trim().toLowerCase();
    const nome = String(ana.nome_cognome || ana.nome_persona || '').trim() || '—';
    const autoAz = hasAutoAz(itinerario);
    const nPart = parsePartecipanti(ana.numero_partecipanti);
    const tappeHtml = itinerario.map((t, i) => {
      const n = t.tappa != null ? t.tappa : (i + 1);
      const mezzi = mezziTappa(t);
      const cliente = t.cliente_attivita || t.cliente_tappa || '—';
      return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid #e9eef5;border-left:4px solid #2563eb;border-radius:8px;">'
        + '<tr><td style="padding:14px 16px;">'
        + '<div style="font-size:15px;font-weight:700;color:#111827;">Tappa ' + esc(n) + ' · ' + esc(t.citta || '—') + '</div>'
        + '<div style="font-size:13px;color:#6b7280;margin:6px 0;">'
        + esc(formatDate(t.data_arrivo)) + ' → ' + esc(formatDate(t.data_partenza || t.data_arrivo))
        + '</div>'
        + '<div style="font-size:13px;color:#111827;"><strong>Cliente</strong> ' + esc(cliente) + '</div>'
        + (mezzi.length ? '<div style="margin-top:6px;">' + mezzi.map(m =>
          '<span style="display:inline-block;background:#eff6ff;color:#1e4fa3;padding:2px 8px;border-radius:999px;font-size:11px;margin:2px 4px 0 0;">'
          + esc(m) + '</span>').join('') + '</div>' : '')
        + renderServizi(t.servizi)
        + (t.note ? '<div style="margin-top:8px;font-size:12px;color:#9a3412;background:#fff7ed;padding:8px;border-radius:8px;">'
          + esc(t.note) + '</div>' : '')
        + '</td></tr></table>';
    }).join('');

    const reminder = autoAz
      ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;"><tr><td style="padding:14px 16px;font-size:14px;color:#9a3412;line-height:1.5;">'
        + '<strong>Auto aziendale.</strong> Mi raccomando: ricorda di prenotare la macchina per le date della trasferta.'
        + '</td></tr></table>'
      : '';

    const html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"></head>'
      + '<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Tahoma,sans-serif;color:#111827;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center">'
      + '<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:16px;overflow:hidden;">'
      + '<tr><td style="background:#1e4fa3;padding:22px 24px;color:#fff;">'
      + '<div style="font-size:11px;letter-spacing:0.4px;text-transform:uppercase;opacity:.85;">Studio Rivelli</div>'
      + '<h1 style="margin:6px 0 0;font-size:22px;">La tua trasferta è stata preparata</h1>'
      + '</td></tr><tr><td style="padding:24px;">'
      + '<p style="font-size:15px;line-height:1.5;margin:0 0 16px;">Ciao ' + esc(nome.split(' ')[0] || nome)
      + ', l\'organizzazione ha salvato l\'itinerario. Controlla tappe e servizi qui sotto.</p>'
      + '<div style="font-size:12px;color:#6b7280;margin-bottom:16px;">ID <strong style="color:#111827;font-family:Consolas,monospace;">'
      + esc(trasferta_id) + '</strong> · ' + esc(nPart === 1 ? '1 partecipante' : nPart + ' partecipanti') + '</div>'
      + tappeHtml
      + (o.note_generali ? '<div style="margin-top:8px;padding:12px;background:#fff7ed;border-radius:8px;font-size:13px;">'
        + esc(o.note_generali) + '</div>' : '')
      + reminder
      + '</td></tr></table></td></tr></table></body></html>';

    const citta = itinerario[0] && itinerario[0].citta ? itinerario[0].citta : 'Trasferta';
    const subject = 'Trasferta preparata [' + trasferta_id + '] — ' + citta;

    return {
      html: html,
      subject: subject,
      toEmail: toEmail,
      toName: nome,
      hasAutoAz: autoAz,
      canSend: !!toEmail
    };
  }

  global.SRTrasfertaAvvisoEmail = { esc, hasAutoAz, build, isAutoAzMezzo };
})(typeof globalThis !== 'undefined' ? globalThis : window);
