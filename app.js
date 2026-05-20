'use strict';

// ── DOM ──────────────────────────────────────────────────
const viewEditor    = document.getElementById('view-editor');
const viewPrompter  = document.getElementById('view-prompter');
const scriptInput   = document.getElementById('script-input');
const slFont        = document.getElementById('sl-font');
const lblFont       = document.getElementById('lbl-font');
const slSpeed       = document.getElementById('sl-speed');
const lblSpeed      = document.getElementById('lbl-speed');
const chkCamera     = document.getElementById('chk-camera');
const btnStart      = document.getElementById('btn-start');
const scrollWrap    = document.getElementById('scroll-wrap');
const scriptDisplay = document.getElementById('script-display');
const progFill      = document.getElementById('prog-fill');
const hint          = document.getElementById('hint');
const btnExit       = document.getElementById('btn-exit');
const btnPlay       = document.getElementById('btn-play');
const btnSlower     = document.getElementById('btn-slower');
const btnFaster     = document.getElementById('btn-faster');
const btnRec        = document.getElementById('btn-rec');
const camPip        = document.getElementById('cam-pip');
const camVideo      = document.getElementById('cam-video');
const recDot        = document.getElementById('rec-dot');

// ── State ────────────────────────────────────────────────
const S = {
  playing: false,
  speed: 60,
  fontSize: 48,
  wakeLock: null,
  stream: null,
  recorder: null,
  chunks: [],
  recording: false,
  rafId: null,
  lastTs: null,
  manualScrolling: false,
};

// ── Persistence ──────────────────────────────────────────
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('tp-prefs') || '{}');
    if (p.speed)    { S.speed    = p.speed;    slSpeed.value = p.speed;    lblSpeed.textContent = p.speed; }
    if (p.fontSize) { S.fontSize = p.fontSize; slFont.value  = p.fontSize; lblFont.textContent  = p.fontSize; }
    const sc = localStorage.getItem('tp-script');
    if (sc) scriptInput.value = sc;
  } catch (_) {}
}

function savePrefs() {
  localStorage.setItem('tp-prefs', JSON.stringify({ speed: S.speed, fontSize: S.fontSize }));
}

// ── Editor controls ──────────────────────────────────────
slFont.addEventListener('input', () => {
  S.fontSize = +slFont.value;
  lblFont.textContent = S.fontSize;
  savePrefs();
});

slSpeed.addEventListener('input', () => {
  S.speed = +slSpeed.value;
  lblSpeed.textContent = S.speed;
  savePrefs();
});

scriptInput.addEventListener('input', () => {
  localStorage.setItem('tp-script', scriptInput.value);
});

// ── Start ────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
  const text = scriptInput.value.trim();
  if (!text) { alert('Please enter a script first.'); return; }

  // Build display text
  scriptDisplay.style.fontSize = S.fontSize + 'px';
  scriptDisplay.innerHTML = text
    .split('\n')
    .map(l => l.trim() ? `<p>${escapeHtml(l)}</p>` : '<br>')
    .join('');

  // Switch view
  viewEditor.classList.remove('active');
  viewPrompter.classList.add('active');
  scrollWrap.scrollTop = 0;

  // Fullscreen
  try { await viewPrompter.requestFullscreen?.(); } catch (_) {}

  // Screen wake lock
  try {
    if (navigator.wakeLock) S.wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {}

  // Camera
  if (chkCamera.checked) {
    const ok = await startCamera();
    if (ok) {
      camPip.classList.remove('hidden');
      btnRec.classList.remove('hidden');
    }
  }

  hint.style.opacity = '1';
  setPlaying(false);
});

// ── Camera ───────────────────────────────────────────────
async function startCamera() {
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: true,
    });
    camVideo.srcObject = S.stream;
    makePipDraggable(camPip);
    return true;
  } catch (e) {
    alert('Camera unavailable: ' + (e.message || e));
    return false;
  }
}

function makePipDraggable(el) {
  let ox = 0, oy = 0, sx = 0, sy = 0;
  el.addEventListener('touchstart', e => {
    const r = el.getBoundingClientRect();
    ox = r.left; oy = r.top;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = (ox + dx) + 'px';
    el.style.top  = (oy + dy) + 'px';
  }, { passive: true });
}

// ── Recording ────────────────────────────────────────────
btnRec.addEventListener('click', e => {
  e.stopPropagation();
  S.recording ? stopRec() : startRec();
});

function startRec() {
  if (!S.stream) return;
  S.chunks = [];

  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const supported = mimeTypes.find(m => MediaRecorder.isTypeSupported(m));
  const opts = supported ? { mimeType: supported } : {};

  S.recorder = new MediaRecorder(S.stream, opts);
  S.recorder.ondataavailable = e => { if (e.data.size > 0) S.chunks.push(e.data); };
  S.recorder.onstop = saveRec;
  S.recorder.start(200);

  S.recording = true;
  btnRec.classList.add('recording');
  recDot.style.display = 'block';
}

function stopRec() {
  if (!S.recorder || !S.recording) return;
  S.recorder.stop();
  S.recording = false;
  btnRec.classList.remove('recording');
  recDot.style.display = 'none';
}

function saveRec() {
  const mime = S.recorder?.mimeType || 'video/webm';
  const blob = new Blob(S.chunks, { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  a.download = `teleprompter-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

// ── Scroll loop ──────────────────────────────────────────
function setPlaying(on) {
  S.playing = on;
  btnPlay.textContent = on ? '⏸︎' : '▶︎';

  if (on) {
    hint.style.opacity = '0';
    S.lastTs = null;
    S.rafId = requestAnimationFrame(tick);
  } else {
    if (S.rafId) { cancelAnimationFrame(S.rafId); S.rafId = null; }
  }
}

function tick(ts) {
  if (!S.playing) return;
  if (S.lastTs === null) S.lastTs = ts;
  const dt = Math.min((ts - S.lastTs) / 1000, 0.1); // cap at 100ms to avoid jump on tab switch
  S.lastTs = ts;

  if (!S.manualScrolling) {
    scrollWrap.scrollTop += S.speed * dt;
  }

  updateProgress();

  const max = scrollWrap.scrollHeight - scrollWrap.clientHeight;
  if (scrollWrap.scrollTop >= max - 1) {
    setPlaying(false);
    return;
  }

  S.rafId = requestAnimationFrame(tick);
}

function updateProgress() {
  const max = scrollWrap.scrollHeight - scrollWrap.clientHeight;
  const prog = max > 0 ? scrollWrap.scrollTop / max : 0;
  progFill.style.width = (prog * 100).toFixed(1) + '%';
}

// ── Control bar buttons ──────────────────────────────────
btnPlay.addEventListener('click', e => {
  e.stopPropagation();
  setPlaying(!S.playing);
});

btnExit.addEventListener('click', e => {
  e.stopPropagation();
  exitPrompter();
});

btnSlower.addEventListener('click', e => {
  e.stopPropagation();
  S.speed = Math.max(10, S.speed - 10);
  slSpeed.value = S.speed;
  lblSpeed.textContent = S.speed;
  savePrefs();
});

btnFaster.addEventListener('click', e => {
  e.stopPropagation();
  S.speed = Math.min(300, S.speed + 10);
  slSpeed.value = S.speed;
  lblSpeed.textContent = S.speed;
  savePrefs();
});

// Tap scroll area = play/pause
scrollWrap.addEventListener('click', () => {
  hint.style.opacity = '0';
  setPlaying(!S.playing);
});

// ── Touch-to-scroll (manual override) ───────────────────
let touchY0 = 0, scrollY0 = 0;

scrollWrap.addEventListener('touchstart', e => {
  touchY0  = e.touches[0].clientY;
  scrollY0 = scrollWrap.scrollTop;
  S.manualScrolling = false;
}, { passive: true });

scrollWrap.addEventListener('touchmove', e => {
  const dy = touchY0 - e.touches[0].clientY;
  if (Math.abs(dy) > 8) {
    S.manualScrolling = true;
    setPlaying(false);
    scrollWrap.scrollTop = scrollY0 + dy;
    updateProgress();
  }
}, { passive: true });

scrollWrap.addEventListener('touchend', () => {
  S.manualScrolling = false;
  updateProgress();
});

// ── Exit ────────────────────────────────────────────────
function exitPrompter() {
  setPlaying(false);
  if (S.recording) stopRec();

  S.stream?.getTracks().forEach(t => t.stop());
  S.stream = null;
  camVideo.srcObject = null;

  S.wakeLock?.release?.().catch(() => {});
  S.wakeLock = null;

  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

  viewPrompter.classList.remove('active');
  viewEditor.classList.add('active');

  camPip.classList.add('hidden');
  btnRec.classList.add('hidden');
  btnRec.classList.remove('recording');
  recDot.style.display = 'none';

  // Reset PiP position to CSS default
  camPip.style.cssText = '';
}

// Re-acquire wake lock if released (e.g. screen turned on again)
document.addEventListener('visibilitychange', async () => {
  if (S.wakeLock !== null && document.visibilityState === 'visible') {
    try { S.wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
});

// ── Util ─────────────────────────────────────────────────
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Service Worker ───────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Init ─────────────────────────────────────────────────
loadPrefs();
