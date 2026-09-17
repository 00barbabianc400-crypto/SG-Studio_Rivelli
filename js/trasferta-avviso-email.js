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
    parcheggio: 'Parcheggio', auto_az: 'Auto aziendale', bus: 'Bus', moto: 'Moto',
    spostamento: 'Spostamento'
  };

  const FIELD_LABELS = {
    nome: 'Struttura',
    notti: 'Notti',
    tratta: 'Tratta',
    ritiro: 'Ritiro',
    restituzione: 'Restituzione',
    luogo: 'Luogo',
    costo: 'Costo',
    costo_servizio: 'Costo',
    stato: 'Stato',
    metodo_pagamento: 'Pagamento',
    valore_voucher: 'Voucher',
    metodo_pagamento_differenza: 'Pagamento differenza',
    differenza_pagamento: 'Differenza',
    giornate_da: 'Dal',
    giornate_a: 'Al',
    prenotato: 'Prenotato'
  };

  const STATO_LABELS = {
    da_prenotare: 'Da prenotare',
    prenotato: 'Prenotato',
    acquistato: 'Acquistato',
    da_richiedere: 'Da richiedere',
    confermato: 'Confermato'
  };

  const METODO_LABELS = {
    carta_aziendale: 'Carta aziendale',
    voucher: 'Voucher',
    carta_credito: 'Carta di credito',
    bonifico: 'Bonifico',
    conto_corrente: 'Conto corrente'
  };

  function prettyVal(key, v) {
    if (v == null || v === '') return '';
    if (typeof v === 'boolean') return v ? 'Sì' : 'No';
    const s = String(v).trim();
    if (!s) return '';
    if (key === 'stato') return STATO_LABELS[s] || s.replace(/_/g, ' ');
    if (key === 'metodo_pagamento' || key === 'metodo_pagamento_differenza') {
      return METODO_LABELS[s] || s.replace(/_/g, ' ');
    }
    if (key === 'giornate_da' || key === 'giornate_a') return formatDate(s);
    if (key === 'prenotato') return s === 'true' || s === '1' ? 'Sì' : s;
    return s;
  }

  function flattenServizio(s) {
    const po = s.prenotazione_operatrice && typeof s.prenotazione_operatrice === 'object'
      ? s.prenotazione_operatrice
      : {};
    const out = { ...s };
    ['metodo_pagamento', 'valore_voucher', 'metodo_pagamento_differenza', 'differenza_pagamento',
      'giornate_da', 'giornate_a', 'costo_servizio'].forEach(k => {
      if (out[k] == null || out[k] === '') {
        if (po[k] != null && po[k] !== '') out[k] = po[k];
      }
    });
    if (!out.costo && po.costo_servizio) out.costo = po.costo_servizio;
    return out;
  }

  const SKIP_KEYS = {
    id: 1, tipo: 1, prenotazione_operatrice: 1, allegati: 1, mezzo_viaggio: 1
  };

  const FIELD_ORDER = [
    'nome', 'notti', 'tratta', 'ritiro', 'restituzione', 'luogo',
    'giornate_da', 'giornate_a', 'costo', 'costo_servizio',
    'metodo_pagamento', 'valore_voucher', 'metodo_pagamento_differenza',
    'differenza_pagamento', 'stato'
  ];

  function renderServizi(servizi) {
    const list = normalizeServizi(servizi);
    if (!list.length) return '';
    const cards = list.map(raw => {
      const s = flattenServizio(raw);
      const titolo = servizioNomi[s.tipo] || s.tipo;
      const keys = FIELD_ORDER.filter(k => {
        if (SKIP_KEYS[k]) return false;
        if (k === 'costo_servizio' && s.costo) return false;
        const val = prettyVal(k, s[k]);
        return !!val;
      });
      Object.keys(s).forEach(k => {
        if (SKIP_KEYS[k] || FIELD_ORDER.indexOf(k) >= 0) return;
        if (typeof s[k] === 'object') return;
        if (prettyVal(k, s[k])) keys.push(k);
      });
      const nAll = Array.isArray(raw.allegati) ? raw.allegati.length : 0;
      const rows = keys.map(k => {
        const label = FIELD_LABELS[k] || k.replace(/_/g, ' ');
        return '<tr><td style="padding:3px 10px 3px 0;font-size:12px;color:#6b7280;white-space:nowrap;vertical-align:top;">'
          + esc(label) + '</td><td style="padding:3px 0;font-size:13px;color:#111827;font-weight:500;">'
          + esc(prettyVal(k, s[k])) + '</td></tr>';
      }).join('');
      const extra = nAll
        ? '<tr><td style="padding:3px 10px 3px 0;font-size:12px;color:#6b7280;">Allegati</td>'
          + '<td style="padding:3px 0;font-size:13px;color:#111827;">' + nAll + '</td></tr>'
        : '';
      return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0;background:#f8fafc;border:1px solid #e8f0fe;border-radius:8px;">'
        + '<tr><td style="padding:10px 12px;">'
        + '<div style="font-size:13px;font-weight:700;color:#1e4fa3;margin:0 0 6px;">' + esc(titolo) + '</div>'
        + '<table cellpadding="0" cellspacing="0">' + rows + extra + '</table>'
        + '</td></tr></table>';
    }).join('');
    return '<div style="margin-top:10px;"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;">Servizi prenotati</div>'
      + cards + '</div>';
  }

  function ciaoNome(nome) {
    const first = String(nome || '').split(/\s+[–—]\s+/)[0].trim();
    const word = first.split(/\s+/)[0] || first;
    return word || 'ciao';
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
      + '<p style="font-size:15px;line-height:1.5;margin:0 0 16px;">Ciao ' + esc(ciaoNome(nome))
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
