const { kindOf, ext } = require('./engine/util');
const image = require('./engine/image');
const media = require('./engine/media');
const pdf = require('./engine/pdf');
const doc = require('./engine/doc');

// Categories form the inner ring; actions in a category form the outer ring (keep each <= 12).
const CATEGORIES = {
  convert: { label: 'Convert', icon: 'convert' },
  audio: { label: 'Audio', icon: 'audio' },
  compress: { label: 'Compress', icon: 'compress' },
  resize: { label: 'Resize', icon: 'resize' },
  crop: { label: 'Crop', icon: 'crop' },
  trim: { label: 'Trim', icon: 'trim' },
  edit: { label: 'Edit', icon: 'edit' },
  pages: { label: 'Pages', icon: 'pages' },
  export: { label: 'Export', icon: 'export' },
  merge: { label: 'Merge', icon: 'merge' },
};

const actions = [];
// mode: 'each' runs once per file; 'all' receives the whole selection (merges); 'ui' opens an editor window.
const add = (cat, kinds, id, label, run, opts = {}) => actions.push({ cat, kinds, id, label, run, mode: 'each', ...opts });

// ---------- Images ----------
const IMG = ['image'];
for (const [f, label] of [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP'], ['avif', 'AVIF'], ['gif', 'GIF'], ['tiff', 'TIFF'], ['bmp', 'BMP'], ['ico', 'ICO icon'], ['pdf', 'PDF']]) {
  add('convert', IMG, `img.to.${f}`, label, (file) => image.convert(file, f), { skipExt: f === 'jpg' ? ['jpg', 'jpeg'] : f === 'tiff' ? ['tif', 'tiff'] : [f] });
}
for (const lvl of ['light', 'medium', 'strong']) add('compress', IMG, `img.compress.${lvl}`, cap(lvl), (f) => image.compress(f, lvl));
add('compress', IMG, 'img.compress.webp', 'Smallest (WebP)', (f) => image.compress(f, 'medium', 'webp'));
for (const p of [25, 50, 75]) add('resize', IMG, `img.resize.${p}`, `${p}%`, (f) => image.resizePercent(f, p));
for (const w of [3840, 1920, 1280, 1080, 800, 512, 256]) add('resize', IMG, `img.resize.w${w}`, `${w}px`, (f) => image.resizeWidth(f, w));
for (const r of ['1:1', '4:5', '16:9', '9:16', '4:3', '3:2', '2:1']) add('crop', IMG, `img.crop.${r}`, r, (f) => image.crop(f, r), { hint: 'Smart crop' });
add('crop', IMG, 'img.crop.trim', 'Trim borders', (f) => image.edit(f, 'trim'));
add('crop', IMG, 'img.crop.custom', 'Crop…', null, { mode: 'ui', ui: 'crop' });
for (const [op, label] of [['rotateCw', 'Rotate ↻'], ['rotateCcw', 'Rotate ↺'], ['rotate180', 'Rotate 180°'], ['flipH', 'Flip ↔'], ['flipV', 'Flip ↕'],
  ['grayscale', 'Grayscale'], ['invert', 'Invert'], ['sharpen', 'Sharpen'], ['blur', 'Blur'], ['strip', 'Strip metadata']]) {
  add('edit', IMG, `img.edit.${op}`, label, (f) => image.edit(f, op));
}
add('merge', IMG, 'img.merge.pdf', 'Into one PDF', (files) => image.toPdf(files), { mode: 'all', min: 2 });
add('merge', IMG, 'img.merge.h', 'Side by side', (files) => image.stitch(files, 'h'), { mode: 'all', min: 2 });
add('merge', IMG, 'img.merge.v', 'Stacked', (files) => image.stitch(files, 'v'), { mode: 'all', min: 2 });
add('merge', IMG, 'img.merge.gif', 'Animated GIF', (files) => image.animatedGif(files), { mode: 'all', min: 2 });

// ---------- Video ----------
const VID = ['video'];
for (const [f, label] of [['mp4', 'MP4'], ['hevc', 'MP4 (HEVC)'], ['webm', 'WebM'], ['mov', 'MOV'], ['mkv', 'MKV'], ['avi', 'AVI']]) {
  add('convert', VID, `vid.to.${f}`, label, (file, p) => media.convertVideo(file, f, p), { skipExt: f === 'hevc' ? [] : [f] });
}
add('convert', VID, 'vid.to.gif', 'GIF', (f, p) => media.toGif(f, p));
add('convert', VID, 'vid.to.gifhq', 'GIF (HD)', (f, p) => media.toGif(f, p, 720, 15));
add('convert', VID, 'vid.thumb', 'Thumbnail', (f) => media.thumbnail(f));
for (const [f, label] of [['mp3', 'MP3'], ['m4a', 'M4A'], ['wav', 'WAV'], ['flac', 'FLAC'], ['opus', 'Opus']]) {
  add('audio', VID, `vid.audio.${f}`, label, (file, p) => media.toAudio(file, f, p), { hint: 'Extract audio' });
}
for (const lvl of ['light', 'medium', 'strong']) add('compress', VID, `vid.compress.${lvl}`, cap(lvl), (f, p) => media.compressVideo(f, lvl, p));
for (const mb of [8, 25, 50, 100]) add('compress', VID, `vid.compress.${mb}mb`, `Under ${mb} MB`, (f, p) => media.compressToSize(f, mb, p));
for (const h of [2160, 1080, 720, 480, 360]) add('resize', VID, `vid.resize.${h}`, h === 2160 ? '4K' : `${h}p`, (f, p) => media.resizeVideo(f, h, p));
for (const r of ['1:1', '9:16', '16:9', '4:5']) add('crop', VID, `vid.crop.${r}`, r, (f, p) => media.cropVideo(f, r, p), { hint: 'Centre crop' });
add('trim', [...VID, 'audio'], 'media.trim', 'Trim…', null, { mode: 'ui', ui: 'trim' });
for (const s of [15, 30, 60]) add('trim', [...VID, 'audio'], `media.first${s}`, `First ${s}s`, (f, p) => media.trim(f, 0, s, p));
for (const [op, label] of [['mute', 'Mute'], ['rotateCw', 'Rotate ↻'], ['rotateCcw', 'Rotate ↺'], ['flipH', 'Mirror'], ['speed2', 'Speed 2×'],
  ['speedHalf', 'Slow 0.5×'], ['reverse', 'Reverse'], ['grayscale', 'Grayscale'], ['stabilize', 'Stabilize']]) {
  add('edit', VID, `vid.edit.${op}`, label, (f, p) => media.editVideo(f, op, p));
}
add('merge', VID, 'vid.merge', 'Join videos', (files, p) => media.mergeVideos(files, p), { mode: 'all', min: 2 });

// ---------- Audio ----------
const AUD = ['audio'];
for (const [f, label] of [['mp3', 'MP3 320k'], ['mp3_192', 'MP3 192k'], ['m4a', 'M4A'], ['wav', 'WAV'], ['flac', 'FLAC'], ['ogg', 'OGG'], ['opus', 'Opus'], ['aiff', 'AIFF']]) {
  add('convert', AUD, `aud.to.${f}`, label, (file, p) => media.toAudio(file, f, p), { skipExt: f.includes('_') ? [] : [f] });
}
add('compress', AUD, 'aud.compress.128', 'MP3 128k', (f, p) => media.toAudio(f, 'mp3_128', p));
add('compress', AUD, 'aud.compress.voice', 'Voice (64k mono)', (f, p) => media.toAudio(f, 'mp3_voice', p));
add('compress', AUD, 'aud.compress.opus', 'Opus 64k', (f, p) => media.toAudio(f, 'opus_64', p));
for (const [op, label] of [['normalize', 'Normalize'], ['removeSilence', 'Cut silence'], ['mono', 'Mono'], ['fade', 'Fade in/out'], ['speed125', '1.25×'],
  ['speed15', '1.5×'], ['speed2', '2×'], ['slow', '0.75×'], ['reverse', 'Reverse']]) {
  add('edit', AUD, `aud.edit.${op}`, label, (f, p) => media.editAudio(f, op, p));
}
add('merge', AUD, 'aud.merge', 'Join audio', (files, p) => media.mergeAudio(files, p), { mode: 'all', min: 2 });

// ---------- PDF ----------
const PDF = ['pdf'];
add('export', PDF, 'pdf.png', 'PNG pages', (f, p) => pdf.toImages(f, 'png', p));
add('export', PDF, 'pdf.jpg', 'JPG pages', (f, p) => pdf.toImages(f, 'jpeg', p));
add('export', PDF, 'pdf.txt', 'Text', (f) => pdf.toText(f));
for (const lvl of ['light', 'medium', 'strong']) add('compress', PDF, `pdf.compress.${lvl}`, cap(lvl), (f, p) => pdf.compress(f, lvl, p));
add('compress', PDF, 'pdf.optimize', 'Lossless', (f) => pdf.optimize(f));
add('pages', PDF, 'pdf.split', 'Split pages', (f, p) => pdf.split(f, p));
add('pages', PDF, 'pdf.rot90', 'Rotate ↻', (f) => pdf.rotate(f, 90));
add('pages', PDF, 'pdf.rot270', 'Rotate ↺', (f) => pdf.rotate(f, 270));
add('pages', PDF, 'pdf.rot180', 'Rotate 180°', (f) => pdf.rotate(f, 180));
add('pages', PDF, 'pdf.reverse', 'Reverse order', (f) => pdf.reverse(f));
add('pages', PDF, 'pdf.dropFirst', 'Remove page 1', (f) => pdf.removeFirstPage(f));
add('merge', ['pdf', 'image'], 'pdf.merge', 'Merge PDF', (files) => pdf.merge(files), { mode: 'all', min: 2, requireKind: 'pdf' });

// ---------- Documents & data ----------
const DOC = ['doc'];
add('convert', DOC, 'doc.pdf', 'PDF', (f) => doc.toPdf(f));
add('convert', DOC, 'doc.html', 'HTML', (f) => doc.toHtml(f), { skipExt: ['html', 'htm'] });
add('convert', DOC, 'doc.md', 'Markdown', (f) => doc.toMarkdown(f), { skipExt: ['md', 'markdown', 'txt'] });
add('convert', DOC, 'doc.txt', 'Plain text', (f) => doc.toText(f), { skipExt: ['txt'] });
if (process.platform === 'darwin') {
  for (const [f, label] of [['docx', 'Word'], ['rtf', 'RTF'], ['odt', 'ODT']]) {
    add('convert', DOC, `doc.tu.${f}`, label, (file) => doc.viaTextutil(file, f), { skipExt: [f, 'md', 'markdown', 'pages'] });
  }
}
add('convert', ['data'], 'data.json', 'JSON', (f) => doc.csvToJson(f), { onlyExt: ['csv', 'tsv'] });
add('convert', ['data'], 'data.csv', 'CSV', (f) => doc.jsonToCsv(f), { onlyExt: ['json'] });
add('merge', DOC, 'doc.merge.pdf', 'Into one PDF', async (files, p) => {
  const pdfs = [];
  for (const f of files) pdfs.push(await doc.toPdf(f));
  const merged = await pdf.merge(pdfs);
  pdfs.forEach((x) => require('fs').rmSync(x, { force: true }));
  return merged;
}, { mode: 'all', min: 2 });

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

const byId = new Map(actions.map((a) => [a.id, a]));

// Menu for a selection: each action must accept every file's kind, and "each"-mode
// actions are hidden when they'd be a no-op (e.g. PNG -> PNG for a single file).
function menuFor(files, kindsHint) {
  const kinds = files.length ? [...new Set(files.map(kindOf))] : [...new Set(kindsHint)];
  const count = files.length || kindsHint.length;
  if (!kinds.length || kinds.includes('other') || kinds.includes('unknown')) return [];
  const exts = new Set(files.map(ext));
  const fits = (a) => {
    if (!kinds.every((k) => a.kinds.includes(k))) return false;
    if (a.requireKind && !kinds.includes(a.requireKind)) return false;
    if (a.mode === 'all') return count >= (a.min || 2);
    if (a.mode === 'ui' && count > 1) return false;
    if (a.skipExt && exts.size === 1 && a.skipExt.includes([...exts][0])) return false;
    if (a.onlyExt && files.length && ![...exts].every((e) => a.onlyExt.includes(e))) return false;
    return true;
  };
  const cats = [];
  for (const [id, meta] of Object.entries(CATEGORIES)) {
    const items = actions.filter((a) => a.cat === id && fits(a)).map(({ id: aid, label, hint, mode }) => ({ id: aid, label, hint, mode }));
    if (items.length) cats.push({ id, ...meta, items });
  }
  // Merging is the likely intent when several files are dropped, so lead with it.
  if (count > 1) cats.sort((a, b) => (b.id === 'merge') - (a.id === 'merge'));
  return cats;
}

module.exports = { actions, byId, menuFor, CATEGORIES, total: actions.length };
