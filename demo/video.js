// Deterministic timeline for the Orbital demo. renderFrame(t) draws the frame at time t (seconds).
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const backOut = (x) => { x = clamp(x); const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const prog = (t, start, dur) => clamp((t - start) / dur);
const lerp = (a, b, k) => a + (b - a) * k;
const mbText = (b) => (b < 1e6 ? `${Math.round(b / 1e3)} KB` : `${(b / 1e6).toFixed(1)} MB`);
const secs = (s) => (s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`);
const fadeWin = (t, a, b, d = 0.35) => easeOut(prog(t, a, d)) * (1 - easeOut(prog(t, b - d, d)));
function style(el, { o, x = 0, y = 0, s = 1, r = 0 } = {}) {
  if (o != null) el.style.opacity = o;
  el.style.transform = `translate(${x}px, ${y}px) scale(${s})${r ? ` rotate(${r}deg)` : ''}`;
}

// ---------- scene timing ----------
const T = {
  hook: [0, 3.3],
  desk: [3.2, 13.6],
  types: [13.5, 32.4],
  keys: [32.3, 37.2],
  editors: [37.1, 41.6],
  details: [41.5, 46.0],
  close: [45.9, 51.0],
};
const DURATION = 51.0;
window.DURATION = DURATION;

// ---------- picker (the real overlay in an iframe) ----------
const pickerFrame = $('picker');
const pw = () => pickerFrame.contentWindow;
const pickerState = { cx: 540, cy: 640, s: 1, o: 0 };
function pickerShow(key, { hint = false } = {}) {
  const d = DATA.info[key];
  pw().document.body.classList.toggle('show-hint', hint);
  pw().emitShow({ mode: 'menu', files: [d.name], menu: d.menu, theme: { accent: null } });
  pw().emitInfo({ thumb: d.thumb, name: d.name, detail: d.detail });
}
const pickerEval = (code) => pw().eval(`${code}; paint();`);
const pickerReset = () => pw().eval('reset()');
function placePicker() {
  const { cx, cy, s, o } = pickerState;
  pickerFrame.style.opacity = o;
  pickerFrame.style.transform = `translate(${cx - 320 * s}px, ${cy - 320 * s}px) scale(${s})`;
}

// Overlay geometry mirrored from overlay.js, to aim the cursor at real wedges.
const CAT_R = 116;
const ACT_R = 216;
function wedgePoint(menu, catIdx, itemIdx) {
  const span = 360 / menu.length;
  const catAngle = catIdx * span;
  let r = CAT_R; let a = catAngle;
  if (itemIdx != null) {
    const n = menu[catIdx].items.length;
    const seg = Math.min(28, 360 / n);
    a = catAngle - (seg * n) / 2 + seg * (itemIdx + 0.5);
    r = ACT_R;
  }
  const rad = (a * Math.PI) / 180;
  return [320 + r * Math.sin(rad), 320 - r * Math.cos(rad)];
}
const toPage = ([x, y]) => [pickerState.cx + (x - 320) * pickerState.s, pickerState.cy + (y - 320) * pickerState.s];
const idx = (key, catId, actionId) => {
  const menu = DATA.info[key].menu;
  const c = menu.findIndex((m) => m.id === catId);
  return { menu, c, i: actionId ? menu[c].items.findIndex((it) => it.id === actionId) : null };
};

// ---------- cursor ----------
const cursor = $('cursor');
function placeCursor(x, y, o = 1) {
  cursor.style.opacity = o;
  cursor.style.transform = `translate(${x - 6}px, ${y - 3}px)`;
}
// Smooth path through waypoints [{t, x, y}]
function pathAt(points, t) {
  if (t <= points[0].t) return [points[0].x, points[0].y];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]; const b = points[k];
    if (t <= b.t) {
      const e = easeInOut((t - a.t) / (b.t - a.t));
      return [lerp(a.x, b.x, e), lerp(a.y, b.y, e)];
    }
  }
  const last = points[points.length - 1];
  return [last.x, last.y];
}

// ---------- one-shot events ----------
const events = [];
const at = (t, fn) => events.push({ t, fn, done: false });
function runEvents(t) {
  for (const e of events) if (!e.done && t >= e.t) { e.done = true; e.fn(); }
}

// ---------- setup ----------
const FILES = [
  ['blueMarble', 'out/media/blue-marble.jpg', 'Blue Marble.jpg'],
  ['earthset', 'out/media/earthset.jpg', 'Earthset from Orion.jpg'],
  ['cliffs', 'out/media/cliffs.jpg', 'Cosmic Cliffs.jpg'],
  ['launch', 'out/media/launch-frame.jpg', 'Artemis I Launch.mp4', '1:56'],
  ['presskit', 'out/media/presskit-01.jpg', 'Artemis I Press Kit.pdf'],
  ['wbs', 'out/media/wbs-1.jpg', 'WBS Handbook.docx'],
  ['audio', null, 'Mars Habitat Audio Log.mp3'],
];
$('grid').innerHTML = FILES.map(([key, src, name, badge]) => `
  <div class="file" data-key="${key}">
    <div class="ic">${src ? `<img src="${src}" alt="">` : '<div class="wave"><img src="out/media/wave.png" alt=""></div>'}${badge ? `<span class="badge">${badge}</span>` : ''}</div>
    <div class="name">${name}</div>
  </div>`).join('');

// ---------- scene 2: desktop ----------
const DESK = { drop: [540, 830], pickerScale: 1.5 };
let deskPath = null;
function buildDeskPath() {
  const r = document.querySelector('.file[data-key="blueMarble"] .ic').getBoundingClientRect();
  const fileX = r.left + r.width / 2; const fileY = r.top + r.height / 2;
  pickerState.cx = DESK.drop[0]; pickerState.cy = DESK.drop[1]; pickerState.s = DESK.pickerScale;
  const conv = idx('blueMarble', 'convert', 'img.to.webp');
  const avif = idx('blueMarble', 'convert', 'img.to.avif');
  const resize = idx('blueMarble', 'resize');
  const r1920 = idx('blueMarble', 'resize', 'img.resize.w1920');
  const P = (p) => toPage(p);
  const [wx, wy] = P(wedgePoint(conv.menu, conv.c, conv.i));
  const [ax, ay] = P(wedgePoint(avif.menu, avif.c, avif.i));
  const [rx, ry] = P(wedgePoint(resize.menu, resize.c));
  const [tx, ty] = P(wedgePoint(r1920.menu, r1920.c, r1920.i));
  deskPath = {
    points: [
      { t: 3.5, x: 930, y: 1180 }, { t: 4.4, x: fileX, y: fileY },
      { t: 4.9, x: fileX, y: fileY }, { t: 5.8, x: DESK.drop[0], y: DESK.drop[1] },
      { t: 6.2, x: DESK.drop[0], y: DESK.drop[1] }, { t: 6.8, x: wx, y: wy },
      { t: 7.2, x: wx, y: wy }, { t: 7.6, x: ax, y: ay },
      { t: 8.0, x: ax, y: ay }, { t: 8.5, x: rx, y: ry },
      { t: 8.7, x: rx, y: ry }, { t: 9.2, x: tx, y: ty },
    ],
    idx: { conv, avif, resize, r1920 },
  };
  const { conv: c1, avif: c2, resize: c3, r1920: c4 } = deskPath.idx;
  at(5.5, () => pickerShow('blueMarble'));
  at(6.75, () => pickerEval(`state.cat=${c1.c}; state.hover=${c1.i}`));
  at(7.55, () => pickerEval(`state.hover=${c2.i}`));
  at(8.45, () => pickerEval(`state.cat=${c3.c}; state.hover=-1`));
  at(9.15, () => pickerEval(`state.hover=${c4.i}`));
  at(10.05, () => pickerReset());
}

function renderDesk(t) {
  const [a, b] = T.desk;
  const L = $('desk');
  L.style.opacity = fadeWin(t, a, b);
  const head = t < 6.3 ? 'Hold Shift and drag any file' : t < 9.9 ? 'Pick an action from the ring' : 'Done. Saved next to the original.';
  const headEl = $('desk-head');
  if (headEl.textContent !== head) headEl.textContent = head;
  const swap = [a + 0.1, 6.3, 9.9].reduce((m, s) => (t >= s ? s : m), a);
  style(headEl, { o: easeOut(prog(t, swap, 0.4)), y: (1 - easeOut(prog(t, swap, 0.4))) * 16 });
  style($('screen'), { s: lerp(0.96, 1, easeOut(prog(t, a, 0.6))) });

  // File selection + drag ghost
  document.querySelector('.file[data-key="blueMarble"]').classList.toggle('sel', t >= 4.45 && t < 10);
  const [cx, cy] = pathAt(deskPath.points, t);
  const dragging = t >= 4.9 && t < 9.9;
  const ghost = $('ghost');
  const sr = $('screen').getBoundingClientRect();
  ghost.style.opacity = dragging ? 0.92 * easeOut(prog(t, 4.9, 0.25)) : t >= 9.9 ? 0.92 * (1 - easeOut(prog(t, 9.9, 0.25))) : 0;
  ghost.style.transform = `translate(${cx - sr.left + 14}px, ${cy - sr.top + 12}px) rotate(-4deg) scale(${t >= 9.9 ? 1 - 0.4 * prog(t, 9.9, 0.25) : 1})`;
  placeCursor(cx, cy, fadeWin(t, 3.4, 10.6, 0.3));

  // Shift key
  const key = $('shiftkey');
  key.classList.toggle('pressed', t >= 4.6 && t < 9.9);
  key.style.opacity = fadeWin(t, 4.5, 10.2, 0.3);

  // Picker: fades out on drop
  if (t >= a && t < b) {
    pickerState.cx = DESK.drop[0]; pickerState.cy = DESK.drop[1]; pickerState.s = DESK.pickerScale;
    pickerState.o = t >= 5.5 && t < 10.05 ? 1 - easeOut(prog(t, 9.85, 0.2)) : 0;
  }

  // Notification + result
  const ds = $('deskstat');
  const dk = backOut(prog(t, 10.35, 0.6));
  ds.style.opacity = easeOut(prog(t, 10.35, 0.3)) * (1 - easeOut(prog(t, 13.0, 0.3)));
  ds.style.transform = `translateY(${(1 - dk) * 50}px) scale(${lerp(0.9, 1, dk)})`;
  const n = $('notif');
  const k = easeOut(prog(t, 10.1, 0.45));
  n.style.opacity = k * (1 - easeOut(prog(t, 13.1, 0.3)));
  n.style.transform = `translateX(${(1 - k) * 60}px)`;
}

// ---------- scene 3: file types ----------
const TYPES = [
  { key: 'earthset', cat: 'crop', action: 'img.crop.4:5', eyebrow: 'Images', head: 'Convert, compress, smart-crop.',
    chips: ['PNG', 'JPG', 'WebP', 'AVIF', 'HEIC', 'GIF', 'TIFF', 'ICO', 'PDF'] },
  { key: 'launch', cat: 'compress', action: 'vid.compress.25mb', eyebrow: 'Video', head: 'Shrink, trim, convert.',
    chips: ['MP4', 'HEVC', 'MOV', 'WebM', 'MKV', 'AVI', 'GIF', '4K → 720p'] },
  { key: 'audio', cat: 'compress', action: 'aud.compress.voice', eyebrow: 'Audio', head: 'Clean up any recording.',
    chips: ['MP3', 'M4A', 'WAV', 'FLAC', 'OGG', 'Opus', 'Normalize', 'Cut silence'] },
  { key: 'presskit', cat: 'export', action: 'pdf.png', eyebrow: 'PDF', head: 'Merge, split, export pages.',
    chips: ['Merge', 'Split', 'Compress', 'Rotate', '→ PNG', '→ JPG', '→ Text'] },
  { key: 'wbs', cat: 'convert', action: 'doc.pdf', eyebrow: 'Documents', head: 'Word to PDF in seconds.',
    chips: ['DOCX', 'Markdown', 'HTML', 'TXT', 'RTF', 'CSV ⇄ JSON'] },
  { key: 'three', cat: 'merge', action: 'img.merge.pdf', eyebrow: 'Many files at once', head: 'Batch it. Or merge it.',
    chips: ['Photos → one PDF', 'Join videos', 'Join audio', 'Stitch images', 'Animated GIF'] },
];
const TYPE_START = T.types[0] + 0.1;
const TYPE_LEN = 3.1;
const RES = DATA.results;
const resultFor = {
  earthset: () => ({ preview: '<img src="out/media/earthset-4x5.jpg" alt="" style="height:200px">', what: 'Smart crop · 4:5 for Instagram & LinkedIn',
    file: 'Earthset from Orion-4x5.jpg', lines: ['5568 × 3712 → 2970 × 3712', `Subject kept in frame · done in <b>${secs(RES['img.crop.4:5'].seconds)}</b>`] }),
  launch: () => ({ preview: '<video id="ty-video" src="out/media/launch-clip.mp4" muted playsinline style="height:200px;max-width:none"></video>', what: 'Compress · Under 25 MB',
    file: 'Artemis I Launch-25MB.mp4', bars: [RES['vid.compress.25mb'].inputBytes, RES['vid.compress.25mb'].outputBytes],
    lines: [`Still 1080p · done in <b>${secs(RES['vid.compress.25mb'].seconds)}</b>`] }),
  audio: () => ({ preview: '<div style="width:200px;height:200px;display:grid;place-items:center;background:linear-gradient(135deg,#ff375f,#bf5af2)"><img src="out/media/wave.png" style="width:170px;height:70px" alt=""></div>',
    what: 'Compress · Voice (64k mono)', file: 'Mars Habitat Audio Log-voice.mp3', bars: [RES['aud.compress.voice'].inputBytes, RES['aud.compress.voice'].outputBytes],
    lines: [`52-minute recording · done in <b>${secs(RES['aud.compress.voice'].seconds)}</b>`] }),
  presskit: () => ({ preview: ['03', '02', '01'].map((n, i) => `<img class="stack" src="out/media/presskit-${n}.jpg" style="transform:translate(${(i - 1) * 34}px,${(1 - i) * 6}px) rotate(${(i - 1) * 8}deg)" alt="">`).join(''),
    what: 'Export · PNG pages', file: 'Artemis I Press Kit-images', lines: [`${RES['pdf.png'].files} pages → ${RES['pdf.png'].files} PNG images`, `High resolution · done in <b>${secs(RES['pdf.png'].seconds)}</b>`] }),
  wbs: () => ({ preview: ['5', '2', '1'].map((n, i) => `<img class="stack" src="out/media/wbs-${n}.jpg" style="transform:translate(${(i - 1) * 30}px,${(1 - i) * 6}px) rotate(${(i - 1) * 7}deg)" alt="">`).join(''),
    what: 'Convert · PDF', file: 'WBS Handbook.pdf', lines: [`${DATA.docPages}-page Word document → PDF`, `Images & layout kept · done in <b>${secs(RES['doc.pdf'].seconds)}</b>`] }),
  three: () => ({ preview: ['cliffs', 'earthset', 'blue-marble'].map((n, i) => `<img class="stack" src="out/media/${n}.jpg" style="width:120px;transform:translate(${(i - 1) * 30}px,${(1 - i) * 10}px) rotate(${(i - 1) * 9}deg)" alt="">`).join(''),
    what: 'Merge · Into one PDF', file: 'Blue Marble.pdf', lines: ['3 photos → 1 PDF, one page each', `Full resolution · done in <b>${secs(RES['img.merge.pdf'].seconds)}</b>`] }),
};

function setResult(key) {
  const r = resultFor[key]();
  $('ty-preview').innerHTML = r.preview;
  const body = $('ty-result').querySelector('.body');
  body.innerHTML = `<div class="what">${r.what}</div><div class="file">${r.file}</div>
    ${r.bars ? `<div class="bars">
      <div class="bar before"><span>Before</span><div class="track"><div class="fill" data-w="1"></div></div><span class="v">${mbText(r.bars[0])}</span></div>
      <div class="bar after"><span>After</span><div class="track"><div class="fill" data-w="${Math.max(0.015, r.bars[1] / r.bars[0])}"></div></div><span class="v">${mbText(r.bars[1])}</span></div>
    </div>` : ''}
    ${r.lines.map((l, i) => `<div class="stat" style="${i === 0 && !r.bars ? 'font-size:30px;font-weight:600;color:var(--label);margin-top:10px' : ''}">${l}</div>`).join('')}`;
}

function buildTypes() {
  TYPES.forEach((ty, k) => {
    const s = TYPE_START + k * TYPE_LEN;
    const { c, i } = idx(ty.key, ty.cat, ty.action);
    at(s, () => {
      $('ty-eyebrow').textContent = ty.eyebrow;
      $('ty-head').textContent = ty.head;
      $('ty-chips').innerHTML = ty.chips.map((x) => `<span>${x}</span>`).join('');
      setResult(ty.key);
      pickerShow(ty.key);
    });
    at(s + 0.55, () => pickerEval(`state.cat=${c}; state.hover=-1`));
    at(s + 0.95, () => pickerEval(`state.hover=${i}`));
  });
}

async function renderTypes(t) {
  const [a, b] = T.types;
  $('types').style.opacity = fadeWin(t, a, b);
  if (t < TYPE_START || t >= b) return;
  const k = Math.min(TYPES.length - 1, Math.floor((t - TYPE_START) / TYPE_LEN));
  const u = t - (TYPE_START + k * TYPE_LEN);
  const ty = TYPES[k];
  const inK = easeOut(prog(u, 0, 0.45));
  const outK = k < TYPES.length - 1 ? easeOut(prog(u, TYPE_LEN - 0.3, 0.3)) : 0;
  style($('ty-eyebrow'), { o: inK * (1 - outK), y: (1 - inK) * 12 });
  style($('ty-head'), { o: inK * (1 - outK), y: (1 - inK) * 18 });
  style($('ty-chips'), { o: easeOut(prog(u, 0.15, 0.45)) * (1 - outK), y: (1 - easeOut(prog(u, 0.15, 0.45))) * 14 });

  pickerState.cx = 540; pickerState.cy = 712; pickerState.s = 1.36;
  pickerState.o = (1 - outK) * (1 - easeOut(prog(t, b - 0.35, 0.3)));

  const rk = backOut(prog(u, 1.3, 0.55));
  style($('ty-result'), { o: easeOut(prog(u, 1.3, 0.35)) * (1 - outK), y: (1 - rk) * 80 });
  document.querySelectorAll('#ty-result .fill').forEach((f) => { f.style.width = `${easeOut(prog(u, 1.6, 0.7)) * Number(f.dataset.w) * 100}%`; });

  // Cursor glides to the category, then the action.
  const { menu, c, i } = idx(ty.key, ty.cat, ty.action);
  const [catX, catY] = toPage(wedgePoint(menu, c));
  const [actX, actY] = toPage(wedgePoint(menu, c, i));
  const [px, py] = pathAt([{ t: 0.1, x: 540, y: 712 }, { t: 0.55, x: catX, y: catY }, { t: 0.7, x: catX, y: catY }, { t: 0.95, x: actX, y: actY }], u);
  placeCursor(px, py, easeOut(prog(u, 0.05, 0.2)) * (1 - easeOut(prog(u, 1.3, 0.25))));

  const video = document.getElementById('ty-video');
  if (video) await seek(video, 4 + Math.max(0, u - 1.0) * 1.6);
}

function seek(video, time) {
  return new Promise((resolve) => {
    if (video.readyState < 1) { video.addEventListener('loadedmetadata', () => seek(video, time).then(resolve), { once: true }); return; }
    if (Math.abs(video.currentTime - time) < 0.001) return resolve();
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = time;
  });
}

// ---------- scene 4: keyboard ----------
function buildKeys() {
  const s = T.keys[0];
  const { menu } = idx('launch', 'audio');
  at(s + 0.9, () => pickerShow('launch'));
  at(s + 1.75, () => pickerEval("state.query='m'; state.hover=0"));
  at(s + 2.0, () => pickerEval("state.query='mp'; state.hover=0"));
  at(s + 2.25, () => pickerEval("state.query='mp3'; state.hover=0"));
  at(s + 3.05, () => pickerReset());
  void menu;
}
function renderKeys(t) {
  const [a, b] = T.keys;
  $('keys').style.opacity = fadeWin(t, a, b);
  const u = t - a;
  const phase = u < 1.5 ? 'shortcut' : u < 2.7 ? 'type' : 'enter';
  const caps = { shortcut: ['⌘', '⇧', 'Space'], type: ['M', 'P', '3'], enter: ['↵ return'] }[phase];
  const row = $('keyrow');
  if (row.dataset.phase !== phase) {
    row.dataset.phase = phase;
    row.innerHTML = caps.map((c) => `<div class="k">${c}</div>`).join('');
  }
  const downAt = { shortcut: [0.5, 0.6, 0.7], type: [1.75, 2.0, 2.25], enter: [2.9] }[phase];
  [...row.children].forEach((k, i) => k.classList.toggle('down', u >= downAt[i] && u < downAt[i] + (phase === 'shortcut' ? 0.5 : 0.18)));
  style(row, { o: easeOut(prog(u, 0.2, 0.3)) * (1 - easeOut(prog(u, 4.3, 0.3))) });

  if (t >= a && t < b) {
    pickerState.cx = 540; pickerState.cy = 650; pickerState.s = 1.36;
    pickerState.o = u >= 0.9 && u < 3.05 ? 1 - easeOut(prog(u, 2.95, 0.12)) : 0;
  }

  const n = $('keynotif');
  const k = easeOut(prog(u, 3.1, 0.4));
  n.style.opacity = k * (1 - easeOut(prog(u, 4.4, 0.3)));
  n.style.transform = `translateY(${(1 - k) * 30}px)`;
}

// ---------- scene 5: editors ----------
function renderEditors(t) {
  const [a, b] = T.editors;
  $('editors').style.opacity = fadeWin(t, a, b);
  const u = t - a;
  const swap = 2.25;
  $('ed-sub').textContent = u < swap ? 'Yellow trim bar, live preview, exact timestamps.' : 'Corner handles and one-tap aspect ratios.';
  style($('ed-sub'), { o: easeOut(prog(u, u < swap ? 0.2 : swap, 0.35)) });
  const k1 = easeOut(prog(u, 0.1, 0.6));
  style($('shot-trim'), { o: k1 * (1 - easeOut(prog(u, swap - 0.1, 0.4))), y: (1 - k1) * 60, s: lerp(1, 1.03, prog(u, 0, swap)) });
  const k2 = easeOut(prog(u, swap, 0.6));
  style($('shot-crop'), { o: k2, y: (1 - k2) * 60, s: lerp(1, 1.03, prog(u, swap, 2.3)) });
}

// ---------- scene 6: details ----------
const CARDS = [
  ['merge', 'Batch anything', 'Drop 1 file or 100. Each one gets converted.'],
  ['pages', 'Mixed files', 'Photos and PDFs merge into a single PDF.'],
  ['check', 'Never overwrites', 'Originals stay untouched. New files get clear names.'],
  ['resize', 'Huge files', 'An 11,500 × 11,500 px photo? Handled.'],
  ['file', 'Honest about limits', 'Unsupported file? Orbital says so instead of failing.'],
  ['edit', 'Feels native', 'Light & dark mode, your accent color, keyboard first.'],
];
$('cards').innerHTML = CARDS.map(([ic, h, p]) => `<div class="card"><div class="ci">${window.icon(ic, 28)}</div><h3>${h}</h3><p>${p}</p></div>`).join('');
function renderDetails(t) {
  const [a, b] = T.details;
  $('details').style.opacity = fadeWin(t, a, b);
  [...$('cards').children].forEach((c, i) => {
    const k = backOut(prog(t, a + 0.25 + i * 0.12, 0.5));
    style(c, { o: easeOut(prog(t, a + 0.25 + i * 0.12, 0.3)), y: (1 - k) * 50 });
  });
}

// ---------- scene 1 & 7 ----------
function renderHook(t) {
  const [a, b] = T.hook;
  $('hook').style.opacity = 1 - easeOut(prog(t, b - 0.35, 0.35));
  const q = (el, start) => style(el, { o: easeOut(prog(t, start, 0.5)), y: (1 - easeOut(prog(t, start, 0.6))) * 24 });
  style(document.querySelector('#hook .icon'), { o: easeOut(prog(t, a + 0.1, 0.4)), s: lerp(0.6, 1, backOut(prog(t, a + 0.1, 0.8))) * lerp(1, 1.04, prog(t, 1, 2.3)) });
  q(document.querySelector('#hook .title'), 0.5);
  q(document.querySelector('#hook .tag'), 0.9);
  q(document.querySelector('#hook .tag2'), 1.3);
}
function renderClose(t) {
  const [a] = T.close;
  $('close').style.opacity = easeOut(prog(t, a, 0.35));
  const q = (id, start, scale) => style($(id), { o: easeOut(prog(t, a + start, 0.5)), y: (1 - easeOut(prog(t, a + start, 0.6))) * 24, s: scale ? lerp(0.7, 1, backOut(prog(t, a + start, 0.8))) : 1 });
  q('cl-1', 0.1); q('cl-2', 0.4); q('cl-3', 0.7);
  q('cl-icon', 1.5, true); q('cl-4', 1.75); q('cl-5', 1.95); q('cl-6', 2.15); q('cl-7', 2.35); q('cl-8', 2.6);
}

// ---------- animation clock ----------
// Every CSS animation/transition (including the real picker's) is paused and stepped to the frame time.
const animStart = new WeakMap();
function syncAnimations(doc, now) {
  for (const anim of doc.getAnimations()) {
    if (!animStart.has(anim)) { animStart.set(anim, now); anim.pause(); }
    anim.currentTime = (now - animStart.get(anim)) * 1000;
  }
}

let built = false;
window.renderFrame = async (t) => {
  if (!built) { buildDeskPath(); buildTypes(); buildKeys(); built = true; }
  runEvents(t);
  renderHook(t);
  renderDesk(t);
  await renderTypes(t);
  renderKeys(t);
  renderEditors(t);
  renderDetails(t);
  renderClose(t);
  const inPickerScene = (t >= T.desk[0] && t < T.desk[1]) || (t >= TYPE_START && t < T.types[1]) || (t >= T.keys[0] && t < T.keys[1]);
  if (!inPickerScene) pickerState.o = 0;
  if (t >= T.keys[1] || t < T.desk[0]) placeCursor(0, 0, 0);
  placePicker();
  $('brand').style.opacity = 0;
  syncAnimations(document, t);
  syncAnimations(pickerFrame.contentDocument, t);
  await new Promise((r) => requestAnimationFrame(() => r()));
};

window.ready = async () => {
  await new Promise((r) => (pickerFrame.contentDocument?.readyState === 'complete' ? r() : pickerFrame.addEventListener('load', r, { once: true })));
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  return true;
};
