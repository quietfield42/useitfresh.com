// Use It Fresh marketing portal (16 Nov 2026).
// Upload a picture or video, write the caption, pick the time, and it goes
// straight to Metricool. Pictures are resized here, in the browser, to each
// account's size, so a wrong-sized image never gets rejected.
(() => {
  'use strict';
  const cfg = window.REVIEW_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem('uif-portal-' + k) || ''; } catch { return ''; } },
    set(k, v) { try { localStorage.setItem('uif-portal-' + k, v); } catch {} },
    del(k) { try { localStorage.removeItem('uif-portal-' + k); } catch {} },
  };

  // One tab per Use It Fresh social account.
  const ACCOUNTS = [
    { id: 'instagram', name: 'Instagram', handle: '@useitfresh', url: 'https://www.instagram.com/useitfresh/', stories: true },
    { id: 'facebook', name: 'Facebook', handle: 'Use It Fresh page', url: 'https://www.facebook.com/useitfresh', stories: true },
    { id: 'tiktok', name: 'TikTok', handle: '@useitfresh', url: 'https://www.tiktok.com/@useitfresh' },
    { id: 'threads', name: 'Threads', handle: '@useitfresh', url: 'https://www.threads.com/@useitfresh' },
    { id: 'x', name: 'X', handle: '@UseItFresh', url: 'https://x.com/UseItFresh' },
    { id: 'youtube', name: 'YouTube', handle: '@UseItFresh', url: 'https://www.youtube.com/@UseItFresh', videoOnly: true },
  ];
  const SIZE = { post: [1080, 1350], story: [1080, 1920], tiktok: [1080, 1920] };
  const CAPTION_LIMIT = { x: 280, threads: 500, tiktok: 2200, instagram: 2200, youtube: 5000, facebook: 5000 };

  let pass = store.get('pass'), name = store.get('name');
  let tab = ACCOUNTS.find((a) => '#' + a.id === location.hash) || ACCOUNTS[0];
  let type = 'post', also = new Set(), source = null, uploaded = null, busy = false, uploadToken = 0;

  async function api(action, body = {}) {
    const r = await fetch(cfg.portalEndpoint, {
      method: 'POST',
      headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, passcode: pass, ...body }),
    });
    let data = {};
    try { data = await r.json(); } catch {}
    if (!r.ok) { const e = Error(data.message || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
    return data;
  }

  // ---------- sign in ----------
  function showSignin(msg = '') {
    $('app').hidden = true; $('who').hidden = true; $('signin').hidden = false;
    $('name').value = name; $('signin-msg').textContent = msg; $('signin-msg').className = msg ? 'msg error' : '';
  }
  $('signin-form').onsubmit = async (e) => {
    e.preventDefault();
    pass = $('pass').value.trim(); name = $('name').value.trim();
    $('signin-msg').className = ''; $('signin-msg').textContent = 'Checking…';
    try {
      const hello = await api('hello');
      store.set('pass', pass); store.set('name', name);
      start(hello);
    } catch (err) { showSignin(err.message); }
  };
  $('who').onclick = () => { if (confirm('Sign out of the marketing portal on this browser?')) { store.del('pass'); pass = ''; showSignin(); } };

  function mcStatus(m) {
    const el = $('mc-status');
    if (!m) return;
    el.className = 'mc-status' + (m.connected ? ' ok' : '');
    el.textContent = m.connected ? 'Connected to Metricool (' + m.brand + '). Posts go straight into the planner.' : m.reason;
  }

  function start(hello) {
    $('signin').hidden = true; $('app').hidden = false; $('who').hidden = false;
    $('who').textContent = name + ' · sign out';
    mcStatus(hello?.metricool);
    renderTabs(); selectTab(tab);
  }

  // ---------- tabs ----------
  function renderTabs() {
    $('tabs').innerHTML = ACCOUNTS.map((a) => `<button class="tab" role="tab" data-acc="${a.id}" aria-selected="${a === tab}"><b>${a.name}</b><small>${esc(a.handle)}</small></button>`).join('');
    $('tabs').querySelectorAll('[data-acc]').forEach((b) => b.onclick = () => selectTab(ACCOUNTS.find((a) => a.id === b.dataset.acc)));
  }
  function selectTab(a) {
    if (busy) return;
    tab = a; history.replaceState(null, '', '#' + a.id);
    $('tabs').querySelectorAll('[data-acc]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.acc === a.id)));
    $('composer-title').innerHTML = `New post for <a href="${a.url}" target="_blank" rel="noopener">${a.name} ${esc(a.handle)}</a>`;
    $('list-title').textContent = 'Sent to ' + a.name;
    also = new Set();
    type = 'post';
    renderComposer();
    loadList();
  }

  function isVideo() { return source?.kind === 'video'; }
  function targetSize() {
    if (type === 'story') return SIZE.story;
    if (tab.id === 'tiktok') return SIZE.tiktok;
    return SIZE.post;
  }
  function chosen() { return [tab.id, ...also]; }

  function renderComposer() {
    const [w, h] = targetSize();
    $('drop-sub').textContent = tab.videoOnly
      ? 'Video (MP4 or MOV, up to 50 MB). Vertical 1080 × 1920 is best for Shorts.'
      : `Picture (any size, we resize it to ${w} × ${h}) or video (MP4 or MOV, up to 50 MB)`;
    $('type-row').hidden = !tab.stories;
    document.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    $('title-row').hidden = !chosen().includes('youtube');
    $('also').innerHTML = ACCOUNTS.filter((a) => a !== tab).map((a) => {
      const off = a.videoOnly && source && !isVideo();
      return `<button type="button" class="chip" data-also="${a.id}" aria-pressed="${also.has(a.id)}" ${off ? 'disabled title="YouTube takes videos only"' : ''}>${a.name}</button>`;
    }).join('');
    $('also').querySelectorAll('[data-also]').forEach((b) => b.onclick = () => {
      const id = b.dataset.also; also.has(id) ? also.delete(id) : also.add(id); renderComposer();
    });
    captionCount();
    const ready = !!uploaded && !busy;
    $('send').disabled = !ready;
    $('send').textContent = chosen().length > 1 ? `Send to Metricool (${chosen().length} accounts)` : 'Send to Metricool';
  }
  document.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => {
    if (type === b.dataset.type) return;
    type = b.dataset.type; renderComposer();
    if (source && source.kind === 'image') prepareImage(); // re-crop for the new size
  });

  function captionCount() {
    const len = $('caption').value.length;
    const limits = chosen().map((a) => [a, CAPTION_LIMIT[a]]).filter(([, l]) => len > l);
    const el = $('caption-count');
    el.textContent = limits.length ? `${len} characters: too long for ${limits.map(([a, l]) => ACCOUNTS.find((x) => x.id === a).name + ' (' + l + ')').join(', ')}` : `${len} characters`;
    el.style.color = limits.length ? 'var(--red)' : '';
  }
  $('caption').oninput = captionCount;

  // ---------- time ----------
  function sydneyParts(d) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const g = (t) => p.find((x) => x.type === t).value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
  }
  // Sydney wall-clock date + time -> real instant (handles daylight saving).
  function fromSydney(date, time) {
    if (!date || !time) return null;
    const guess = new Date(`${date}T${time}:00Z`);
    for (let i = 0; i < 3; i++) {
      const s = sydneyParts(guess);
      const diff = new Date(`${s.date}T${s.time}:00Z`) - new Date(`${date}T${time}:00Z`);
      if (!diff) break;
      guess.setTime(guess.getTime() - diff);
    }
    return guess;
  }
  function quick(hour) {
    const now = Date.now();
    let d = new Date(now);
    for (let i = 0; i < 3; i++) {
      const s = sydneyParts(d);
      const at = fromSydney(s.date, String(hour).padStart(2, '0') + ':00');
      if (at.getTime() > now + 10 * 60000) { $('date').value = s.date; $('time').value = String(hour).padStart(2, '0') + ':00'; return; }
      d = new Date(d.getTime() + 86400000);
    }
  }
  document.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => quick(Number(b.dataset.quick)));

  // ---------- file handling ----------
  $('file').onchange = () => { const f = $('file').files[0]; if (f) pick(f); };
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pick(f); });
  $('change-file').onclick = () => { if (busy) return; $('file').value = ''; $('file').click(); };

  function showMsg(text, kind = '') { $('send-msg').textContent = text; $('send-msg').className = 'msg ' + kind; }

  async function pick(file) {
    if (busy) return;
    showMsg('');
    uploaded = null; source = null; renderComposer();
    const video = file.type.startsWith('video/') || /\.(mp4|mov)$/i.test(file.name);
    if (video) {
      if (file.size > 50 * 1024 * 1024) return showMsg(`This video is ${(file.size / 1048576).toFixed(0)} MB. Videos must be under 50 MB: export it smaller and try again.`, 'error');
      const mime = file.type === 'video/quicktime' || /\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4';
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.src = url; v.muted = true; v.playsInline = true; v.controls = true; v.preload = 'metadata';
      await new Promise((res) => { v.onloadedmetadata = res; v.onerror = res; setTimeout(res, 4000); });
      source = { kind: 'video', blob: file, mime, width: v.videoWidth || null, height: v.videoHeight || null };
      $('preview-media').replaceChildren(v);
      $('preview').hidden = false; $('drop').hidden = true;
      const dims = source.width ? `${source.width} × ${source.height}, ` : '';
      $('preview-note').textContent = `Video: ${dims}${(file.size / 1048576).toFixed(1)} MB.`;
      renderComposer();
      return upload();
    }
    if (tab.videoOnly) return showMsg('YouTube takes videos only. Choose a video, or pick another tab for pictures.', 'error');
    let img;
    try { img = await loadImage(file); } catch {
      return showMsg("This picture can't be read here. Save it as a JPG or PNG and upload that.", 'error');
    }
    source = { kind: 'image', img, original: `${img.naturalWidth} × ${img.naturalHeight}` };
    $('preview').hidden = false; $('drop').hidden = true;
    renderComposer();
    prepareImage();
  }

  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => { URL.revokeObjectURL(url); rej(Error('decode')); };
      img.src = url;
    });
  }

  // Resize to the account's exact size. Close ratios are trimmed slightly;
  // anything else is fitted whole onto a soft blurred copy of itself.
  async function prepareImage() {
    const [w, h] = targetSize();
    const img = source.img, iw = img.naturalWidth, ih = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    const ratio = (iw / ih) / (w / h);
    let note;
    if (Math.abs(ratio - 1) <= 0.08) {
      const s = Math.max(w / iw, h / ih);
      ctx.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
      note = Math.abs(ratio - 1) < 0.005 ? 'sized' : 'sized (edges trimmed a little)';
    } else {
      if ('filter' in ctx) {
        const s = Math.max(w / iw, h / ih);
        ctx.filter = 'blur(40px) brightness(1.05)';
        ctx.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
        ctx.filter = 'none';
      }
      const s = Math.min(w / iw, h / ih);
      ctx.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
      note = 'fitted whole, with a soft background filling the gaps';
    }
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return showMsg("This picture couldn't be prepared. Try a JPG or PNG.", 'error');
    source.blob = blob; source.mime = 'image/jpeg'; source.width = w; source.height = h;
    const shown = new Image(); shown.src = URL.createObjectURL(blob); shown.alt = 'Picture as it will be posted';
    $('preview-media').replaceChildren(shown);
    $('preview-note').textContent = `Your picture (${source.original}) is ${note} to ${w} × ${h}, the size ${type === 'story' ? 'Stories' : tab.name} needs. ${blob.size < 1048576 ? Math.round(blob.size / 1024) + ' KB' : (blob.size / 1048576).toFixed(1) + ' MB'}.`;
    upload();
  }

  function upload() {
    const token = ++uploadToken;
    uploaded = null; busy = true; renderComposer();
    $('bar').hidden = false; $('bar-fill').style.width = '2%';
    showMsg('Uploading…');
    return (async () => {
      try {
        const slot = await api('upload_url', { mime_type: source.mime, byte_size: source.blob.size });
        await new Promise((res, rej) => {
          const x = new XMLHttpRequest();
          x.open('PUT', slot.upload_url);
          x.setRequestHeader('Content-Type', source.mime);
          x.setRequestHeader('x-upsert', 'false');
          x.upload.onprogress = (e) => { if (e.lengthComputable) $('bar-fill').style.width = Math.max(2, e.loaded / e.total * 100) + '%'; };
          x.onload = () => x.status >= 200 && x.status < 300 ? res() : rej(Error('upload ' + x.status));
          x.onerror = () => rej(Error('network'));
          x.send(source.blob);
        });
        if (token !== uploadToken) return;
        uploaded = { path: slot.path, url: slot.public_url, mime: source.mime, width: source.width, height: source.height };
        $('bar-fill').style.width = '100%'; setTimeout(() => { $('bar').hidden = true; }, 600);
        showMsg('Uploaded. Add the caption and time, then press Send to Metricool.', 'ok');
      } catch (err) {
        if (token !== uploadToken) return;
        if (err.status === 403) return showSignin('Your passcode has changed. Enter the new one.');
        showMsg((err.message.startsWith('upload') || err.message === 'network' ? 'The upload didn\'t finish. Check your connection and choose the file again.' : err.message), 'error');
      } finally {
        if (token === uploadToken) { busy = false; renderComposer(); }
      }
    })();
  }

  function resetComposer() {
    source = null; uploaded = null; uploadToken++;
    $('file').value = ''; $('preview').hidden = true; $('drop').hidden = false; $('bar').hidden = true;
    $('caption').value = ''; $('title').value = '';
    also = new Set(); type = 'post';
    renderComposer();
  }

  // ---------- send ----------
  $('send').onclick = async () => {
    if (busy || !uploaded) return;
    const at = fromSydney($('date').value, $('time').value);
    if (!at) return showMsg('Pick the date and time it should post.', 'error');
    if (at.getTime() < Date.now() + 5 * 60000) return showMsg('Pick a time at least 5 minutes from now.', 'error');
    const accounts = chosen();
    if (accounts.includes('youtube') && !isVideo()) return showMsg('YouTube takes videos only. Untick YouTube.', 'error');
    if (accounts.includes('youtube') && !$('title').value.trim()) return showMsg('Add a YouTube title.', 'error');
    if (!$('caption').value.trim() && !confirm('Send without a caption?')) return;
    busy = true; renderComposer(); showMsg('Sending to Metricool…');
    try {
      const types = Object.fromEntries(accounts.map((a) => [a, type]));
      const res = await api('create', {
        uploaded_by: name, accounts, post_types: types, caption: $('caption').value, title: $('title').value.trim(),
        publish_at: at.toISOString(), media_path: uploaded.path, media_type: uploaded.mime, width: uploaded.width, height: uploaded.height,
      });
      mcStatus(res.metricool);
      const rows = res.rows || [];
      const ok = rows.filter((r) => r.status === 'in_metricool').length;
      const failed = rows.filter((r) => r.status === 'failed');
      const when = at.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      if (failed.length) showMsg(`Saved, but ${failed.length} didn't go into Metricool: ${failed[0].error}`, 'error');
      else if (ok === rows.length) showMsg(`Done. In Metricool for ${when} Sydney time.`, 'ok');
      else showMsg(`Saved for ${when} Sydney time. It goes into Metricool as soon as Metricool is connected.`, 'ok');
      resetComposer();
    } catch (err) {
      if (err.status === 403) return showSignin('Your passcode has changed. Enter the new one.');
      showMsg(err.message, 'error');
    } finally { busy = false; renderComposer(); loadList(); }
  };

  // ---------- list ----------
  const LABEL = { in_metricool: 'In Metricool', waiting: 'Waiting for Metricool', sending: 'Sending', failed: "Didn't go through" };
  async function loadList() {
    const acc = tab.id;
    try {
      const res = await api('list', { account: acc });
      if (acc !== tab.id) return;
      mcStatus(res.metricool);
      const rows = res.rows || [];
      if (!rows.length) { $('list').innerHTML = '<p class="muted">Nothing sent to this account from here yet.</p>'; return; }
      $('list').innerHTML = rows.map((r) => {
        const media = (r.media_type || '').startsWith('video/') ? `<video src="${esc(r.media_url)}" muted preload="metadata"></video>` : `<img src="${esc(r.media_url)}" alt="" loading="lazy">`;
        const when = new Date(r.publish_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
        const kind = { story: 'Story', reel: 'Reel', short: 'Short', video: 'Video', post: 'Post' }[r.post_type] || 'Post';
        return `<div class="item" data-id="${r.id}">${media}<div>
          <p><span class="badge ${r.status}">${LABEL[r.status] || r.status}</span><span class="meta">${kind} · goes out ${esc(when)} · by ${esc(r.uploaded_by)}</span></p>
          <p class="cap">${esc(r.caption || '(no caption)')}</p>
          ${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
          <div class="actions">
            ${r.status === 'failed' ? `<input type="date" class="rd"><input type="time" class="rt" step="300"><button type="button" class="retry">Try again</button>` : ''}
            ${r.status !== 'sending' ? `<button type="button" class="remove">${r.status === 'in_metricool' ? 'Remove from Metricool' : 'Remove'}</button>` : ''}
          </div></div></div>`;
      }).join('');
      $('list').querySelectorAll('.item').forEach((el) => {
        const id = el.dataset.id;
        el.querySelector('.remove')?.addEventListener('click', async () => {
          if (!confirm('Remove this post? If it is in Metricool, it is deleted there too.')) return;
          try { await api('remove', { id }); loadList(); } catch (err) { alert(err.message); }
        });
        el.querySelector('.retry')?.addEventListener('click', async () => {
          const at = fromSydney(el.querySelector('.rd').value, el.querySelector('.rt').value);
          if (!at) return alert('Pick a new date and time first.');
          try { await api('retry', { id, publish_at: at.toISOString() }); loadList(); } catch (err) { alert(err.message); }
        });
      });
    } catch (err) {
      if (err.status === 403) return showSignin('Enter the team passcode.');
      $('list').innerHTML = `<p class="err">${esc(err.message)}</p>`;
    }
  }

  // ---------- go ----------
  quick(Number(sydneyParts(new Date()).time.slice(0, 2)) < 18 ? 20 : 8);
  if (!pass) showSignin();
  else api('hello').then(start).catch((err) => showSignin(err.status === 403 ? 'Enter the team passcode.' : err.message));
  window.addEventListener('focus', () => { if (!$('app').hidden && !busy) loadList(); });
})();
