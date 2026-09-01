/**
 * n8n Code — filtro promemoria ore < 8 (cron 17:45)
 * Nome: "Code Timesheet EOD Filter"
 *
 * Nomi nodi (se usi Get separati):
 *   - "Get Subscriptions"
 *   - "Get Timesheet Rows"
 * Se usi Merge: legge anche `items` e separa per forma
 *   (subscription = ha endpoint; riga ore = ha id_giornata / ore_ore)
 *
 * FIX data: in DT data_giorno è UTC tipo 2026-08-10T22:00:00.000Z
 * (= 11/08 00:00 Europe/Rome). NON usare .slice(0,10) sulla stringa UTC.
 */

const SUBS_NODE = 'Get Subscriptions';
const TS_NODE = 'Get Timesheet Rows';
const SOGLIA = 8;

function todayRome() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/** ISO / Date → YYYY-MM-DD in Europe/Rome */
function toRomeDateKey(value) {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    /* già YYYY-MM-DD */
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s.slice(0, 10);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function normName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesMatch(a, b) {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const xw = x.split(' ');
  const yw = y.split(' ');
  const cognome = xw[xw.length - 1];
  return cognome.length > 2 && yw.includes(cognome);
}

function loadAll(nodeName) {
  try {
    return $(nodeName).all().map(i => i.json || {});
  } catch {
    return [];
  }
}

function isSub(j) {
  return !!(j && j.endpoint && (j.p256dh || j.keys?.p256dh));
}

function isTimesheetRow(j) {
  return !!(j && (j.id_giornata || j.ore_ore != null || j.fascia_oraria));
}

function rowIsToday(r, today) {
  if (String(r.id_giornata || '').startsWith(today + '_')) return true;
  const key = toRomeDateKey(r.data_giorno || r.data);
  return key === today;
}

const today = todayRome();
let subs = loadAll(SUBS_NODE);
let rows = loadAll(TS_NODE);

/* Fallback: Merge / input misto */
if (!subs.length || !rows.length) {
  const all = items.map(i => i.json || {});
  if (!subs.length) subs = all.filter(isSub);
  if (!rows.length) rows = all.filter(isTimesheetRow);
}

const out = [];

for (const sub of subs) {
  if (sub.active === false) continue;
  const endpoint = sub.endpoint;
  const p256dh = sub.p256dh || sub.keys?.p256dh;
  const auth = sub.auth || sub.keys?.auth;
  if (!endpoint || !p256dh || !auth) continue;

  const label = sub.dipendente || sub.name || '';
  const email = String(sub.email || '').toLowerCase();

  const dayRows = rows.filter(r => {
    if (!rowIsToday(r, today)) return false;
    return namesMatch(label, r.dipendente) || namesMatch(email, r.email);
  });

  let ore = 0;
  if (dayRows.length) {
    const withTotal = dayRows.find(r => r.ore_totali != null && r.ore_totali !== '');
    if (withTotal) {
      ore = Number(withTotal.ore_totali) || 0;
    } else {
      ore = dayRows.reduce((s, r) => s + (Number(r.ore_ore) || 0), 0);
    }
  }

  if (ore >= SOGLIA) continue;

  const oreLabel = Math.round(ore * 10) / 10;
  out.push({
    json: {
      ok: true,
      notification_type: 'timesheet_eod',
      date_key: today,
      email,
      dipendente: label,
      ore,
      righe: dayRows.length,
      endpoint,
      keys: { p256dh, auth },
      title: 'Foglio presenze',
      body: dayRows.length
        ? `Hai registrato ${oreLabel} ore su 8. Completa la giornata.`
        : 'Non risultano ore per oggi. Compila il foglio presenze.',
      url: '/timesheet_rivelli.html',
      tag: `sr-timesheet-${today}`
    }
  });
}

if (!out.length) {
  return [{ json: { ok: false, message: 'Nessun promemoria da inviare', date_key: today } }];
}
return out;
