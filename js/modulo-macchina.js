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

  const $ = id => document.getElementById(id);

  function toast(msg, type) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type === 'ok' ? ' ok' : type === 'err' ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3500);
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

  initUser().then(ok => { if (ok) showStep(1); });
})();
