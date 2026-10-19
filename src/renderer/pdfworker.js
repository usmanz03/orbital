import * as pdfjs from '../../node_modules/pdfjs-dist/build/pdf.mjs';

const lib = new URL('../../node_modules/pdfjs-dist/', import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = new URL('build/pdf.worker.mjs', lib).href;

const open = (data) => pdfjs.getDocument({
  data,
  isEvalSupported: false,
  enableScripting: false,
  cMapUrl: new URL('cmaps/', lib).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('standard_fonts/', lib).href,
}).promise;

async function render(id, doc, { scale, format, quality }) {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, mime, quality));
    window.worker.page(id, { index: i, total: doc.numPages, width: canvas.width, height: canvas.height, data: new Uint8Array(await blob.arrayBuffer()) });
    page.cleanup();
  }
}

async function text(doc) {
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let line = '';
    const lines = [];
    for (const item of content.items) {
      line += item.str;
      if (item.hasEOL) { lines.push(line); line = ''; }
    }
    if (line) lines.push(line);
    out.push(lines.join('\n'));
  }
  return out.join('\n\n');
}

window.worker.onRun(async (id, data, request) => {
  try {
    const doc = await open(data);
    if (request.type === 'text') window.worker.done(id, await text(doc));
    else { await render(id, doc, request); window.worker.done(id, null); }
    doc.destroy();
  } catch (err) {
    window.worker.error(id, err.message || String(err));
  }
});
