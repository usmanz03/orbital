// Hidden Chromium windows for the jobs Node can't do alone: printing HTML to PDF and rasterising PDFs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { BrowserWindow, ipcMain } = require('electron');

const { SECURE_PREFS } = require('./security');

// Untrusted documents are rendered here, so: sandboxed, and no scripts unless pdf.js needs them.
const hidden = (preload, { javascript = true } = {}) => new BrowserWindow({
  show: false,
  width: 1000,
  height: 1400,
  webPreferences: { ...SECURE_PREFS, preload, javascript },
});

async function htmlToPdf(html, baseDir) {
  const withBase = html.replace(/<head>/i, `<head><base href="${pathToFileURL(baseDir + path.sep).href}">`);
  const tmp = path.join(os.tmpdir(), `orbital-print-${Date.now()}.html`);
  fs.writeFileSync(tmp, withBase);
  const win = hidden(undefined, { javascript: false });
  try {
    await win.loadFile(tmp);
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } });
  } finally {
    win.destroy();
    fs.rmSync(tmp, { force: true });
  }
}

let seq = 0;
const pending = new Map();

ipcMain.on('pdfworker:page', (_e, id, page) => pending.get(id)?.onPage(page));
ipcMain.on('pdfworker:done', (_e, id, result) => pending.get(id)?.resolve(result));
ipcMain.on('pdfworker:error', (_e, id, message) => pending.get(id)?.reject(new Error(message)));

// One window per job keeps memory bounded for huge documents.
async function withWorker(file, request, onPage) {
  const win = hidden(path.join(__dirname, '..', 'preload', 'pdfworker.js'));
  const id = ++seq;
  try {
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'pdfworker.html'));
    return await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onPage: onPage || (() => {}) });
      win.webContents.send('pdfworker:run', id, fs.readFileSync(file), request);
    });
  } finally {
    pending.delete(id);
    win.destroy();
  }
}

async function renderPdf(file, { scale, format, quality }, onProgress) {
  const pages = [];
  await withWorker(file, { type: 'render', scale, format, quality }, (page) => {
    pages.push({ ...page, data: Buffer.from(page.data) });
    onProgress?.(page.index / page.total);
  });
  return pages;
}

const pdfText = (file) => withWorker(file, { type: 'text' });

module.exports = { htmlToPdf, renderPdf, pdfText };
