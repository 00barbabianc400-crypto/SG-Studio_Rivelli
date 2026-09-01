window.STCombobox = (function () {
  function normalize(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function highlight(text, query) {
    if (!query) return text;
    const idx = normalize(text).indexOf(normalize(query));
    if (idx < 0) return text;
    return text.slice(0, idx)
      + '<mark>' + text.slice(idx, idx + query.length) + '</mark>'
      + text.slice(idx + query.length);
  }

  function mount(input, dropdown, options) {
    const items = options.items || [];
    const onSelect = options.onSelect || (() => {});
    let focused = -1;

    function close() {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      focused = -1;
    }

    function open() {
      dropdown.classList.add('open');
      render(input.value);
    }

    function render(query) {
      const q = query.trim();
      const filtered = q
        ? items.filter((item) => normalize(item).includes(normalize(q)))
        : items.slice();

      dropdown.innerHTML = '';
      focused = -1;

      if (!filtered.length) {
        dropdown.innerHTML = '<div class="combo-empty">Nessuna centrale trovata</div>';
        return;
      }

      filtered.slice(0, 80).forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'combo-item';
        el.innerHTML = highlight(item, q);
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = item;
          onSelect(item);
          close();
        });
        dropdown.appendChild(el);
      });
    }

    input.addEventListener('focus', open);
    input.addEventListener('input', () => {
      open();
      onSelect('');
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('keydown', (e) => {
      const nodes = dropdown.querySelectorAll('.combo-item');
      if (!nodes.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focused = Math.min(focused + 1, nodes.length - 1);
        nodes.forEach((n, i) => n.classList.toggle('focused', i === focused));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focused = Math.max(focused - 1, 0);
        nodes.forEach((n, i) => n.classList.toggle('focused', i === focused));
      } else if (e.key === 'Enter' && focused >= 0) {
        e.preventDefault();
        input.value = nodes[focused].textContent;
        onSelect(input.value);
        close();
      } else if (e.key === 'Escape') {
        close();
      }
    });

    return { close, open };
  }

  return { mount, normalize };
})();

window.STUi = (function () {
  function showToast(message, isError) {
    let area = document.getElementById('toast-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'toast-area';
      area.className = 'toast-area';
      document.body.appendChild(area);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' toast-error' : '');
    el.textContent = message;
    area.appendChild(el);
    setTimeout(() => el.remove(), isError ? 4500 : 2600);
  }

  function setLoader(on, text) {
    let el = document.getElementById('app-loader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-loader';
      el.className = 'app-loader';
      el.innerHTML = '<div class="loader-card"><div class="loader-spin"></div><p class="loader-text"></p></div>';
      document.body.appendChild(el);
    }
    el.classList.toggle('open', on);
    const p = el.querySelector('.loader-text');
    if (p) p.textContent = text || 'Caricamento dati…';
  }

  function statusBadge(status) {
    const map = {
      completato: { cls: 'badge-ok', label: 'Completato' },
      in_scadenza: { cls: 'badge-warn', label: 'In scadenza' },
      scaduto: { cls: 'badge-over', label: 'Scaduto' },
      programmato: { cls: 'badge-plan', label: 'Programmato' },
      giorno_zero: { cls: 'badge-muted', label: 'Giorno 0' },
      in_attesa: { cls: 'badge-muted', label: 'In attesa' }
    };
    const meta = map[status] || map.in_attesa;
    return `<span class="badge ${meta.cls}"><span class="badge-dot"></span>${meta.label}</span>`;
  }

  function milestoneDot(m) {
    const titles = {
      completato: 'Completato',
      in_scadenza: 'In scadenza',
      scaduto: 'Scaduto',
      programmato: 'Programmato',
      giorno_zero: 'Giorno 0',
      in_attesa: 'In attesa'
    };
    return `<span class="ms-dot ms-dot--${m.status}" title="${m.label}: ${titles[m.status] || m.status}"></span>`;
  }

  function milestoneStrip(milestones) {
    return `<div class="ms-strip" aria-hidden="true">${
      milestones.map((m) => milestoneDot(m)).join('')
    }</div>`;
  }

  function globalBadge(stato) {
    const map = {
      attivo: { cls: 'badge-plan', label: 'Attivo' },
      in_scadenza: { cls: 'badge-warn', label: 'Attenzione' },
      scaduto: { cls: 'badge-over', label: 'Scaduto' },
      completato: { cls: 'badge-ok', label: 'Completato' },
      annullato: { cls: 'badge-muted', label: 'Annullato' }
    };
    const meta = map[stato] || map.attivo;
    return `<span class="badge ${meta.cls}"><span class="badge-dot"></span>${meta.label}</span>`;
  }

  return { showToast, setLoader, statusBadge, globalBadge, milestoneDot, milestoneStrip };
})();
