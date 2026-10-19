const fs = require('fs');
const path = require('path');
const { PDFDocument, degrees } = require('pdf-lib');
const { outPath, outDirFor, which, exec, kindOf } = require('./util');
const image = require('./image');

// Set by main.js: page rendering needs a Chromium window.
let renderer = null;
const setRenderer = (r) => { renderer = r; };
const needRenderer = () => {
  if (!renderer) throw new Error('PDF rendering is unavailable');
  return renderer;
};

const loadPdf = (file) => PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });

async function savePdf(doc, out) {
  fs.writeFileSync(out, await doc.save({ useObjectStreams: true }));
  return out;
}

const ghostscript = () => which(process.platform === 'win32' ? 'gswin64c' : 'gs');

module.exports = {
  setRenderer,
  hasGhostscript: () => !!ghostscript(),

  // Accepts PDFs and images in any order.
  merge: async (files) => {
    const out = await PDFDocument.create();
    for (const f of files) {
      if (kindOf(f) === 'image') await image.addImagePage(out, f);
      else {
        const src = await loadPdf(f);
        (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
      }
    }
    return savePdf(out, outPath(files[0], 'pdf', '-merged'));
  },

  split: async (file, onProgress) => {
    const src = await loadPdf(file);
    const dir = outDirFor(file, '-pages');
    const n = src.getPageCount();
    const width = String(n).length;
    for (let i = 0; i < n; i++) {
      const doc = await PDFDocument.create();
      const [page] = await doc.copyPages(src, [i]);
      doc.addPage(page);
      await savePdf(doc, path.join(dir, `page-${String(i + 1).padStart(width, '0')}.pdf`));
      onProgress?.((i + 1) / n);
    }
    return dir;
  },

  rotate: async (file, deg) => {
    const doc = await loadPdf(file);
    doc.getPages().forEach((p) => p.setRotation(degrees((p.getRotation().angle + deg) % 360)));
    return savePdf(doc, outPath(file, 'pdf', '-rotated'));
  },

  reverse: async (file) => {
    const src = await loadPdf(file);
    const doc = await PDFDocument.create();
    (await doc.copyPages(src, src.getPageIndices().reverse())).forEach((p) => doc.addPage(p));
    return savePdf(doc, outPath(file, 'pdf', '-reversed'));
  },

  removeFirstPage: async (file) => {
    const doc = await loadPdf(file);
    if (doc.getPageCount() < 2) throw new Error('PDF has only one page');
    doc.removePage(0);
    return savePdf(doc, outPath(file, 'pdf', '-trimmed'));
  },

  optimize: async (file) => savePdf(await loadPdf(file), outPath(file, 'pdf', '-optimized')),

  // Ghostscript keeps text selectable; without it we rasterise pages to JPEG.
  compress: async (file, level, onProgress) => {
    const out = outPath(file, 'pdf', `-${level}`);
    const gs = ghostscript();
    if (gs) {
      const setting = { light: '/printer', medium: '/ebook', strong: '/screen' }[level];
      await exec(gs, ['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', `-dPDFSETTINGS=${setting}`, '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${out}`, file]);
      return out;
    }
    const { scale, quality } = { light: { scale: 2, quality: 0.8 }, medium: { scale: 1.5, quality: 0.65 }, strong: { scale: 1.1, quality: 0.5 } }[level];
    const pages = await needRenderer().renderPdf(file, { scale, format: 'jpeg', quality }, onProgress);
    const doc = await PDFDocument.create();
    for (const { data, width, height } of pages) {
      const img = await doc.embedJpg(data);
      // Rendered at `scale`, so divide back down to the original point size.
      const page = doc.addPage([width / scale, height / scale]);
      page.drawImage(img, { x: 0, y: 0, width: width / scale, height: height / scale });
    }
    return savePdf(doc, out);
  },

  toImages: async (file, format, onProgress) => {
    const pages = await needRenderer().renderPdf(file, { scale: 2, format, quality: 0.92 }, onProgress);
    if (pages.length === 1) {
      const out = outPath(file, format === 'jpeg' ? 'jpg' : 'png');
      fs.writeFileSync(out, pages[0].data);
      return out;
    }
    const dir = outDirFor(file, '-images');
    const width = String(pages.length).length;
    pages.forEach(({ data }, i) => fs.writeFileSync(path.join(dir, `page-${String(i + 1).padStart(width, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`), data));
    return dir;
  },

  toText: async (file) => {
    const text = await needRenderer().pdfText(file);
    const out = outPath(file, 'txt');
    fs.writeFileSync(out, text);
    return out;
  },
};
