// Radial picker. Polar geometry around the window centre: angle 0 = 12 o'clock, clockwise.
// Visuals are floating HTML elements; hit-testing stays angular so targets are generous.
const C = 320;
const R_HUB = 68;
const R_CAT = [80, 152];
const CAT_R = 116;
const R_ACT = [160, 272]; // outer pie ring
const ACT_R = 216;
const MAX_FAN_SEG = 28;
const MAX_SEARCH = 12;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const catsEl = $('cats');
const actsEl = $('acts');
const hub = $('hub');
const thumbEl = $('thumb');
const hubTitle = $('hub-title');
const hubSub = $('hub-sub');
const hintEl = $('hint');

const state = {
  mode: null, // drag | menu | hub
  files: [],
  info: null,
  menu: [],
  cat: 0,
  hover: -1,
  query: '',
  revealed: false,
  message: null,
};
let builtCats = null;
let builtFan = null;

// ---------- geometry ----------
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.sin(rad(deg)), C - r * Math.cos(rad(deg))];
const norm = (deg) => ((deg % 360) + 360) % 360;
const catSpan = () => 360 / Math.max(1, state.menu.length);
const catCenter = (i) => i * catSpan();

function searchResults() {
  const words = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const cat of state.menu) {
    for (const item of cat.items) {
      const hay = `${item.label} ${cat.label} ${item.hint || ''}`.toLowerCase();
      if (words.every((w) => hay.includes(w))) out.push({ ...item, hint: cat.label });
    }
  }
  return out.slice(0, MAX_SEARCH);
}

const currentItems = () => (state.query ? searchResults() : state.menu[state.cat]?.items || []);

function fan() {
  const items = currentItems();
  const seg = Math.min(MAX_FAN_SEG, 360 / Math.max(1, items.length));
  const center = state.query ? 0 : catCenter(state.cat);
  return { items, seg, start: center - (seg * items.length) / 2 };
}

function hit(x, y) {
  const dx = x - C; const dy = y - C;
  const r = Math.hypot(dx, dy);
  const a = norm((Math.atan2(dx, -dy) * 180) / Math.PI);
  if (r <= (state.menu.length ? R_HUB : 96)) return { type: 'hub' };
  if (!state.menu.length) return null;
  if (r >= R_CAT[0] && r <= R_CAT[1] && !state.query) {
    return { type: 'cat', index: Math.floor(norm(a + catSpan() / 2) / catSpan()) % state.menu.length };
  }
  if (r > R_CAT[1] && r <= R_ACT[1] + 14) {
    const { items, seg, start } = fan();
    const i = Math.floor(norm(a - start) / seg);
    if (i >= 0 && i < items.length) return { type: 'act', index: i };
  }
  return null;
}

// ---------- rendering ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const place = (el, r, a) => { const [x, y] = pt(r, a); el.style.left = `${x}px`; el.style.top = `${y}px`; };

function sector(r1, r2, a0, a1) {
  if (a1 - a0 >= 359.9) {
    // Full ring: outer circle clockwise, inner circle counter-clockwise.
    const [ox, oy] = pt(r2, 0); const [ox2, oy2] = pt(r2, 180);
    const [ix, iy] = pt(r1, 0); const [ix2, iy2] = pt(r1, 180);
    return `M${ox},${oy}A${r2},${r2} 0 1 1 ${ox2},${oy2}A${r2},${r2} 0 1 1 ${ox},${oy}Z`
      + `M${ix},${iy}A${r1},${r1} 0 1 0 ${ix2},${iy2}A${r1},${r1} 0 1 0 ${ix},${iy}Z`;
  }
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x1, y1] = pt(r2, a0); const [x2, y2] = pt(r2, a1);
  const [x3, y3] = pt(r1, a1); const [x4, y4] = pt(r1, a0);
  return `M${x1},${y1}A${r2},${r2} 0 ${large} 1 ${x2},${y2}L${x3},${y3}A${r1},${r1} 0 ${large} 0 ${x4},${y4}Z`;
}

function buildCats() {
  const key = state.menu.map((c) => c.id).join(',');
  if (key === builtCats) return;
  builtCats = key;
  catsEl.innerHTML = '';
  if (!state.menu.length) return;
  const [r1, r2] = R_CAT;
  const span = catSpan();
  const n = state.menu.length;
  const wedges = state.menu.map((_, i) =>
    `<path class="wedge" d="${sector(r1, r2, catCenter(i) - span / 2, catCenter(i) + span / 2)}"/>`).join('');
  const lines = n > 1 ? state.menu.map((_, i) => {
    const a = catCenter(i) - span / 2;
    const [x1, y1] = pt(r1 + 8, a); const [x2, y2] = pt(r2 - 8, a);
    return `<line class="divider" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('') : '';
  catsEl.innerHTML = `<svg class="pie ring" viewBox="0 0 640 640" width="640" height="640">
      <path class="pie-base" d="${sector(r1, r2, 0, 360)}"/>${wedges}${lines}
      <path class="pie-edge" d="${sector(r1, r2, 0, 360)}"/>
    </svg>`;
  state.menu.forEach((cat, i) => {
    const el = document.createElement('div');
    el.className = 'cat orb enter';
    el.style.animationDelay = `${30 + i * 18}ms`;
    el.innerHTML = `<div class="chip">${window.icon(cat.icon, 19)}</div><div class="name">${esc(cat.label)}</div>`;
    place(el, CAT_R, catCenter(i));
    catsEl.appendChild(el);
  });
}

// Actions form one continuous glass arc split by hairlines, like a pie ring.
function buildFan() {
  const { items, seg, start } = fan();
  const key = `${state.query ? `q:${state.query}` : `c:${state.cat}`}|${items.map((i) => i.id).join(',')}`;
  if (key === builtFan) return;
  builtFan = key;
  actsEl.innerHTML = '';
  actsEl.classList.remove('enter');
  if (!items.length) return;
  const [r1, r2] = R_ACT;
  const end = start + seg * items.length;
  const center = (start + end) / 2;
  actsEl.style.setProperty('--ox', `${pt(1, center)[0] - C}`);
  actsEl.style.setProperty('--oy', `${pt(1, center)[1] - C}`);

  const paths = items.map((_, i) =>
    `<path class="wedge" data-i="${i}" d="${sector(r1, r2, start + seg * i, start + seg * (i + 1))}"/>`).join('');
  // Hairline dividers between wedges (none on a full ring's seam).
  const lines = items.slice(1).map((_, i) => {
    const a = start + seg * (i + 1);
    const [x1, y1] = pt(r1 + 10, a); const [x2, y2] = pt(r2 - 10, a);
    return `<line class="divider" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  actsEl.innerHTML = `<svg class="pie" viewBox="0 0 640 640" width="640" height="640">
      <path class="pie-base" d="${sector(r1, r2, start, end)}"/>${paths}${lines}
      <path class="pie-edge" d="${sector(r1, r2, start, end)}"/>
    </svg>`;
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'act orb';
    el.innerHTML = `<span class="label">${esc(item.label)}</span>${item.hint ? `<span class="sub">${esc(item.hint)}</span>` : ''}`;
    el.style.maxWidth = `${Math.max(56, Math.min(120, rad(seg) * ACT_R - 10))}px`;
    place(el, ACT_R, start + seg * (i + 0.5));
    actsEl.appendChild(el);
  });
  void actsEl.offsetWidth; // restart the unfold animation
  actsEl.classList.add('enter');
}

function paint() {
  document.body.classList.toggle('hub-mode', !state.menu.length);
  document.body.classList.toggle('searching', !!state.query);
  buildCats();
  buildFan();
  catsEl.querySelectorAll('.cat').forEach((el, i) => el.classList.toggle('active', i === state.cat && !state.query));
  catsEl.querySelectorAll('.wedge').forEach((el, i) => el.classList.toggle('hover', i === state.cat && !state.query));
  actsEl.querySelectorAll('.act').forEach((el, i) => el.classList.toggle('hover', i === state.hover));
  actsEl.querySelectorAll('.wedge').forEach((el, i) => el.classList.toggle('hover', i === state.hover));
  paintHub();
}

function paintHub() {
  const item = currentItems()[state.hover];
  const info = state.info;
  const thumb = info?.thumb ? `<img src="${info.thumb}" alt="">` : '';

  if (state.message) {
    thumbEl.innerHTML = window.icon('drop', 30);
    hubTitle.textContent = state.message;
    hubSub.textContent = '';
  } else if (state.query) {
    thumbEl.innerHTML = '';
    hubTitle.innerHTML = `<span class="query">${esc(state.query)}</span><span class="caret"></span>`;
    hubSub.textContent = currentItems().length ? `${currentItems().length} matches` : 'No matches';
  } else if (!state.menu.length) {
    thumbEl.innerHTML = window.icon('drop', 34);
    hubTitle.textContent = state.mode === 'drag' ? 'Drop to convert' : 'Drop files here';
    hubSub.textContent = state.mode === 'drag' ? '' : 'Press Esc to close';
  } else {
    if (thumbEl.dataset.src !== (info?.thumb || '')) {
      thumbEl.innerHTML = thumb || window.icon('file', 30);
      thumbEl.dataset.src = info?.thumb || '';
    }
    hubTitle.textContent = item ? item.label : info?.name || (state.files.length > 1 ? `${state.files.length} files` : 'Orbital');
    hubSub.textContent = item ? (item.hint || state.menu[state.cat]?.label || '') : info?.detail || (state.mode === 'drag' ? 'Release on an action' : '');
  }

  const showHint = state.mode === 'menu' && state.menu.length && !state.message;
  hintEl.classList.toggle('show', !!showHint);
  if (showHint) {
    hintEl.innerHTML = state.query
      ? '<kbd>↵</kbd> convert &nbsp;·&nbsp; <kbd>esc</kbd> clear'
      : 'Type to search &nbsp;·&nbsp; <kbd>←</kbd><kbd>→</kbd> category &nbsp;·&nbsp; <kbd>↵</kbd> convert';
  }
}

function reveal() {
  if (state.revealed) return;
  state.revealed = true;
  stage.classList.remove('hidden');
}

function reset() {
  Object.assign(state, { mode: null, files: [], info: null, menu: [], cat: 0, hover: -1, query: '', revealed: false, message: null });
  stage.classList.add('hidden');
  document.body.classList.remove('drag-mode');
  catsEl.innerHTML = '';
  actsEl.innerHTML = '';
  thumbEl.innerHTML = '';
  delete thumbEl.dataset.src;
  builtCats = null;
  builtFan = null;
}

function close() {
  reset();
  window.orbital.hide();
}

function runItem(item) {
  if (!item || !state.files.length) return;
  window.orbital.run(item.id, state.files);
  reset();
}

// ---------- pointer ----------
function track(x, y) {
  const h = hit(x, y);
  let changed = false;
  if (h?.type === 'cat' && h.index !== state.cat) { state.cat = h.index; state.hover = -1; changed = true; }
  const hover = h?.type === 'act' ? h.index : -1;
  if (hover !== state.hover) { state.hover = hover; changed = true; }
  hub.classList.toggle('drop-target', h?.type === 'hub' && state.mode === 'drag');
  if (changed) paint();
  return h;
}

document.addEventListener('mousemove', (e) => { if (state.mode === 'menu') track(e.clientX, e.clientY); });
document.addEventListener('mousedown', (e) => {
  if (state.mode !== 'menu' && state.mode !== 'hub') return;
  const h = hit(e.clientX, e.clientY);
  if (!h) return close();
  if (h.type === 'act') runItem(currentItems()[h.index]);
  else if (h.type === 'cat') { state.cat = h.index; state.hover = -1; state.query = ''; paint(); }
});

// ---------- drag & drop ----------
const MIME_KIND = [
  [/^image\//, 'image'], [/^video\//, 'video'], [/^audio\//, 'audio'], [/^application\/pdf$/, 'pdf'],
  [/(wordprocessingml|msword|opendocument\.text|rtf|markdown|^text\/html|^text\/plain)/, 'doc'],
  [/(csv|json|tab-separated)/, 'data'],
];
const kindForMime = (mime) => (MIME_KIND.find(([re]) => re.test(mime)) || [, 'unknown'])[1];
let kindsRequested = false;

async function onDragEnter(e) {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
  reveal();
  if (state.mode !== 'drag' || kindsRequested) return;
  kindsRequested = true;
  // During a drag Chromium exposes MIME types but not paths; use them to pre-build the menu.
  const kinds = Array.from(e.dataTransfer.items).filter((i) => i.kind === 'file').map((i) => kindForMime(i.type));
  if (kinds.length && !kinds.includes('unknown')) {
    state.menu = await window.orbital.menuFor({ kinds });
    paint();
  }
}

document.addEventListener('dragenter', (e) => { e.preventDefault(); onDragEnter(e); });
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  onDragEnter(e);
  track(e.clientX, e.clientY);
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  hub.classList.remove('drop-target');
  const files = window.orbital.pathsFor(e.dataTransfer.files);
  if (!files.length) return close();
  const h = hit(e.clientX, e.clientY);
  const picked = h?.type === 'act' ? currentItems()[h.index] : null;
  state.files = files;
  const menu = await window.orbital.menuFor({ files });
  if (!menu.length) {
    state.menu = [];
    state.message = 'Not supported yet';
    paint();
    setTimeout(close, 1200);
    return;
  }
  // Dropped straight onto an action that's valid for these exact files: run it.
  if (picked && menu.some((c) => c.items.some((i) => i.id === picked.id))) return runItem(picked);
  // Otherwise stay open so the user can choose.
  const prevCat = state.menu[state.cat]?.id;
  state.menu = menu;
  state.cat = Math.max(0, menu.findIndex((c) => c.id === prevCat));
  state.hover = -1;
  state.mode = 'menu';
  document.body.classList.remove('drag-mode');
  window.orbital.setMode('menu');
  paint();
  state.info = await window.orbital.fileInfo(files);
  paint();
});

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.query) { state.query = ''; state.hover = -1; paint(); } else close();
    return;
  }
  if (state.mode !== 'menu') return;
  const items = currentItems();
  if (e.key === 'Enter') return runItem(items[Math.max(0, state.hover)]);
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !state.query) {
    const step = e.key === 'ArrowRight' ? 1 : state.menu.length - 1;
    state.cat = (state.cat + step) % state.menu.length;
    state.hover = -1;
    return paint();
  }
  if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Tab'].includes(e.key)) {
    e.preventDefault();
    if (!items.length) return;
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey);
    state.hover = (state.hover + (back ? -1 : 1) + items.length) % items.length;
    return paint();
  }
  if (e.key === 'Backspace') {
    state.query = state.query.slice(0, -1);
    state.hover = state.query ? 0 : -1;
    return paint();
  }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && (state.query || e.key !== ' ')) {
    state.query += e.key;
    state.hover = 0;
    paint();
  }
});

// ---------- lifecycle ----------
function applyTheme(theme) {
  if (!theme?.accent) return;
  document.documentElement.style.setProperty('--accent', theme.accent);
  // Light accents (e.g. yellow) need dark text on top.
  const n = parseInt(theme.accent.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  document.documentElement.style.setProperty('--accent-ink', lum > 0.7 ? '#1d1d1f' : '#ffffff');
}

window.orbital.onShow(({ mode, files, menu, theme }) => {
  reset();
  kindsRequested = false;
  applyTheme(theme);
  Object.assign(state, { mode, files, menu });
  document.body.classList.toggle('drag-mode', mode === 'drag');
  paint();
  // Show immediately: macOS passes drags straight through fully transparent windows.
  reveal();
});
window.orbital.onInfo((info) => { state.info = info; paint(); });
window.orbital.onHide(reset);
