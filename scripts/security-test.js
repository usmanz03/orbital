// Attacks Orbital with hostile inputs and checks nothing leaks.
// Usage: env -u ELECTRON_RUN_AS_NODE npx electron scripts/security-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-sec-'));
app.setPath('userData', path.join(dir, 'userdata'));
app.on('window-all-closed', () => {});

const { SECURE_PREFS, lockDown } = require(path.join(ROOT, 'src/main/security'));
const renderHost = require(path.join(ROOT, 'src/main/render-host'));
require(path.join(ROOT, 'src/main/engine/pdf')).setRenderer(renderHost);
require(path.join(ROOT, 'src/main/engine/doc')).setRenderer(renderHost);
const util = require(path.join(ROOT, 'src/main/engine/util'));
const doc = require(path.join(ROOT, 'src/main/engine/doc'));
const media = require(path.join(ROOT, 'src/main/engine/media'));
const pdf = require(path.join(ROOT, 'src/main/engine/pdf'));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  lockDown();
  util.setOutputDir(dir);
  // The "attacker" server: any hit means something leaked.
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); res.end('x'); }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const secret = path.join(dir, 'secret.txt');
  fs.writeFileSync(secret, 'TOP-SECRET-CONTENT');

  // 1. Hostile HTML → PDF
  const html = path.join(dir, 'evil.html');
  fs.writeFileSync(html, `<html><head><link rel="stylesheet" href="${base}/css"><script src="${base}/js"></script></head><body>
    <h1 id="h">Original text</h1><img src="${base}/pixel.png"><iframe src="${base}/frame"></iframe>
    <script>document.getElementById('h').textContent='SCRIPT RAN'; fetch('${base}/fetch'); location='${base}/nav';</script></body></html>`);
  const htmlPdf = await doc.toPdf(html);
  const htmlText = await renderHost.pdfText(htmlPdf);
  check('HTML scripts do not run', htmlText.includes('Original text') && !htmlText.includes('SCRIPT RAN'));

  // 2. Hostile Markdown → PDF and → HTML
  const md = path.join(dir, 'evil.md');
  fs.writeFileSync(md, `# Hello\n\n![x](${base}/md-image.png)\n\n<script>fetch('${base}/md-fetch')</script>\n<img src="${base}/md-raw.png">\n`);
  await doc.toPdf(md);
  check('Markdown converted to PDF', true);

  // 3. HLS playlist disguised as .mp4, pointing at the server and a local file
  const evil = path.join(dir, 'holiday.mp4');
  fs.writeFileSync(evil, `#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\n${base}/hls-segment.ts\n#EXTINF:10.0,\nfile://${secret}\n#EXT-X-ENDLIST\n`);
  let converted = null;
  try { converted = await media.convertVideo(evil, 'mp4', () => {}); } catch { /* expected */ }
  try { await media.toAudio(evil, 'mp3', () => {}); } catch { /* expected */ }
  await util.probe(evil);
  check('Disguised playlist is refused by ffmpeg', !converted);

  // 4. PDF rendering still works in the sandboxed worker
  const { PDFDocument, StandardFonts } = require(path.join(ROOT, 'node_modules/pdf-lib'));
  const p = await PDFDocument.create();
  p.addPage().drawText('Sandboxed render', { x: 50, y: 700, size: 24, font: await p.embedFont(StandardFonts.Helvetica) });
  const pdfFile = path.join(dir, 'ok.pdf');
  fs.writeFileSync(pdfFile, await p.save());
  const png = await pdf.toImages(pdfFile, 'png', () => {});
  check('PDF → PNG works in sandbox', fs.existsSync(png));

  // 5. Sandboxed app windows: preload bridges still load; navigation is blocked
  for (const [preload, page] of [['overlay.js', 'overlay.html'], ['home.js', 'home.html'], ['editor.js', 'editor.html']]) {
    const win = new BrowserWindow({ show: false, webPreferences: { ...SECURE_PREFS, preload: path.join(ROOT, 'src/preload', preload) } });
    await win.loadFile(path.join(ROOT, 'src/renderer', page)).catch(() => {});
    const bridge = await win.webContents.executeJavaScript('typeof window.orbital === "object" && typeof require === "undefined"');
    check(`${page}: sandboxed, bridge available`, bridge);
    if (page === 'home.html') {
      await win.webContents.executeJavaScript(`location.href='${base}/navigate'; window.open('${base}/popup');`).catch(() => {});
      await wait(800);
      check('Navigation to the web is blocked', win.webContents.getURL().startsWith('file:'));
    }
    win.destroy();
  }

  await wait(1000);
  check('Nothing reached the network', hits.length === 0, hits.length ? hits.join(', ') : 'attacker server saw 0 requests');
  server.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  app.exit(results.every(Boolean) ? 0 : 1);
});
