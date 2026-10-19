// Renders demo/video.html frame by frame into an MP4.
//   env -u ELECTRON_RUN_AS_NODE npx electron demo/render.js                 full video
//   env -u ELECTRON_RUN_AS_NODE npx electron demo/render.js --stills 5,9.2   PNG stills for review
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app, BrowserWindow, nativeTheme } = require('electron');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const FPS = 30;
const SCALE = 2; // supersample, then downscale for smooth edges
const W = 1080; const H = 1350;
const stillsArg = process.argv.indexOf('--stills');
const stills = stillsArg > -1 ? process.argv[stillsArg + 1].split(',').map(Number) : null;

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setPath('userData', path.join(OUT, 'userdata'));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  const win = new BrowserWindow({
    width: W * SCALE, height: H * SCALE, show: false, useContentSize: true,
    webPreferences: { offscreen: true, webSecurity: false, contextIsolation: true, sandbox: false, backgroundThrottling: false,
      preload: path.join(__dirname, 'video-preload.js') },
  });
  const wc = win.webContents;
  wc.setFrameRate(60);
  wc.on('console-message', (e) => console.log('[page]', e.level, e.message, e.lineNumber));
  let pending = null;
  wc.on('paint', (_e, _dirty, image) => { if (pending) { const r = pending; pending = null; r(image); } });
  const frame = () => new Promise((resolve) => { pending = resolve; wc.invalidate(); });

  const debug = (...a) => process.env.DEBUG && console.log('[render]', ...a);
  await win.loadFile(path.join(__dirname, 'video.html'));
  debug('loaded');
  wc.setZoomFactor(SCALE);
  await wc.executeJavaScript('ready()');
  debug('ready');
  const duration = await wc.executeJavaScript('DURATION');
  const total = Math.round(duration * FPS);

  let ffmpeg = null;
  const outFile = path.join(OUT, 'orbital-demo.mp4');
  if (!stills) {
    const ffmpegPath = require(path.join(ROOT, 'node_modules/ffmpeg-static'));
    ffmpeg = spawn(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W * SCALE}x${H * SCALE}`, '-r', String(FPS), '-i', '-',
      '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-movflags', '+faststart', outFile]);
    ffmpeg.stderr.on('data', (d) => process.stderr.write(d));
  }

  const started = Date.now();
  let nextStill = 0;
  for (let f = 0; f <= total; f++) {
    const t = f / FPS;
    await wc.executeJavaScript(`renderFrame(${t})`);
    if (f < 3 || f % 30 === 0) debug('frame', f);
    if (stills) {
      if (nextStill < stills.length && t >= stills[nextStill] - 1e-6) {
        const img = await frame();
        fs.writeFileSync(path.join(OUT, `still-${stills[nextStill].toFixed(1)}.png`), img.resize({ width: W }).toPNG());
        nextStill++;
        if (nextStill === stills.length) break;
      }
      continue;
    }
    const img = await frame();
    const size = img.getSize();
    if (size.width !== W * SCALE || size.height !== H * SCALE) throw new Error(`Unexpected frame size ${size.width}x${size.height}`);
    if (!ffmpeg.stdin.write(img.toBitmap())) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  if (ffmpeg) {
    ffmpeg.stdin.end();
    await new Promise((r) => ffmpeg.on('close', r));
    console.log(`wrote ${outFile}`);
  } else {
    console.log('stills written');
  }
  app.exit(0);
});
