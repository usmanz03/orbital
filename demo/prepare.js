// Builds everything the demo video needs from the real assets and real conversion results.
// Usage: env -u ELECTRON_RUN_AS_NODE npx electron demo/prepare.js   (after run-conversions.js)
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(__dirname, 'assets');
const RESULTS = path.join(__dirname, 'out', 'results');
const MEDIA = path.join(__dirname, 'out', 'media');
app.setPath('userData', path.join(__dirname, 'out', 'userdata'));
app.on('window-all-closed', () => {});

const sharp = require(path.join(ROOT, 'node_modules/sharp'));
const { runFfmpeg, kindOf } = require(path.join(ROOT, 'src/main/engine/util'));
const image = require(path.join(ROOT, 'src/main/engine/image'));
const media = require(path.join(ROOT, 'src/main/engine/media'));
const { probe } = require(path.join(ROOT, 'src/main/engine/util'));
const catalog = require(path.join(ROOT, 'src/main/catalog'));

const A = (n) => path.join(ASSETS, n);
const M = (n) => path.join(MEDIA, n);
const R = (n) => path.join(RESULTS, n);
const mb = (b) => (b < 1e6 ? `${Math.round(b / 1e3)} KB` : `${(b / 1e6).toFixed(1)} MB`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function thumb(src, out, width, opts = {}) {
  await sharp(src).rotate().resize({ width, height: opts.height, fit: opts.fit || 'inside' }).jpeg({ quality: 88 }).toFile(M(out));
  return out;
}

// Real editor windows rendered off-screen at 2x.
async function captureEditor(kind, file, script, out) {
  const win = new BrowserWindow({
    width: 1800, height: kind === 'crop' ? 1440 : 1240, show: false,
    webPreferences: { preload: path.join(ROOT, 'src/preload/editor.js'), contextIsolation: true, sandbox: false, offscreen: true },
  });
  win.webContents.setFrameRate(30);
  let last = null;
  win.webContents.on('paint', (_e, _d, img) => { last = img; });
  await win.loadFile(path.join(ROOT, 'src/renderer/editor.html'), { query: { kind, file } });
  win.webContents.setZoomFactor(2);
  await wait(4000);
  if (script) await win.webContents.executeJavaScript(script);
  await wait(1500);
  win.webContents.invalidate();
  await wait(500);
  fs.writeFileSync(M(out), last.toPNG());
  win.destroy();
}

ipcMain.handle('editor:load', async (_e, kind, file) => {
  if (kind === 'crop') return { kind, file, name: path.basename(file), ...(await image.preview(file)) };
  const info = await probe(file);
  return { kind, file, name: path.basename(file), url: pathToFileURL(file).href, isVideo: true,
    strip: `data:image/png;base64,${(await media.filmstrip(file, 14, 90)).toString('base64')}`, ...info };
});

app.whenReady().then(async () => {
  fs.mkdirSync(MEDIA, { recursive: true });
  const renderHost = require(path.join(ROOT, 'src/main/render-host'));

  // Thumbnails and stills
  await thumb(A('Blue Marble.jpg'), 'blue-marble.jpg', 900);
  await thumb(A('Earthset from Orion.jpg'), 'earthset.jpg', 1600);
  await thumb(A('Cosmic Cliffs.jpg'), 'cliffs.jpg', 1200);
  await thumb(R('Earthset from Orion-4x5.jpg'), 'earthset-4x5.jpg', 800);
  await thumb(R('Blue Marble-1920px.jpg'), 'blue-marble-1920.jpg', 900);
  await runFfmpeg(['-ss', '52', '-i', A('Artemis I Launch.mp4'), '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '2', M('launch-frame.jpg')]);
  // Short liftoff clip with every frame a keyframe, so the renderer can seek instantly.
  await runFfmpeg(['-ss', '40', '-t', '24', '-i', A('Artemis I Launch.mp4'), '-an', '-vf', 'scale=1280:-2',
    '-c:v', 'libx264', '-g', '1', '-crf', '18', '-pix_fmt', 'yuv420p', M('launch-clip.mp4')]);
  fs.mkdirSync(M('clip'), { recursive: true });
  fs.copyFileSync(M('launch-clip.mp4'), M('clip/Artemis I Launch.mp4'));
  for (const n of ['01', '02', '03', '05', '08']) {
    await thumb(R(`Artemis I Press Kit-images/page-${n}.png`), `presskit-${n}.jpg`, 700);
  }
  const docPages = await renderHost.renderPdf(R('WBS Handbook.pdf'), { scale: 1.6, format: 'jpeg', quality: 0.9 });
  for (const i of [0, 1, 4]) fs.writeFileSync(M(`wbs-${i + 1}.jpg`), docPages[i].data);
  fs.writeFileSync(M('wave.png'), await media.waveform(R('Mars Habitat Audio Log-trimmed.mp3'), '#ffffff'));
  fs.writeFileSync(M('app-icon.png'), fs.readFileSync(path.join(ROOT, 'assets/icon-256.png')));
  await sharp(path.join(ROOT, 'build/icon.png')).resize(512).png().toFile(M('app-icon-512.png'));

  // Hub thumbnails as the real app would show them.
  const hubThumb = async (file) => {
    try { return (await nativeImage.createThumbnailFromPath(file, { width: 160, height: 160 })).toDataURL(); } catch { return null; }
  };

  // Real editors with real files
  await captureEditor('trim', M('clip/Artemis I Launch.mp4'), `
    const s = document.querySelector('#t-start'); s.value = '0:03.00'; s.dispatchEvent(new Event('change'));
    const e = document.querySelector('#t-end'); e.value = '0:15.50'; e.dispatchEvent(new Event('change'));
    document.querySelector('#media').currentTime = 9;`, 'editor-trim.png');
  await captureEditor('crop', A('Earthset from Orion.jpg'), `document.querySelector('#ratios button[data-i="3"]').click();`, 'editor-crop.png');

  // Files, menus and results the video shows
  const files = {
    blueMarble: A('Blue Marble.jpg'),
    earthset: A('Earthset from Orion.jpg'),
    cliffs: A('Cosmic Cliffs.jpg'),
    launch: A('Artemis I Launch.mp4'),
    audio: A('Mars Habitat Audio Log.mp3'),
    presskit: A('Artemis I Press Kit.pdf'),
    wbs: A('WBS Handbook.docx'),
  };
  const info = {};
  for (const [key, file] of Object.entries(files)) {
    const bytes = fs.statSync(file).size;
    info[key] = {
      name: path.basename(file),
      detail: `${path.extname(file).slice(1).toUpperCase()} · ${mb(bytes)}`,
      bytes,
      kind: kindOf(file),
      thumb: await hubThumb(file),
      menu: catalog.menuFor([file]),
    };
  }
  const three = [files.blueMarble, files.earthset, files.cliffs];
  info.three = { name: '3 files', detail: `3 files · ${mb(three.reduce((s, f) => s + fs.statSync(f).size, 0))}`, thumb: info.blueMarble.thumb, menu: catalog.menuFor(three) };
  const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'results.json'), 'utf8'));
  const data = { info, results: Object.fromEntries(results.map((r) => [r.id, r])), actionCount: catalog.total, docPages: docPages.length };
  fs.writeFileSync(M('data.json'), JSON.stringify(data, null, 2));
  console.log('prepared', fs.readdirSync(MEDIA).join(', '));
  app.exit(0);
});
