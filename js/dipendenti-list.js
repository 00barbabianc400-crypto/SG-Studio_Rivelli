/**
 * Elenco dipendenti (webhook recupero-dipendenti) — parse + selezione tendina.
 */
(function (global) {
  function normEmail(v) {
    return String(v || '').trim().toLowerCase();
  }

  function parseDipendentiList(data) {
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (data && Array.isArray(data.users)) rows = data.users;
    else if (data && Array.isArray(data.dipendenti)) rows = data.dipendenti;
    else if (data && Array.isArray(data.json)) rows = data.json;

    const out = [];
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const inner = row.json && typeof row.json === 'object' ? row.json : row;
      const email = normEmail(inner.email);
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const nome = String(
        inner.dipendente || inner.Dipendenti || inner.nome || inner.nome_cognome || ''
      ).trim();
      out.push({ email, nome: nome || email });
    }
    out.sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
    return out;
  }

  function selectedDipendente(selectEl) {
    const email = normEmail(selectEl && selectEl.value);
    if (!email) return null;
    const opt = selectEl.selectedOptions && selectEl.selectedOptions[0];
    let nome = '';
    if (opt) {
      nome = String((opt.getAttribute && opt.getAttribute('data-nome')) || opt.textContent || '').trim();
    }
    return { email, nome: nome || email };
  }

  global.SRDipendenti = { parseDipendentiList, selectedDipendente };
})(typeof window !== 'undefined' ? window : globalThis);
