// Radial menu. Geometry is polar around the window centre: angle 0 = 12 o'clock, clockwise.
const C = 320;
const R_HUB = 58;
const R_CAT = [66, 150];
const R_ACT = [158, 296];
const MAX_FAN_SEG = 34;
const MAX_SEARCH = 12;

const svg = document.getElementById('ring');
const stage = document.getElementById('stage');
const hub = document.getElementById('hub');
const hubTitle = document.getElementById('hub-title');
const hubSub = document.getElementById('hub-sub');

const state = {
  mode: null, // drag | menu | hub
  files: [],
  menu: [],
  cat: 0,
  hover: -1,
  query: '',
  menuFromKinds: false,
  revealed: false,
  loading: null,
};
let lastFan = null;

// ---------- geometry ----------
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.sin(rad(deg)), C - r * Math.cos(rad(deg))];
const norm = (deg) => ((deg % 360) + 360) % 360;

function sector(r1, r2, a0, a1) {
  if (a1 - a0 >= 359.9) {
    // Full ring: two half arcs each way.
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

const catSpan = () => 360 / Math.max(1, state.menu.length);
const catCenter = (i) => i * catSpan();

function currentItems() {
  if (state.query) return searchResults();
  return state.menu[state.cat]?.items || [];
}

function fan() {
  const items = currentItems();
  const n = items.length;
  const seg = Math.min(MAX_FAN_SEG, 360 / Math.max(1, n));
  const center = state.query ? 0 : catCenter(state.cat);
  const start = center - (seg * n) / 2;
  return { items, seg, start, full: seg * n >= 359.9 };
}

function searchResults() {
  const q = state.query.toLowerCase();
  const out = [];
  for (const cat of state.menu) {
    for (const item of cat.items) {
      const hay = `${item.label} ${cat.label} ${item.hint || ''}`.toLowerCase();
      if (q.split(/\s+/).every((w) => hay.includes(w))) out.push({ ...item, hint: item.hint || cat.label });
    }
  }
  return out.slice(0, MAX_SEARCH);
}

function hit(x, y) {
  const dx = x - C; const dy = y - C;
  const r = Math.hypot(dx, dy);
  const a = norm((Math.atan2(dx, -dy) * 180) / Math.PI);
  if (r <= (state.menu.length ? R_HUB : 110)) return { type: 'hub' };
  if (!state.menu.length) return null;
  if (r >= R_CAT[0] && r <= R_CAT[1] && !state.query) {
    return { type: 'cat', index: Math.floor(norm(a + catSpan() / 2) / catSpan()) % state.menu.length };
  }
  if (r >= R_ACT[0] - 4 && r <= R_ACT[1] + 10) {
    const { items, seg, start } = fan();
    const rel = norm(a - start);
    const i = Math.floor(rel / seg);
    if (i >= 0 && i < items.length) return { type: 'act', index: i };
  }
  return null;
}

// ---------- rendering ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function wrapLabel(label, max = 13) {
  if (label.length <= max || !label.includes(' ')) return [label];
  const words = label.split(' ');
  let best = [label];
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '); const b = words.slice(i).join(' ');
    if (Math.max(a.length, b.length) < Math.max(...best.map((s) => s.length))) best = [a, b];
  }
  return best;
}

function render() {
  const parts = [`<defs><linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#3dd6f5"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="14" flood-opacity=".45"/></filter></defs>`];

  if (state.menu.length) {
    const span = catSpan();
    const gap = state.menu.length > 1 ? 1.2 : 0;
    parts.push('<g filter="url(#shadow)">');
    if (!state.query) {
      state.menu.forEach((cat, i) => {
        const a = catCenter(i);
        const [lx, ly] = pt((R_CAT[0] + R_CAT[1]) / 2, a);
        parts.push(`<g class="cat${i === state.cat ? ' active' : ''}">
          <path class="seg" d="${sector(R_CAT[0], R_CAT[1], a - span / 2 + gap, a + span / 2 - gap)}"/>
          <svg class="ico" x="${lx - 10}" y="${ly - 18}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${window.ICONS[cat.icon] || ''}</svg>
          <text class="label" x="${lx}" y="${ly + 15}" text-anchor="middle">${esc(cat.label)}</text></g>`);
      });
    }
    const { items, seg, start } = fan();
    // Only animate when the fan's contents change, not on every hover re-render.
    const fanKey = state.query ? `q:${state.query}` : `c:${state.cat}:${state.menu.length}`;
    const enter = fanKey !== lastFan ? ' enter' : '';
    lastFan = fanKey;
    items.forEach((item, i) => {
      const a0 = start + i * seg; const a1 = a0 + seg;
      const mid = (a0 + a1) / 2;
      const lines = wrapLabel(item.label);
      const [lx, ly] = pt((R_ACT[0] + R_ACT[1]) / 2 + 4, mid);
      const lineH = 13;
      const top = ly - ((lines.length - 1) * lineH) / 2 - (item.hint ? 5 : 0);
      parts.push(`<g class="act${i === state.hover ? ' hover' : ''}${enter}" style="animation-delay:${i * 12}ms">
        <path class="seg" d="${sector(R_ACT[0], R_ACT[1], a0 + 0.8, a1 - 0.8)}"/>
        ${lines.map((l, k) => `<text class="label" x="${lx}" y="${top + k * lineH + 4}" text-anchor="middle">${esc(l)}</text>`).join('')}
        ${item.hint ? `<text class="hint" x="${lx}" y="${top + lines.length * lineH + 3}" text-anchor="middle">${esc(item.hint)}</text>` : ''}
      </g>`);
    });
    parts.push('</g>');
  }
  svg.innerHTML = parts.join('');
  renderHub();
}

function renderHub() {
  const n = state.files.length;
  const name = n === 1 ? state.files[0].split(/[\\/]/).pop() : n > 1 ? `${n} files` : '';
  document.body.classList.toggle('hub-mode', !state.menu.length);
  if (state.loading) {
    hubTitle.textContent = state.loading;
    hubSub.textContent = '';
  } else if (state.query) {
    hubTitle.innerHTML = `<span class="q">${esc(state.query)}</span>`;
    hubSub.textContent = currentItems().length ? '↵ to run' : 'No match';
  } else if (!state.menu.length) {
    hubTitle.textContent = state.mode === 'drag' ? 'Drop here' : 'Drop files here';
    hubSub.textContent = state.mode === 'drag' ? 'to see options' : 'Esc to close';
  } else {
    const item = currentItems()[state.hover];
    hubTitle.textContent = item ? item.label : name || 'Orbital';
    hubSub.textContent = item ? (n > 1 ? `${n} files` : name) : state.mode === 'menu' ? 'Type to search' : 'Release to run';
  }
}

function reveal() {
  if (state.revealed) return;
  state.revealed = true;
  stage.classList.remove('hidden');
}

function reset() {
  Object.assign(state, { mode: null, files: [], menu: [], cat: 0, hover: -1, query: '', menuFromKinds: false, revealed: false, loading: null });
  stage.classList.add('hidden');
  document.body.classList.remove('drag-mode');
  svg.innerHTML = '';
  lastFan = null;
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
  let dirty = false;
  if (h?.type === 'cat' && h.index !== state.cat) { state.cat = h.index; state.hover = -1; dirty = true; }
  const hover = h?.type === 'act' ? h.index : -1;
  if (hover !== state.hover) { state.hover = hover; dirty = true; }
  hub.classList.toggle('drop-target', h?.type === 'hub');
  if (dirty) render();
  return h;
}

document.addEventListener('mousemove', (e) => { if (state.mode === 'menu') track(e.clientX, e.clientY); });
document.addEventListener('mousedown', (e) => {
  if (state.mode !== 'menu' && state.mode !== 'hub') return;
  const h = hit(e.clientX, e.clientY);
  if (!h) return close();
  if (h.type === 'act') runItem(currentItems()[h.index]);
  else if (h.type === 'cat') { state.cat = h.index; state.hover = -1; render(); }
});

// ---------- drag & drop ----------
const MIME_KIND = [
  [/^image\//, 'image'], [/^video\//, 'video'], [/^audio\//, 'audio'], [/^application\/pdf$/, 'pdf'],
  [/(wordprocessingml|msword|opendocument\.text|rtf|markdown|^text\/html|^text\/plain)/, 'doc'],
  [/(csv|json|tab-separated)/, 'data'],
];
const kindForMime = (mime) => (MIME_KIND.find(([re]) => re.test(mime)) || [, 'unknown'])[1];

async function onDragEnter(e) {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
  if (state.revealed) return;
  reveal();
  if (state.mode !== 'drag') return;
  // During a drag Chromium exposes MIME types but not paths; use them to pre-build the menu.
  const kinds = Array.from(e.dataTransfer.items).filter((i) => i.kind === 'file').map((i) => kindForMime(i.type));
  render();
  if (kinds.length && !kinds.includes('unknown')) {
    state.menu = await window.orbital.menuFor({ kinds });
    state.menuFromKinds = true;
    render();
  }
}

document.addEventListener('dragenter', (e) => { e.preventDefault(); onDragEnter(e); });
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  if (!state.revealed) onDragEnter(e);
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
    state.loading = 'Unsupported file';
    renderHub();
    setTimeout(close, 1100);
    return;
  }
  // Dropped straight onto an action that's valid for these exact files: run it.
  if (picked && menu.some((c) => c.items.some((i) => i.id === picked.id))) return runItem(picked);
  // Otherwise stay open as a clickable menu.
  const prevCat = state.menu[state.cat]?.id;
  state.menu = menu;
  state.cat = Math.max(0, menu.findIndex((c) => c.id === prevCat));
  state.hover = -1;
  state.mode = 'menu';
  document.body.classList.remove('drag-mode');
  window.orbital.setMode('menu');
  reveal();
  render();
});

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.query) { state.query = ''; state.hover = -1; render(); } else close();
    return;
  }
  if (state.mode !== 'menu') return;
  const items = currentItems();
  if (e.key === 'Enter') return runItem(items[Math.max(0, state.hover)]);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    if (state.query) { state.hover = (state.hover + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length; }
    else { state.cat = (state.cat + (e.key === 'ArrowRight' ? 1 : state.menu.length - 1)) % state.menu.length; state.hover = -1; }
    return render();
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
    e.preventDefault();
    const step = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
    state.hover = (state.hover + step + items.length) % items.length;
    return render();
  }
  if (e.key === 'Backspace') { state.query = state.query.slice(0, -1); state.hover = state.query ? 0 : -1; return render(); }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
    state.query += e.key;
    state.hover = 0;
    render();
  }
});

// ---------- lifecycle ----------
window.orbital.onShow(({ mode, files, menu }) => {
  reset();
  state.mode = mode;
  state.files = files;
  state.menu = menu;
  document.body.classList.toggle('drag-mode', mode === 'drag');
  render();
  // Show immediately: macOS passes drags straight through fully transparent windows,
  // so an invisible picker would never receive the file.
  reveal();
});
window.orbital.onHide(reset);
