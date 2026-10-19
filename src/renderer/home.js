const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const MOD_LABEL = { shift: '⇧ Shift', alt: '⌥ Option', ctrl: '⌃ Control' };
let status = null;

function prettyShortcut(acc, mac) {
  return acc.split('+').map((k) => ({
    CommandOrControl: mac ? '⌘' : 'Ctrl', Shift: mac ? '⇧' : 'Shift', Alt: mac ? '⌥' : 'Alt', Control: mac ? '⌃' : 'Ctrl', Space: 'Space',
  })[k] || k).join(mac ? '' : '+');
}

function renderStatus(s) {
  status = s;
  const mac = s.platform === 'darwin';
  document.body.classList.toggle('not-mac', !mac);
  const pill = $('#pill');
  const needsPerm = !s.permission && s.hookSupported;
  if (s.hookRunning) { pill.textContent = '● Shift-drag active'; pill.className = 'pill ok'; }
  else if (!s.hookSupported) { pill.textContent = 'Shortcut mode (Wayland)'; pill.className = 'pill warn'; }
  else if (needsPerm) { pill.textContent = 'Needs permission'; pill.className = 'pill warn'; }
  else { pill.textContent = 'Trigger paused'; pill.className = 'pill warn'; }
  $('#permission').hidden = !needsPerm;

  const st = s.settings;
  $('#mod-key').textContent = mac ? MOD_LABEL[st.modifier] : MOD_LABEL[st.modifier].replace('Option', 'Alt').slice(2);
  $('#shortcut').textContent = prettyShortcut(st.shortcut, mac);
  $('#modifier').value = st.modifier;
  $('#triggerEnabled').checked = st.triggerEnabled;
  $('#openAtLogin').checked = st.openAtLogin;
  document.querySelectorAll('[data-out]').forEach((b) => b.classList.toggle('on', b.dataset.out === st.outputMode));
  $('#outdir').textContent = st.outputMode === 'folder' && st.outputDir ? st.outputDir : 'Next to the original file';
  $('#version').textContent = `v${s.version} · ${s.actionCount} actions`;
  if (!mac) document.querySelector('#modifier option[value="alt"]').textContent = 'Alt';
}

const STATE_TEXT = { queued: 'Queued', running: '', done: 'Done', error: 'Failed' };
function renderJobs(jobs) {
  const ul = $('#jobs');
  if (!jobs.length) return;
  ul.innerHTML = jobs.map((j) => `
    <li class="job ${j.status}">
      <div class="ic">${window.icon(j.category, 18)}</div>
      <div style="min-width:0">
        <div class="name">${esc(j.label)} · ${esc(j.files.length > 1 ? `${j.files.length} files` : j.files[0])}</div>
        ${j.status === 'running' ? `<div class="bar"><i style="width:${Math.round(j.progress * 100)}%"></i></div>`
          : `<div class="sub">${esc(j.status === 'error' ? j.error : j.outputs.map((o) => o.split(/[\\/]/).pop()).join(', '))}</div>`}
      </div>
      <div class="state">${j.status === 'done' ? `<button class="link" data-reveal="${esc(j.outputs[0])}">Show</button>`
        : j.status === 'running' ? `${Math.round(j.progress * 100)}%` : STATE_TEXT[j.status]}</div>
    </li>`).join('');
}

async function renderCatalog() {
  const cats = await window.orbital.catalog();
  const kindsLabel = { image: 'Images', video: 'Video', audio: 'Audio', pdf: 'PDF', doc: 'Docs', data: 'Data' };
  $('#catalog').innerHTML = cats.map((c) => {
    const kinds = [...new Set(c.items.flatMap((i) => i.kinds))].map((k) => kindsLabel[k]).join(', ');
    const sample = [...new Set(c.items.map((i) => i.label))].slice(0, 7).join(' · ');
    return `<div class="cat"><div class="ic">${window.icon(c.id === 'audio' ? 'audio' : c.id)}</div>
      <div><b>${esc(c.label)} <span>(${c.items.length})</span></b><span>${esc(kinds)}<br>${esc(sample)}…</span></div></div>`;
  }).join('');
  $('#count').textContent = `· ${cats.reduce((n, c) => n + c.items.length, 0)} actions`;
}

// ---------- events ----------
$('#grant').addEventListener('click', async () => renderStatus(await window.orbital.requestPermission()));
$('#modifier').addEventListener('change', async (e) => renderStatus(await window.orbital.saveSettings({ modifier: e.target.value })));
$('#triggerEnabled').addEventListener('change', async (e) => renderStatus(await window.orbital.saveSettings({ triggerEnabled: e.target.checked })));
$('#openAtLogin').addEventListener('change', async (e) => renderStatus(await window.orbital.saveSettings({ openAtLogin: e.target.checked })));
document.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', async () => {
  renderStatus(b.dataset.out === 'folder' ? await window.orbital.chooseFolder() : await window.orbital.saveSettings({ outputMode: 'same' }));
}));
$('#jobs').addEventListener('click', (e) => {
  const p = e.target.closest('[data-reveal]')?.dataset.reveal;
  if (p) window.orbital.reveal(p);
});

const drop = $('#drop');
['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => {
  e.preventDefault();
  if (t === 'drop' || !e.relatedTarget) drop.classList.remove('over');
}));
document.addEventListener('drop', (e) => window.orbital.drop(e.dataTransfer.files));

window.orbital.onJobs(renderJobs);
window.orbital.onStatus(renderStatus);

(async () => {
  renderStatus(await window.orbital.status());
  renderJobs(await window.orbital.jobs());
  renderCatalog();
  if (!status.settings.onboarded) window.orbital.saveSettings({ onboarded: true });
})();
