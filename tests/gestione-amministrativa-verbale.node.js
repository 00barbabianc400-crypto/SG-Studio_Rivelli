const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'gestione-amministrativa.html'), 'utf8');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL', msg);
  }
}

assert(/\.soft-btn\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(html),
  'hidden su soft-btn non deve essere sovrascritto da display:inline-flex');
assert(html.includes('id="detail-print-verbale"'), 'bottone verbale nel footer comune');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('OK gestione-amministrativa-verbale');
