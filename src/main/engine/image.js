const fs = require('fs');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { ext, outPath, tmpFile, runFfmpeg, exec } = require('./util');

sharp.cache(false);

// sharp's prebuilt libvips can't decode HEIC (HEVC). macOS ships `sips`, which can.
async function load(file) {
  if (['heic', 'heif'].includes(ext(file))) {
    if (process.platform !== 'darwin') throw new Error('HEIC input is only supported on macOS');
    const tmp = tmpFile('png');
    await exec('/usr/bin/sips', ['-s', 'format', 'png', file, '--out', tmp]);
    const buf = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    return sharp(buf);
  }
  return sharp(file).rotate(); // .rotate() applies EXIF orientation
}

const sameFormat = (file) => {
  const e = ext(file);
  if (e === 'jpeg') return 'jpg';
  if (['png', 'jpg', 'webp', 'avif', 'tiff', 'tif', 'gif'].includes(e)) return e === 'tif' ? 'tiff' : e;
  return 'jpg';
};

function encode(img, format, quality) {
  switch (format) {
    case 'jpg': return img.flatten({ background: '#ffffff' }).jpeg({ quality: quality ?? 90, mozjpeg: true });
    case 'png': return quality ? img.png({ palette: true, quality, effort: 8, compressionLevel: 9 }) : img.png({ compressionLevel: 9 });
    case 'webp': return img.webp({ quality: quality ?? 85, effort: 5 });
    case 'avif': return img.avif({ quality: quality ?? 55, effort: 5 });
    case 'tiff': return img.tiff({ quality: quality ?? 90, compression: 'lzw' });
    case 'gif': return img.gif({ effort: 8 });
    default: throw new Error(`Unsupported image format ${format}`);
  }
}

async function save(file, img, format, suffix, quality) {
  const out = outPath(file, format, suffix);
  await encode(img, format, quality).toFile(out);
  return out;
}

// --- ICO: PNG-in-ICO container (supported since Vista) ---
async function toIco(file) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map(async (s) =>
    (await load(file)).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  const out = outPath(file, 'ico');
  fs.writeFileSync(out, Buffer.concat([header, ...pngs]));
  return out;
}

async function addImagePage(pdf, file) {
  const jpg = await (await load(file)).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
  const embedded = await pdf.embedJpg(jpg);
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
}

async function toPdf(files, outFile) {
  const pdf = await PDFDocument.create();
  for (const f of files) await addImagePage(pdf, f);
  const out = outFile || outPath(files[0], 'pdf');
  fs.writeFileSync(out, await pdf.save());
  return out;
}

async function stitch(files, direction) {
  const metas = await Promise.all(files.map(async (f) => (await load(f)).toBuffer({ resolveWithObject: true })));
  // Normalise to a common height (horizontal) or width (vertical).
  const target = Math.min(...metas.map(({ info }) => (direction === 'h' ? info.height : info.width)));
  const parts = await Promise.all(metas.map(({ data }) =>
    sharp(data).resize(direction === 'h' ? { height: target } : { width: target }).png().toBuffer({ resolveWithObject: true })));
  const total = parts.reduce((sum, p) => sum + (direction === 'h' ? p.info.width : p.info.height), 0);
  let cursor = 0;
  const composites = parts.map((p) => {
    const c = { input: p.data, left: direction === 'h' ? cursor : 0, top: direction === 'h' ? 0 : cursor };
    cursor += direction === 'h' ? p.info.width : p.info.height;
    return c;
  });
  const canvas = sharp({
    create: {
      width: direction === 'h' ? total : target,
      height: direction === 'h' ? target : total,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).composite(composites);
  const out = outPath(files[0], 'png', direction === 'h' ? '-stitched' : '-stacked');
  await canvas.png().toFile(out);
  return out;
}

async function animatedGif(files) {
  // Normalise frames through sharp, then let ffmpeg build a palette-optimised GIF.
  const frames = [];
  const first = await (await load(files[0])).metadata();
  const width = Math.min(first.width || 800, 800);
  for (const f of files) {
    const tmp = tmpFile('png');
    await (await load(f)).resize({ width, height: Math.round(width * (first.height / first.width)), fit: 'contain', background: '#ffffff' }).png().toFile(tmp);
    frames.push(tmp);
  }
  const list = tmpFile('txt');
  // Concat lists treat backslashes as escapes, so Windows paths need forward slashes.
  const entry = (f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
  fs.writeFileSync(list, frames.map((f) => `${entry(f)}\nduration 0.5`).join('\n') + `\n${entry(frames[frames.length - 1])}\n`);
  const out = outPath(files[0], 'gif', '-animated');
  try {
    await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0', out]);
  } finally {
    [list, ...frames].forEach((f) => fs.rmSync(f, { force: true }));
  }
  return out;
}

const RATIOS = { '1:1': [1, 1], '4:5': [4, 5], '16:9': [16, 9], '9:16': [9, 16], '4:3': [4, 3], '3:2': [3, 2], '2:1': [2, 1] };

module.exports = {
  load,
  sameFormat,
  convert: async (file, format) => {
    if (format === 'ico') return toIco(file);
    if (format === 'pdf') return toPdf([file]);
    if (format === 'bmp') {
      const tmp = tmpFile('png');
      await (await load(file)).png().toFile(tmp);
      const out = outPath(file, 'bmp');
      try { await runFfmpeg(['-i', tmp, out]); } finally { fs.rmSync(tmp, { force: true }); }
      return out;
    }
    return save(file, await load(file), format);
  },
  compress: async (file, level, format) => {
    const q = { light: 80, medium: 62, strong: 42 }[level];
    let fmt = format || sameFormat(file);
    if (fmt === 'tiff' || fmt === 'gif') fmt = 'jpg';
    return save(file, await load(file), fmt, `-${level}`, fmt === 'avif' ? Math.round(q * 0.7) : q);
  },
  resizePercent: async (file, pct) => {
    const img = await load(file);
    const { width } = await img.clone().metadata();
    return save(file, img.resize({ width: Math.max(1, Math.round((width * pct) / 100)) }), sameFormat(file), `-${pct}pct`);
  },
  resizeWidth: async (file, w) =>
    save(file, (await load(file)).resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true }), sameFormat(file), `-${w}px`),
  crop: async (file, ratio) => {
    const [rw, rh] = RATIOS[ratio];
    const img = await load(file);
    const buf = await img.toBuffer({ resolveWithObject: true });
    const { width, height } = buf.info;
    let w = width;
    let h = Math.round((width * rh) / rw);
    if (h > height) { h = height; w = Math.round((height * rw) / rh); }
    const out = sharp(buf.data).resize(w, h, { fit: 'cover', position: sharp.strategy.attention });
    return save(file, out, sameFormat(file), `-${ratio.replace(':', 'x')}`);
  },
  cropRect: async (file, { left, top, width, height }) => {
    const buf = await (await load(file)).toBuffer({ resolveWithObject: true });
    const r = (v) => Math.max(0, Math.round(v));
    const box = { left: r(left), top: r(top), width: Math.min(r(width), buf.info.width - r(left)), height: Math.min(r(height), buf.info.height - r(top)) };
    return save(file, sharp(buf.data).extract(box), sameFormat(file), '-cropped');
  },
  // Downscaled PNG for the crop editor; Chromium can't show TIFF/HEIC/etc.
  preview: async (file) => {
    const { data, info } = await (await load(file)).toBuffer({ resolveWithObject: true });
    const png = await sharp(data).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    return { dataUrl: `data:image/png;base64,${png.toString('base64')}`, width: info.width, height: info.height };
  },
  edit: async (file, op) => {
    let img = await load(file);
    const ops = {
      rotateCw: () => img.rotate(90),
      rotateCcw: () => img.rotate(-90),
      rotate180: () => img.rotate(180),
      flipH: () => img.flop(),
      flipV: () => img.flip(),
      grayscale: () => img.grayscale(),
      invert: () => img.negate({ alpha: false }),
      sharpen: () => img.sharpen({ sigma: 1.2 }),
      blur: () => img.blur(8),
      trim: () => img.trim({ threshold: 12 }),
      strip: () => img, // sharp drops metadata unless .keepMetadata() is called
    };
    img = ops[op]();
    return save(file, img, sameFormat(file), `-${op}`);
  },
  toPdf,
  addImagePage,
  stitch,
  animatedGif,
};
