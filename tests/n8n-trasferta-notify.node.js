const fs = require('fs');
const path = require('path');

function run(src, json) {
  const $input = { first: () => ({ json }), all: () => [{ json }] };
  return new Function('$input', src)($input);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL', msg);
  }
}

const insertSrc = fs.readFileSync(path.join(__dirname, '..', 'n8n', 'JS', 'n8n-trasferta-insert-rows-code.js'), 'utf8');
const saveSrc = fs.readFileSync(path.join(__dirname, '..', 'n8n', 'JS', 'n8n-salvataggio-dati-code.js'), 'utf8');

const body = {
  anagrafica: { nome_cognome: 'Luca Rivelli', email: 'l.rivelli@studiorivelli.it', numero_partecipanti: 1 },
  itinerario: [
    { tappa: 1, citta: 'Roma', data_arrivo: '2026-09-28', data_partenza: '2026-09-28', servizi: [{ tipo: 'auto_az' }] },
    { tappa: 2, citta: 'Milano', data_arrivo: '2026-09-29', data_partenza: '2026-09-29' }
  ],
  meta: { trasferta_id: 'TRF-AVVISO-1' },
  send_email: true,
  email_html: '<p>ciao</p>',
  email_to: 'l.rivelli@studiorivelli.it',
  email_subject: 'Sub'
};

const ins = run(insertSrc, { body });
assert(ins.length === 2, 'insert two tappe');
assert(ins[0].json.send_email === true, 'insert first send_email');
assert(ins[0].json.email_html === '<p>ciao</p>', 'insert html');
assert(ins[0].json.citta === 'Roma', 'insert still a DT row');
assert(ins[1].json.send_email == null, 'second row no notify fields');

const insOff = run(insertSrc, { body: { ...body, send_email: false, email_html: '<p>x</p>' } });
assert(insOff[0].json.send_email === false, 'insert send_email false');
assert(insOff[0].json.email_html === '', 'html cleared when not sending');

const save = run(saveSrc, {
  body: {
    trasferta_id: 'TRF-AVVISO-1',
    trasferta: { anagrafica: body.anagrafica, itinerario: body.itinerario },
    righe_db: [
      { id: 1, trasferta_id: 'TRF-AVVISO-1', tappa_numero: '1', citta: 'Roma', email: 'l.rivelli@studiorivelli.it' }
    ],
    send_email: true,
    email_html: '<p>upd</p>',
    email_to: 'l.rivelli@studiorivelli.it'
  }
});
assert(save[0].json.send_email === true, 'save first send_email');
assert(save[0].json.email_html === '<p>upd</p>', 'save html');
assert(save[0].json.citta === 'Roma', 'save still DT row');
assert(!Object.prototype.hasOwnProperty.call(save[0].json, 'itinerario'), 'save json is flat row');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('OK n8n-trasferta-notify');
