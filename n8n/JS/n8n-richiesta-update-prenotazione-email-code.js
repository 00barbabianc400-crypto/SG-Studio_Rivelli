// n8n Code — Email richiesta modifica (conflitto prenotazione)
// Webhook: richiesta-update-prenotazione (POST)
// Output → Microsoft Outlook "Send a message"
//
// Body HTML atteso:
// {
//   "richiesta": { "operatore", "tipo_utilizzo", "data_da", "data_a", "note?", "numero_trasferta?" },
//   "conflitto": { "id?", "operatore", "tipo_utilizzo", "data_da", "data_a", "note?", "numero_trasferta?" }
// }

const raw = $input.first().json;
const body = raw.body ?? raw;

const richiesta = body.richiesta || {};
const conflitto = body.conflitto || {};

function normDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

function fmtIt(iso) {
  const d = normDate(iso);
  if (!d) return '—';
  const dt = new Date(d + 'T12:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function fmtPeriodo(da, a) {
  const d1 = normDate(da);
  const d2 = normDate(a);
  if (!d1 && !d2) return '—';
  if (!d2 || d1 === d2) return fmtIt(d1);
  return `${fmtIt(d1)} → ${fmtIt(d2)}`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bloccoPrenotazione(titolo, b, accent) {
  const note = b.note ? esc(b.note) : '—';
  const num = String(b.numero_trasferta || '').trim();
  const rigaNum = b.tipo_utilizzo === 'Trasferta' || num
    ? `<p style="margin:0 0 6px;font-size:13px;color:#4a6180;"><strong>N. trasferta:</strong> ${esc(num || '—')}</p>`
    : '';
  return `
  <div style="margin:0 0 16px;padding:16px 18px;border:1px solid #e2e7f4;border-left:4px solid ${accent};border-radius:8px;background:#fafbfc;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#8fa3be;margin-bottom:10px;">${titolo}</div>
    <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#0a1628;">${esc(b.operatore || '—')}</p>
    <p style="margin:0 0 6px;font-size:13px;color:#4a6180;"><strong>Tipo:</strong> ${esc(b.tipo_utilizzo || '—')}</p>
    ${rigaNum}
    <p style="margin:0 0 6px;font-size:13px;color:#4a6180;"><strong>Periodo:</strong> ${fmtPeriodo(b.data_da, b.data_a)}</p>
    <p style="margin:0;font-size:13px;color:#4a6180;"><strong>Note:</strong> ${note}</p>
  </div>`;
}

const richiedente = String(richiesta.operatore || body.richiedente || 'Operatore').trim();
const subject = `Richiesta modifica prenotazione auto — ${richiedente}`;

const htmlBody = `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"></head>
<body style="font-family:Segoe UI,Arial,sans-serif;color:#1e3050;padding:24px;max-width:640px;line-height:1.5;">
  <h2 style="margin:0 0 8px;font-size:18px;color:#0a1628;">Richiesta modifica prenotazione auto</h2>
  <p style="margin:0 0 20px;font-size:14px;color:#4a6180;">
    <strong>${esc(richiedente)}</strong> ha tentato una nuova prenotazione in un periodo già occupato
    e chiede una modifica alla prenotazione esistente.
  </p>
  ${bloccoPrenotazione('Nuova prenotazione richiesta', richiesta, '#2d6ef0')}
  ${bloccoPrenotazione('Prenotazione in conflitto (già presente)', conflitto, '#b45309')}
  <p style="margin:20px 0 0;font-size:12px;color:#8fa3be;">Generato il ${new Date().toLocaleString('it-IT')}</p>
</body></html>`;

const testoPiano = [
  `${richiedente} ha richiesto una modifica alla prenotazione dell'auto aziendale.`,
  '',
  'NUOVA PRENOTAZIONE RICHIESTA:',
  `Operatore: ${richiesta.operatore || '—'}`,
  `Tipo: ${richiesta.tipo_utilizzo || '—'}`,
  `N. trasferta: ${richiesta.numero_trasferta || '—'}`,
  `Periodo: ${fmtPeriodo(richiesta.data_da, richiesta.data_a)}`,
  `Note: ${richiesta.note || '—'}`,
  '',
  'PRENOTAZIONE IN CONFLITTO:',
  `Operatore: ${conflitto.operatore || '—'}`,
  `Tipo: ${conflitto.tipo_utilizzo || '—'}`,
  `N. trasferta: ${conflitto.numero_trasferta || '—'}`,
  `Periodo: ${fmtPeriodo(conflitto.data_da, conflitto.data_a)}`,
  `Note: ${conflitto.note || '—'}`
].join('\n');

return [{
  json: {
    subject,
    body: htmlBody,
    bodyContentType: 'html',
    testo_piano: testoPiano,
    richiedente,
    richiesta,
    conflitto
  }
}];
