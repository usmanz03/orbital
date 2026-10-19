// ORBITAL_SELFTEST=<outdir> npx electron scripts/electron-selftest.js
// Exercises the actions that need Chromium, then screenshots the overlay, home and editors.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const out = process.env.ORBITAL_SELFTEST || path.join(require('os').tmpdir(), 'orbital-selftest');
fs.mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (win, name) => fs.writeFileSync(path.join(out, name), (await win.webContents.capturePage()).toPNG());

// Load the real app (registers IPC, creates tray + overlay).
const main = require('../src/main/main');

app.whenReady().then(async () => {
  await wait(800);
  const { byId } = require('../src/main/catalog');
  const { setOutputDir, runFfmpeg } = require('../src/main/engine/util');
  setOutputDir(out);

  const pdfFile = path.join(out, 'sample.pdf');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 2; i++) {
    const page = doc.addPage([595, 842]);
    page.drawRectangle({ x: 40, y: 600, width: 515, height: 200, color: rgb(0.49, 0.36, 1) });
    page.drawText(`Orbital page ${i}`, { x: 60, y: 700, size: 36, font, color: rgb(1, 1, 1) });
  }
  fs.writeFileSync(pdfFile, await doc.save());
  const md = path.join(out, 'readme.md');
  fs.writeFileSync(md, '# Orbital\n\nConverted **locally**.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  const video = path.join(out, 'clip.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  const photo = path.join(out, 'photo.png');
  await require('sharp')({ create: { width: 1600, height: 1000, channels: 3, background: '#2d6cdf' } }).png().toFile(photo);

  const results = [];
  for (const [id, input] of [['pdf.png', pdfFile], ['pdf.jpg', pdfFile], ['pdf.txt', pdfFile], ['pdf.compress.medium', pdfFile], ['doc.pdf', md]]) {
    try {
      const r = await byId.get(id).run(input, () => {});
      results.push(`ok   ${id} -> ${path.basename(r)}`);
    } catch (e) {
      results.push(`FAIL ${id}: ${e.message}`);
    }
  }
  try {
    const r = await byId.get('doc.merge.pdf').run([md, md], () => {});
    results.push(`ok   doc.merge.pdf -> ${path.basename(r)}`);
  } catch (e) { results.push(`FAIL doc.merge.pdf: ${e.message}`); }

  // Screenshots
  main.showOverlay('menu', [photo]);
  await wait(900);
  const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('overlay.html'));
  await shot(overlay, 'overlay-image.png');
  overlay.webContents.sendInputEvent({ type: 'mouseMove', x: 320 + 100, y: 320 - 30 });
  await wait(300);
  overlay.webContents.sendInputEvent({ type: 'mouseMove', x: 320 + 210, y: 320 - 40 });
  await wait(400);
  await shot(overlay, 'overlay-hover.png');
  main.showOverlay('menu', [video]);
  await wait(500);
  overlay.focus();
  for (const ch of 'gif') {
    overlay.webContents.sendInputEvent({ type: 'keyDown', keyCode: ch });
    overlay.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    overlay.webContents.sendInputEvent({ type: 'keyUp', keyCode: ch });
  }
  await wait(400);
  await shot(overlay, 'overlay-search.png');
  main.showOverlay('menu', [pdfFile, photo]);
  await wait(500);
  await shot(overlay, 'overlay-multi.png');
  main.showOverlay('hub');
  await wait(500);
  await shot(overlay, 'overlay-hub.png');

  const home = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home.html'));
  if (home) { await wait(500); await shot(home, 'home.png'); }

  const { ipcMain } = require('electron');
  ipcMain.emit('overlay:run', {}, 'img.crop.custom', [photo]);
  await wait(1500);
  console.log('windows:', BrowserWindow.getAllWindows().map((w) => w.webContents.getURL().split('/').pop()));
  const cropWin = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('editor.html'));
  if (cropWin) await shot(cropWin, 'editor-crop.png');
  ipcMain.emit('overlay:run', {}, 'media.trim', [video]);
  await wait(3000);
  const trimWin = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('editor.html'));
  if (trimWin) await shot(trimWin, 'editor-trim.png');

  console.log(results.join('\n'));
  console.log(`Screenshots in ${out}`);
  app.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
});
