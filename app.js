'use strict';

// ── DOM ──────────────────────────────────────────────────
const viewEditor     = document.getElementById('view-editor');
const viewPrompter   = document.getElementById('view-prompter');
const scriptInput    = document.getElementById('script-input');
const slFont         = document.getElementById('sl-font');
const lblFont        = document.getElementById('lbl-font');
const slSpeed        = document.getElementById('sl-speed');
const lblSpeed       = document.getElementById('lbl-speed');
const chkCamera      = document.getElementById('chk-camera');
const btnStart       = document.getElementById('btn-start');
const scrollWrap     = document.getElementById('scroll-wrap');
const scriptDisplay  = document.getElementById('script-display');
const progFill       = document.getElementById('prog-fill');
const hint           = document.getElementById('hint');
const btnExit        = document.getElementById('btn-exit');
const btnPlay        = document.getElementById('btn-play');
const btnSlower      = document.getElementById('btn-slower');
const btnFaster      = document.getElementById('btn-faster');
const btnRec         = document.getElementById('btn-rec');
const camPip         = document.getElementById('cam-pip');
const camVideo       = document.getElementById('cam-video');
const recDot         = document.getElementById('rec-dot');
const btnImportLocal = document.getElementById('btn-import-local');
const fileInput      = document.getElementById('file-input');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMsg     = document.getElementById('loading-msg');

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
  S.fontSize = +slFont.value; lblFont.textContent = S.fontSize; savePrefs();
});
slSpeed.addEventListener('input', () => {
  S.speed = +slSpeed.value; lblSpeed.textContent = S.speed; savePrefs();
});
scriptInput.addEventListener('input', () => {
  localStorage.setItem('tp-script', scriptInput.value);
});

// ── Loading overlay ──────────────────────────────────────
function showLoading(msg = 'Loading…') {
  loadingMsg.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}
function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// ════════════════════════════════════════════════════════
//  FILE IMPORT
// ════════════════════════════════════════════════════════

btnImportLocal.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;

  showLoading('Reading file…');
  try {
    const name = file.name.toLowerCase();
    const text = (name.endsWith('.docx') || name.endsWith('.doc'))
      ? await readDocx(file)
      : await file.text();
    scriptInput.value = text;
    localStorage.setItem('tp-script', text);
  } catch (e) {
    alert('Could not read file: ' + e.message);
  } finally {
    hideLoading();
  }
});

// ── DOCX extractor (no external library) ─────────────────
async function readDocx(file) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Your browser cannot decompress DOCX files. Please save your script as a .txt file instead.');
  }
  const buf = await file.arrayBuffer();
  const xml = await extractZipEntry(new Uint8Array(buf), 'word/document.xml');
  return parseDocumentXml(xml);
}

// Uses the ZIP central directory to jump directly to the target file.
async function extractZipEntry(bytes, target) {
  const u32 = o => (bytes[o] | bytes[o+1]<<8 | bytes[o+2]<<16 | bytes[o+3]<<24) >>> 0;
  const u16 = o => bytes[o] | bytes[o+1]<<8;

  // Find End of Central Directory record (near end of file)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP / DOCX file.');

  const cdCount  = u16(eocd + 10);
  const cdOffset = u32(eocd + 16);

  let off = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (u32(off) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.');
    const method     = u16(off + 10);
    const compSize   = u32(off + 20);
    const nameLen    = u16(off + 28);
    const extraLen   = u16(off + 30);
    const commentLen = u16(off + 32);
    const localOff   = u32(off + 42);
    const name       = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));

    if (name === target) {
      const localExtraLen = u16(localOff + 28);
      const dataStart     = localOff + 30 + nameLen + localExtraLen;
      const data          = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return new TextDecoder().decode(data);
      if (method === 8) return new TextDecoder().decode(await inflateRaw(data));
      throw new Error('Unsupported ZIP compression method: ' + method);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('word/document.xml not found — is this a valid DOCX file?');
}

async function inflateRaw(compressed) {
  const ds  = new DecompressionStream('deflate-raw');
  const src = new Blob([compressed]).stream().pipeThrough(ds);
  const buf = await new Response(src).arrayBuffer();
  return new Uint8Array(buf);
}

function parseDocumentXml(xml) {
  const doc   = new DOMParser().parseFromString(xml, 'text/xml');
  const lines = [];
  doc.querySelectorAll('p').forEach(p => {
    const parts = [];
    p.querySelectorAll('t, br').forEach(n => {
      if (n.localName === 't') parts.push(n.textContent);
      else if (n.localName === 'br') parts.push('\n');
    });
    const line = parts.join('').trim();
    if (line) lines.push(line);
  });
  return lines.join('\n');
}

// ════════════════════════════════════════════════════════
//  START PROMPTER
// ════════════════════════════════════════════════════════

btnStart.addEventListener('click', async () => {
  const text = scriptInput.value.trim();
  if (!text) { alert('Please enter a script first.'); return; }

  scriptDisplay.style.fontSize = S.fontSize + 'px';
  scriptDisplay.innerHTML = text
    .split('\n')
    .map(l => l.trim() ? `<p>${escapeHtml(l)}</p>` : '<br>')
    .join('');

  viewEditor.classList.remove('active');
  viewPrompter.classList.add('active');
  scrollWrap.scrollTop = 0;

  try { await viewPrompter.requestFullscreen?.(); } catch (_) {}
  try { if (navigator.wakeLock) S.wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}

  if (chkCamera.checked) {
    const ok = await startCamera();
    if (ok) { camPip.classList.remove('hidden'); btnRec.classList.remove('hidden'); }
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
    ox = r.left; oy = r.top; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = (ox + dx) + 'px'; el.style.top = (oy + dy) + 'px';
  }, { passive: true });
}

// ── Recording ────────────────────────────────────────────
btnRec.addEventListener('click', e => { e.stopPropagation(); S.recording ? stopRec() : startRec(); });

function startRec() {
  if (!S.stream) return;
  S.chunks = [];
  const mimes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mime  = mimes.find(m => MediaRecorder.isTypeSupported(m));
  S.recorder = new MediaRecorder(S.stream, mime ? { mimeType: mime } : {});
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
  a.download = `teleprompter-${Date.now()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
  const dt = Math.min((ts - S.lastTs) / 1000, 0.1);
  S.lastTs = ts;
  if (!S.manualScrolling) scrollWrap.scrollTop += S.speed * dt;
  updateProgress();
  const max = scrollWrap.scrollHeight - scrollWrap.clientHeight;
  if (scrollWrap.scrollTop >= max - 1) { setPlaying(false); return; }
  S.rafId = requestAnimationFrame(tick);
}

function updateProgress() {
  const max = scrollWrap.scrollHeight - scrollWrap.clientHeight;
  progFill.style.width = (max > 0 ? (scrollWrap.scrollTop / max) * 100 : 0).toFixed(1) + '%';
}

// ── Control bar ──────────────────────────────────────────
btnPlay.addEventListener('click',   e => { e.stopPropagation(); setPlaying(!S.playing); });
btnExit.addEventListener('click',   e => { e.stopPropagation(); exitPrompter(); });
btnSlower.addEventListener('click', e => {
  e.stopPropagation();
  S.speed = Math.max(10, S.speed - 10); slSpeed.value = S.speed; lblSpeed.textContent = S.speed; savePrefs();
});
btnFaster.addEventListener('click', e => {
  e.stopPropagation();
  S.speed = Math.min(300, S.speed + 10); slSpeed.value = S.speed; lblSpeed.textContent = S.speed; savePrefs();
});
scrollWrap.addEventListener('click', () => { hint.style.opacity = '0'; setPlaying(!S.playing); });

// ── Touch-scroll override ────────────────────────────────
let touchY0 = 0, scrollY0 = 0;
scrollWrap.addEventListener('touchstart', e => {
  touchY0 = e.touches[0].clientY; scrollY0 = scrollWrap.scrollTop; S.manualScrolling = false;
}, { passive: true });
scrollWrap.addEventListener('touchmove', e => {
  const dy = touchY0 - e.touches[0].clientY;
  if (Math.abs(dy) > 8) {
    S.manualScrolling = true; setPlaying(false);
    scrollWrap.scrollTop = scrollY0 + dy; updateProgress();
  }
}, { passive: true });
scrollWrap.addEventListener('touchend', () => { S.manualScrolling = false; updateProgress(); });

// ── Exit ────────────────────────────────────────────────
function exitPrompter() {
  setPlaying(false);
  if (S.recording) stopRec();
  S.stream?.getTracks().forEach(t => t.stop());
  S.stream = null; camVideo.srcObject = null;
  S.wakeLock?.release?.().catch(() => {});
  S.wakeLock = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  viewPrompter.classList.remove('active');
  viewEditor.classList.add('active');
  camPip.classList.add('hidden');
  btnRec.classList.add('hidden');
  btnRec.classList.remove('recording');
  recDot.style.display = 'none';
  camPip.style.cssText = '';
}

document.addEventListener('visibilitychange', async () => {
  if (S.wakeLock !== null && document.visibilityState === 'visible') {
    try { S.wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
});

// ── Util ─────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Service Worker ───────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

loadPrefs();
