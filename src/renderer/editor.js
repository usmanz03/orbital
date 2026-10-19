const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const kind = params.get('kind');
const file = params.get('file');
let apply = () => {};

const fmt = (t) => {
  const m = Math.floor(t / 60); const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
const parse = (str) => {
  const parts = str.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, v) => acc * 60 + v, 0);
};

// ---------- Trim ----------
async function initTrim(info) {
  $('#trim').hidden = false;
  $('#trim').style.display = 'flex';
  $('#trim').style.flexDirection = 'column';
  $('#trim').style.gap = '12px';
  const media = $('#media');
  const duration = info.duration || 0;
  const sel = { start: 0, end: duration };
  if (!info.isVideo) { media.style.display = 'none'; $('#audio-art').hidden = false; }
  media.src = info.url;
  media.addEventListener('error', () => { $('#noplay').hidden = false; });

  const tl = $('#timeline');
  const draw = () => {
    const pct = (t) => `${(t / duration) * 100}%`;
    $('#range').style.left = pct(sel.start);
    $('#range').style.width = `${((sel.end - sel.start) / duration) * 100}%`;
    $('#h-start').style.left = pct(sel.start);
    $('#h-end').style.left = pct(sel.end);
    $('#t-start').value = fmt(sel.start);
    $('#t-end').value = fmt(sel.end);
    $('#t-len').textContent = `${fmt(sel.end - sel.start)} selected`;
  };
  const timeAt = (x) => {
    const r = tl.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((x - r.left) / r.width) * duration));
  };
  const setEdge = (edge, t) => {
    if (edge === 'start') sel.start = Math.min(t, sel.end - 0.1);
    else sel.end = Math.max(t, sel.start + 0.1);
    media.currentTime = edge === 'start' ? sel.start : sel.end;
    draw();
  };

  let dragging = null;
  tl.addEventListener('pointerdown', (e) => {
    const t = timeAt(e.clientX);
    dragging = e.target.dataset.h || (Math.abs(t - sel.start) < Math.abs(t - sel.end) ? 'start' : 'end');
    tl.setPointerCapture(e.pointerId);
    setEdge(dragging, t);
  });
  tl.addEventListener('pointermove', (e) => { if (dragging) setEdge(dragging, timeAt(e.clientX)); });
  tl.addEventListener('pointerup', () => { dragging = null; });
  for (const edge of ['start', 'end']) {
    $(`#h-${edge}`).addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 1 : 0.1;
      if (e.key === 'ArrowLeft') setEdge(edge, sel[edge] - step);
      if (e.key === 'ArrowRight') setEdge(edge, sel[edge] + step);
    });
    $(`#t-${edge}`).addEventListener('change', (e) => {
      const t = parse(e.target.value);
      if (t != null) setEdge(edge, Math.min(duration, Math.max(0, t))); else draw();
    });
  }

  media.addEventListener('timeupdate', () => {
    $('#playhead').style.left = `${(media.currentTime / duration) * 100}%`;
    if (!media.paused && media.currentTime >= sel.end) media.pause();
  });
  $('#play').addEventListener('click', () => {
    if (!media.paused) return media.pause();
    media.currentTime = sel.start;
    media.play().catch(() => {});
  });

  apply = () => window.orbital.apply('trim', file, { start: sel.start, end: sel.end });
  draw();
}

// ---------- Crop ----------
const RATIOS = [['Free', null], ['1:1', 1], ['4:5', 4 / 5], ['16:9', 16 / 9], ['9:16', 9 / 16], ['4:3', 4 / 3], ['3:2', 3 / 2]];

async function initCrop(info) {
  $('#crop').hidden = false;
  Object.assign($('#crop').style, { display: 'flex', flexDirection: 'column', gap: '12px' });
  const img = $('#img');
  const box = $('#box');
  let ratio = null;
  // Box in displayed-image pixels.
  let b = { x: 0, y: 0, w: 0, h: 0 };
  img.src = info.dataUrl;
  await img.decode();

  const bounds = () => ({ w: img.clientWidth, h: img.clientHeight, ox: img.offsetLeft, oy: img.offsetTop });
  const scale = () => info.width / img.clientWidth;
  const draw = () => {
    const { ox, oy } = bounds();
    Object.assign(box.style, { left: `${ox + b.x}px`, top: `${oy + b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    const s = scale();
    $('#dims').textContent = `${Math.round(b.w * s)} × ${Math.round(b.h * s)} px`;
  };
  const fitRatio = () => {
    const { w, h } = bounds();
    if (!ratio) { b = { x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 }; return; }
    let bw = w * 0.9; let bh = bw / ratio;
    if (bh > h * 0.9) { bh = h * 0.9; bw = bh * ratio; }
    b = { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
  };
  const clamp = () => {
    const { w, h } = bounds();
    b.w = Math.min(Math.max(b.w, 20), w); b.h = Math.min(Math.max(b.h, 20), h);
    b.x = Math.min(Math.max(b.x, 0), w - b.w); b.y = Math.min(Math.max(b.y, 0), h - b.h);
  };

  $('#ratios').innerHTML = RATIOS.map(([l], i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('');
  $('#ratios').addEventListener('click', (e) => {
    const i = e.target.dataset.i;
    if (i == null) return;
    ratio = RATIOS[i][1];
    document.querySelectorAll('#ratios button').forEach((x) => x.classList.toggle('on', x === e.target));
    fitRatio(); draw();
  });

  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    drag = { corner: e.target.dataset.c || null, sx: e.clientX, sy: e.clientY, start: { ...b } };
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx; const dy = e.clientY - drag.sy; const s = drag.start;
    if (!drag.corner) { b.x = s.x + dx; b.y = s.y + dy; clamp(); return draw(); }
    const west = drag.corner.includes('w'); const north = drag.corner.includes('n');
    let w = s.w + (west ? -dx : dx);
    let h = s.h + (north ? -dy : dy);
    if (ratio) { if (Math.abs(dx) > Math.abs(dy)) h = w / ratio; else w = h * ratio; }
    const { w: bw, h: bh } = bounds();
    w = Math.max(20, Math.min(w, west ? s.x + s.w : bw - s.x));
    h = Math.max(20, Math.min(h, north ? s.y + s.h : bh - s.y));
    if (ratio) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
    b = { x: west ? s.x + s.w - w : s.x, y: north ? s.y + s.h - h : s.y, w, h };
    draw();
  });
  box.addEventListener('pointerup', () => { drag = null; });
  window.addEventListener('resize', () => { fitRatio(); draw(); });

  apply = () => {
    const s = scale();
    window.orbital.apply('crop', file, { left: b.x * s, top: b.y * s, width: b.w * s, height: b.h * s });
  };
  fitRatio();
  draw();
}

(async () => {
  const info = await window.orbital.load(kind, file);
  $('#title').textContent = `${kind === 'crop' ? 'Crop' : 'Trim'} · ${info.name}`;
  if (kind === 'crop') await initCrop(info); else await initTrim(info);
})();

$('#apply').addEventListener('click', () => apply());
$('#cancel').addEventListener('click', () => window.close());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.close();
  if (e.key === 'Enter' && e.target.tagName !== 'INPUT') apply();
});
