const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const kind = params.get('kind');
const file = params.get('file');
let apply = () => {};

const PLAY = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 1.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L4.4 1.3a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>';
const PAUSE = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor"/><rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor"/></svg>';

const fmt = (t) => {
  const m = Math.floor(t / 60); const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
const parse = (str) => {
  const parts = str.trim().split(':').map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, v) => acc * 60 + v, 0);
};

// ---------- Trim ----------
async function initTrim(info) {
  $('#trim').hidden = false;
  const media = $('#media');
  const duration = info.duration || 0;
  const sel = { start: 0, end: duration };

  if (info.strip) {
    $('#strip').src = info.strip;
    if (!info.isVideo) $('#strip').classList.add('wave');
  }
  if (!info.isVideo) {
    media.style.display = 'none';
    if (info.strip) { $('#wave-art').src = info.strip; $('#wave-art').hidden = false; }
  }
  media.src = info.url;
  media.addEventListener('error', () => { if (info.isVideo) $('#noplay').hidden = false; });

  const tl = $('#timeline');
  const pct = (t) => `${(t / duration) * 100}%`;
  const draw = () => {
    $('#frame').style.left = pct(sel.start);
    $('#frame').style.right = `${100 - (sel.end / duration) * 100}%`;
    $('#shade-l').style.width = pct(sel.start);
    $('#shade-r').style.width = `${100 - (sel.end / duration) * 100}%`;
    if (document.activeElement !== $('#t-start')) $('#t-start').value = fmt(sel.start);
    if (document.activeElement !== $('#t-end')) $('#t-end').value = fmt(sel.end);
    $('#t-len').textContent = fmt(sel.end - sel.start);
  };
  const timeAt = (x) => {
    const r = tl.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((x - r.left) / r.width) * duration));
  };
  const setEdge = (edge, t) => {
    if (edge === 'start') sel.start = Math.max(0, Math.min(t, sel.end - 0.1));
    else sel.end = Math.min(duration, Math.max(t, sel.start + 0.1));
    media.currentTime = sel[edge];
    draw();
  };

  // Drag a grip to move that edge; click elsewhere on the strip to scrub.
  let dragging = null;
  tl.addEventListener('pointerdown', (e) => {
    dragging = e.target.dataset.h || 'scrub';
    tl.setPointerCapture(e.pointerId);
    if (dragging === 'scrub') media.currentTime = Math.min(sel.end, Math.max(sel.start, timeAt(e.clientX)));
  });
  tl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (dragging === 'scrub') media.currentTime = Math.min(sel.end, Math.max(sel.start, timeAt(e.clientX)));
    else setEdge(dragging, timeAt(e.clientX));
  });
  tl.addEventListener('pointerup', () => { dragging = null; });
  document.querySelectorAll('.grip').forEach((g) => g.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === 'ArrowLeft') setEdge(g.dataset.h, sel[g.dataset.h] - step);
    if (e.key === 'ArrowRight') setEdge(g.dataset.h, sel[g.dataset.h] + step);
  }));
  for (const edge of ['start', 'end']) {
    $(`#t-${edge}`).addEventListener('change', (e) => {
      const t = parse(e.target.value);
      if (t != null) setEdge(edge, t);
      e.target.blur();
      draw();
    });
  }

  const playBtn = $('#play');
  playBtn.innerHTML = PLAY;
  const tick = () => {
    $('#playhead').style.left = pct(media.currentTime);
    if (!media.paused && media.currentTime >= sel.end) media.pause();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  media.addEventListener('play', () => { playBtn.innerHTML = PAUSE; });
  media.addEventListener('pause', () => { playBtn.innerHTML = PLAY; });
  const toggle = () => {
    if (!media.paused) return media.pause();
    if (media.currentTime < sel.start || media.currentTime >= sel.end - 0.05) media.currentTime = sel.start;
    media.play().catch(() => {});
  };
  playBtn.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); toggle(); }
  });

  apply = () => window.orbital.apply('trim', file, { start: sel.start, end: sel.end });
  draw();
}

// ---------- Crop ----------
const RATIOS = [['Freeform', null], ['Square', 1], ['4:5', 4 / 5], ['16:9', 16 / 9], ['9:16', 9 / 16], ['4:3', 4 / 3], ['3:2', 3 / 2]];

async function initCrop(info) {
  $('#crop').hidden = false;
  const img = $('#img');
  const box = $('#box');
  let ratio = null;
  let b = { x: 0, y: 0, w: 0, h: 0 }; // in displayed-image pixels
  img.src = info.dataUrl;
  await img.decode();

  const bounds = () => ({ w: img.clientWidth, h: img.clientHeight, ox: img.offsetLeft, oy: img.offsetTop });
  const scale = () => info.width / img.clientWidth;
  const draw = () => {
    const { ox, oy } = bounds();
    Object.assign(box.style, { left: `${ox + b.x}px`, top: `${oy + b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    const s = scale();
    $('#dims').textContent = `${Math.round(b.w * s)} × ${Math.round(b.h * s)}`;
  };
  const fitRatio = () => {
    const { w, h } = bounds();
    if (!ratio) { b = { x: 0, y: 0, w, h }; return; }
    let bw = w; let bh = bw / ratio;
    if (bh > h) { bh = h; bw = bh * ratio; }
    b = { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
  };
  const clamp = () => {
    const { w, h } = bounds();
    b.x = Math.min(Math.max(b.x, 0), w - b.w);
    b.y = Math.min(Math.max(b.y, 0), h - b.h);
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
    box.classList.add('dragging');
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx; const dy = e.clientY - drag.sy; const s = drag.start;
    if (!drag.corner) { b.x = s.x + dx; b.y = s.y + dy; clamp(); return draw(); }
    const west = drag.corner.includes('w'); const north = drag.corner.includes('n');
    const { w: bw, h: bh } = bounds();
    let w = Math.max(24, Math.min(s.w + (west ? -dx : dx), west ? s.x + s.w : bw - s.x));
    let h = Math.max(24, Math.min(s.h + (north ? -dy : dy), north ? s.y + s.h : bh - s.y));
    if (ratio) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
    b = { x: west ? s.x + s.w - w : s.x, y: north ? s.y + s.h - h : s.y, w, h };
    draw();
  });
  const end = () => { drag = null; box.classList.remove('dragging'); };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => { fitRatio(); draw(); });

  apply = () => {
    const s = scale();
    window.orbital.apply('crop', file, { left: b.x * s, top: b.y * s, width: b.w * s, height: b.h * s });
  };
  fitRatio();
  draw();
}

(async () => {
  document.body.classList.toggle('not-mac', !navigator.platform.startsWith('Mac'));
  const info = await window.orbital.load(kind, file);
  $('#title').textContent = info.name;
  if (kind === 'crop') await initCrop(info); else await initTrim(info);
})();

$('#apply').addEventListener('click', () => apply());
$('#cancel').addEventListener('click', () => window.close());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.close();
  if (e.key === 'Enter' && e.target.tagName !== 'INPUT') apply();
});
