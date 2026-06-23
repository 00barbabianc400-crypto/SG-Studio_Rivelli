/**
 * Modulo utilizzo macchina 3008 — logica form + Google Apps Script
 */
(function () {
  const MAX_PHOTOS = 5;
  const MAX_BYTES = 10 * 1024 * 1024;
  const SCRIPT_URL = () => (window.SR_CONFIG || {}).GOOGLE_SCRIPT_URL || '';

  let step = 1;
  let photos = []; // { file, dataUrl }
  let userEmail = '';
  let userName = '';

  const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const WD = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();
  let calPickPhase = 0;
  let rangeStart = null;
  let rangeEnd = null;
  let calDrag = { active: false, anchor: null, previewTo: null };

  const $ = id => document.getElementById(id);

  function toast(msg, type) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type === 'ok' ? ' ok' : type === 'err' ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function toISO(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function fmtDateIt(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatRangeLabel(start, end) {
    if (!start) return 'Seleziona periodo prelievo e restituzione';
    if (!end || start === end) return fmtDateIt(start);
    return fmtDateIt(start) + ' → ' + fmtDateIt(end);
  }

  function syncRangeToFields() {
    if (rangeStart) $('f-prelievo').value = rangeStart;
    if (rangeEnd) $('f-restituzione').value = rangeEnd;
    $('f-range-label').textContent = formatRangeLabel(rangeStart, rangeEnd);
  }

  function loadRangeFromFields() {
    rangeStart = $('f-prelievo').value || null;
    rangeEnd = $('f-restituzione').value || rangeStart;
    if (rangeStart && rangeEnd && rangeEnd < rangeStart) {
      [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    }
  }

  function renderCalendario() {
    $('cal-month-label').textContent = MESI[calMonth] + ' ' + calYear;
    $('cal-weekdays').innerHTML = WD.map((w, i) =>
      `<span class="${i >= 5 ? 'is-weekend' : ''}">${w}</span>`).join('');

    const first = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const pad = (first.getDay() + 6) % 7;
    let html = '';
    for (let i = 0; i < pad; i++) html += '<span class="mon-cal-day is-empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toISO(calYear, calMonth, d);
      const dow = new Date(calYear, calMonth, d).getDay();
      const isWk = dow === 0 || dow === 6;
      let cls = 'mon-cal-day' + (isWk ? ' is-weekend' : '');
      if (rangeStart && rangeEnd) {
        if (iso >= rangeStart && iso <= rangeEnd) cls += ' in-range';
        if (iso === rangeStart) cls += ' range-start';
        if (iso === rangeEnd) cls += ' range-end';
      } else if (rangeStart && iso === rangeStart) {
        cls += ' range-start range-end';
      }
      html += `<button type="button" class="${cls}" data-iso="${iso}">${d}</button>`;
    }
    $('cal-grid').innerHTML = html;
  }

  function apriRangeModal() {
    loadRangeFromFields();
    const anchor = rangeStart ? new Date(rangeStart + 'T12:00:00') : new Date();
    calYear = anchor.getFullYear();
    calMonth = anchor.getMonth();
    calPickPhase = 0;
    calDrag = { active: false, anchor: null, previewTo: null };
    renderCalendario();
    $('range-backdrop').classList.add('open');
  }

  function chiudiRangeModal(apply) {
    if (apply) {
      if (!rangeStart || !rangeEnd) {
        toast('Seleziona il periodo', 'err');
        return;
      }
      syncRangeToFields();
    } else {
      loadRangeFromFields();
    }
    calDrag = { active: false, anchor: null, previewTo: null };
    $('range-backdrop').classList.remove('open');
  }

  function onCalDayClick(iso) {
    if (!rangeStart || calPickPhase === 0) {
      rangeStart = iso;
      rangeEnd = iso;
      calPickPhase = 1;
    } else {
      rangeEnd = iso;
      if (rangeEnd < rangeStart) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
      calPickPhase = 0;
    }
    renderCalendario();
  }

  function setRangeFromDrag(anchor, previewTo) {
    if (!anchor || !previewTo) return;
    rangeStart = anchor <= previewTo ? anchor : previewTo;
    rangeEnd = anchor <= previewTo ? previewTo : anchor;
    renderCalendario();
  }

  function initRangePicker() {
    $('f-range-trigger')?.addEventListener('click', () => apriRangeModal());
    $('range-cancel').addEventListener('click', () => chiudiRangeModal(false));
    $('range-applica').addEventListener('click', () => chiudiRangeModal(true));
    $('cal-prev').addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendario();
    });
    $('cal-next').addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendario();
    });

    const grid = $('cal-grid');
    grid.addEventListener('click', e => {
      if (calDrag.active) return;
      const btn = e.target.closest('[data-iso]');
      if (btn) onCalDayClick(btn.dataset.iso);
    });

    grid.addEventListener('pointerdown', e => {
      const btn = e.target.closest('[data-iso]');
      if (!btn) return;
      e.preventDefault();
      calDrag = { active: true, anchor: btn.dataset.iso, previewTo: btn.dataset.iso };
      setRangeFromDrag(calDrag.anchor, calDrag.previewTo);
      try { grid.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });

    grid.addEventListener('pointermove', e => {
      if (!calDrag.active) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const btn = el?.closest?.('[data-iso]');
      if (btn && btn.dataset.iso !== calDrag.previewTo) {
        calDrag.previewTo = btn.dataset.iso;
        setRangeFromDrag(calDrag.anchor, calDrag.previewTo);
      }
    });

    grid.addEventListener('pointerup', e => {
      if (!calDrag.active) return;
      try { grid.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      calDrag = { active: false, anchor: null, previewTo: null };
      calPickPhase = 0;
    });

    grid.addEventListener('pointercancel', () => {
      calDrag = { active: false, anchor: null, previewTo: null };
    });
  }

  function showStep(n) {
    step = n;
    document.querySelectorAll('.step-panel').forEach(p => {
      p.classList.toggle('hidden', Number(p.dataset.step) !== n);
    });
    document.querySelectorAll('.progress-step').forEach(p => {
      const s = Number(p.dataset.step);
      p.classList.toggle('is-active', s === n);
      p.classList.toggle('is-done', s < n);
    });
    $('step-label').textContent = 'Sezione ' + n + ' di 3';
    $('btn-prev').classList.toggle('hidden', n === 1);
    $('btn-next').classList.toggle('hidden', n === 3);
    $('btn-submit').classList.toggle('hidden', n !== 3);
  }

  function validateStep(n) {
    const panel = document.querySelector('.step-panel[data-step="' + n + '"]');
    const inputs = panel.querySelectorAll('input[required]');
    for (const inp of inputs) {
      if (inp.type === 'radio') {
        const name = inp.name;
        if (!panel.querySelector('input[name="' + name + '"]:checked')) {
          toast('Completa tutti i campi obbligatori', 'err');
          return false;
        }
      } else if (!inp.value.trim()) {
        inp.focus();
        toast('Completa tutti i campi obbligatori', 'err');
        return false;
      }
    }
    if (n === 1) {
      const pre = $('f-prelievo').value;
      const res = $('f-restituzione').value;
      if (!pre || !res) {
        toast('Seleziona il periodo di utilizzo', 'err');
        return false;
      }
      if (res && pre && res < pre) {
        toast('La data restituzione non può precedere il prelievo', 'err');
        return false;
      }
    }
    return true;
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function renderPhotos() {
    const grid = $('photo-grid');
    grid.innerHTML = photos.map((p, i) => `
      <div class="photo-thumb">
        <img src="${p.preview}" alt="">
        <button type="button" data-i="${i}" aria-label="Rimuovi">×</button>
      </div>
    `).join('');
    grid.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        photos.splice(Number(btn.dataset.i), 1);
        renderPhotos();
      });
    });
  }

  async function addPhotos(fileList) {
    for (const file of fileList) {
      if (photos.length >= MAX_PHOTOS) {
        toast('Massimo ' + MAX_PHOTOS + ' foto', 'err');
        break;
      }
      if (!file.type.startsWith('image/')) {
        toast(file.name + ': solo immagini', 'err');
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast(file.name + ': supera 10 MB', 'err');
        continue;
      }
      const dataUrl = await readFileAsDataURL(file);
      photos.push({ file, preview: dataUrl, dataUrl });
    }
    renderPhotos();
  }

  async function postJson(payload) {
    const url = SCRIPT_URL();
    if (!url || url.includes('INSERISCI')) {
      throw new Error('Configura GOOGLE_SCRIPT_URL in js/config.js');
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error('Risposta non valida dallo script Google');
    }
    if (!data.ok) {
      throw new Error(data.message || ('Errore server (' + resp.status + ')'));
    }
    return data;
  }

  async function uploadPhotos() {
    const urls = [];
    for (let i = 0; i < photos.length; i++) {
      toast('Upload foto ' + (i + 1) + '/' + photos.length + '…');
      const data = await postJson({
        action: 'uploadPhoto',
        photo: photos[i].dataUrl,
        email: userEmail,
        nome: userName
      });
      urls.push(data.url);
    }
    return urls;
  }

  function collectPayload(photoUrls) {
    return {
      action: 'submit',
      email: userEmail,
      nome: $('f-nome').value.trim(),
      km: $('f-km').value.trim(),
      dataPrelievo: $('f-prelievo').value,
      dataRestituzione: $('f-restituzione').value,
      carburante: document.querySelector('input[name="carburante"]:checked')?.value,
      igieniche: document.querySelector('input[name="igieniche"]:checked')?.value,
      carrozzeria: document.querySelector('input[name="carrozzeria"]:checked')?.value,
      gomme: document.querySelector('input[name="gomme"]:checked')?.value,
      interni: document.querySelector('input[name="interni"]:checked')?.value,
      photoUrls: photoUrls.length ? photoUrls.join(', ') : '—'
    };
  }

  function resetForm() {
    photos = [];
    renderPhotos();
    $('modulo-form').reset();
    $('f-nome').value = userName;
    rangeStart = rangeEnd = null;
    $('f-range-label').textContent = formatRangeLabel(null, null);
    showStep(1);
    $('form-wrap').classList.remove('hidden');
    $('success-wrap').classList.add('hidden');
  }

  async function initUser() {
    await SRAuth.init();
    if (!(await SRAuth.isMsalLoggedIn())) {
      SRAuth.redirectToLogin();
      return false;
    }
    const u = SRAuth.getUser();
    if (u && (u.name || u.email)) {
      userName = u.name || u.email;
      userEmail = u.email || '';
    } else {
      await SRAuth.ensureN8nSession().catch(() => {});
      const u2 = SRAuth.getUser();
      userName = u2?.name || u2?.email || 'Utente';
      userEmail = u2?.email || '';
    }
    $('f-nome').value = userName;
    return true;
  }

  $('btn-next').addEventListener('click', () => {
    if (!validateStep(step)) return;
    if (step < 3) showStep(step + 1);
  });

  $('btn-prev').addEventListener('click', () => {
    if (step > 1) showStep(step - 1);
  });

  $('photo-drop').addEventListener('click', () => $('photo-input').click());
  $('photo-input').addEventListener('change', e => {
    addPhotos(e.target.files);
    e.target.value = '';
  });

  $('modulo-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateStep(3)) return;

    const btn = $('btn-submit');
    btn.disabled = true;
    try {
      let urls = [];
      if (photos.length) {
        urls = await uploadPhotos();
      }
      toast('Salvataggio modulo…');
      await postJson(collectPayload(urls));
      $('form-wrap').classList.add('hidden');
      $('success-wrap').classList.remove('hidden');
      toast('Modulo inviato', 'ok');
    } catch (ex) {
      console.error(ex);
      toast(ex.message || 'Invio fallito', 'err');
    } finally {
      btn.disabled = false;
    }
  });

  $('btn-nuovo').addEventListener('click', resetForm);

  initRangePicker();
  initUser().then(ok => { if (ok) showStep(1); });
})();
