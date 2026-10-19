const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const basename = (p) => p.split(/[\\/]/).pop();

function prettyShortcut(acc, mac) {
  const map = mac
    ? { CommandOrControl: '⌘', Shift: '⇧', Alt: '⌥', Control: '⌃', Space: 'Space' }
    : { CommandOrControl: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Control: 'Ctrl', Space: 'Space' };
  // macOS orders modifiers ⌃⌥⇧⌘.
  const order = ['Control', 'Alt', 'Shift', 'CommandOrControl'];
  const keys = acc.split('+').sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return keys.map((k) => map[k] || k).join(mac ? ' ' : ' + ');
}

function renderStatus(s) {
  const mac = s.platform === 'darwin';
  document.body.classList.toggle('vibrant', mac);
  document.body.classList.toggle('not-mac', !mac);
  const st = s.settings;
  const keyName = { shift: 'Shift', alt: mac ? 'Option' : 'Alt', ctrl: 'Control' }[st.modifier];
  const needsPerm = !s.permission && s.hookSupported;
  const status = $('#status');
  let text;
  if (needsPerm) { status.className = 'status warn'; text = 'Needs Accessibility access to detect drags'; }
  else if (!s.hookSupported) { status.className = 'status warn'; text = `Use ${prettyShortcut(st.shortcut, mac)} on this system`; }
  else if (!st.triggerEnabled) { status.className = 'status'; text = 'Drag trigger is off'; }
  else if (s.hookRunning) { status.className = 'status ok'; text = `Ready. Hold ${keyName} and drag any file.`; }
  else { status.className = 'status warn'; text = 'Starting…'; }
  $('#status-text').textContent = text;
  $('#grant').hidden = !needsPerm;

  $('#triggerEnabled').checked = st.triggerEnabled;
  $('#modifier').value = st.modifier;
  $('#modifier').disabled = !st.triggerEnabled;
  if (!mac) $('#modifier option[value="alt"]').textContent = 'Alt';
  $('#shortcut').textContent = prettyShortcut(st.shortcut, mac);
  $('#output').value = st.outputMode;
  $('#outdir').textContent = st.outputMode === 'folder' && st.outputDir ? st.outputDir : 'Originals are never overwritten';
  $('#openAtLogin').checked = st.openAtLogin;
  $('#footer').textContent = `Version ${s.version} · ${s.actionCount} actions · Everything stays on this ${mac ? 'Mac' : 'computer'}`;
}

function renderJobs(jobs) {
  if (!jobs.length) return;
  $('#jobs').innerHTML = jobs.slice(0, 8).map((j) => {
    const what = j.files.length > 1 ? `${j.files.length} files` : j.files[0];
    let sub = '';
    let trailing = '';
    if (j.status === 'running') {
      sub = `<div class="progress"><i style="width:${Math.round(j.progress * 100)}%"></i></div>`;
      trailing = `${Math.round(j.progress * 100)}%`;
    } else if (j.status === 'queued') {
      sub = '<div class="row-sub">Waiting…</div>';
    } else if (j.status === 'error') {
      sub = `<div class="row-sub">${esc(j.error || 'Failed')}</div>`;
    } else {
      sub = `<div class="row-sub">${esc(j.outputs.map(basename).join(', '))}</div>`;
      trailing = `<button class="btn link" data-reveal="${esc(j.outputs[0])}">Show in ${navigator.platform.startsWith('Mac') ? 'Finder' : 'folder'}</button>`;
    }
    return `<div class="row job ${j.status}">
      <div class="glyph">${window.icon(j.status === 'error' ? 'file' : j.status === 'done' ? 'check' : j.category, 16)}</div>
      <div class="row-text"><div class="name">${esc(j.label)} <span style="color:var(--secondary)">· ${esc(what)}</span></div>${sub}</div>
      <div class="trailing">${trailing}</div>
    </div>`;
  }).join('');
}

// ---------- events ----------
const save = async (patch) => renderStatus(await window.orbital.saveSettings(patch));
$('#grant').addEventListener('click', async () => renderStatus(await window.orbital.requestPermission()));
$('#triggerEnabled').addEventListener('change', (e) => save({ triggerEnabled: e.target.checked }));
$('#modifier').addEventListener('change', (e) => save({ modifier: e.target.value }));
$('#openAtLogin').addEventListener('change', (e) => save({ openAtLogin: e.target.checked }));
$('#output').addEventListener('change', async (e) => {
  renderStatus(e.target.value === 'folder' ? await window.orbital.chooseFolder() : await window.orbital.saveSettings({ outputMode: 'same' }));
});
$('#jobs').addEventListener('click', (e) => {
  const p = e.target.closest('[data-reveal]')?.dataset.reveal;
  if (p) window.orbital.reveal(p);
});

let dragDepth = 0;
document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  window.orbital.drop(e.dataTransfer.files);
});

window.orbital.onJobs(renderJobs);
window.orbital.onStatus(renderStatus);

(async () => {
  renderStatus(await window.orbital.status());
  renderJobs(await window.orbital.jobs());
})();
