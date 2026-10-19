const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { marked } = require('marked');
const TurndownService = require('turndown');
const { ext, outPath, which, exec } = require('./util');

let renderer = null;
const setRenderer = (r) => { renderer = r; };

const PRINT_CSS = `
  body { font: 11pt/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; max-width: 720px; margin: 0 auto; }
  h1, h2, h3 { line-height: 1.25; margin: 1.4em 0 .5em; }
  img { max-width: 100%; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 4px 8px; }
  pre, code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9.5pt; background: #f4f4f4; }
  pre { padding: 10px; white-space: pre-wrap; border-radius: 4px; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 12px; color: #555; }`;

const wrap = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const soffice = () => which('soffice', [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
]);

// Everything becomes HTML first; every output format starts from there.
async function toHtmlBody(file) {
  const e = ext(file);
  const text = () => fs.readFileSync(file, 'utf8');
  if (e === 'docx') return (await mammoth.convertToHtml({ path: file })).value;
  if (e === 'md' || e === 'markdown') return marked.parse(text());
  if (e === 'html' || e === 'htm') {
    const html = text();
    return (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html) || [, html])[1];
  }
  if (e === 'txt') return `<pre style="background:none;font-family:inherit;font-size:inherit">${escapeHtml(text())}</pre>`;
  if (['rtf', 'doc', 'odt', 'pages'].includes(e) && process.platform === 'darwin') {
    return (await exec('/usr/bin/textutil', ['-convert', 'html', '-stdout', file])).toString();
  }
  throw new Error(`Can't read .${e} files${e === 'doc' || e === 'odt' ? ' (install LibreOffice for full support)' : ''}`);
}

const title = (file) => path.basename(file, path.extname(file));

async function toPdf(file) {
  const out = outPath(file, 'pdf');
  const office = soffice();
  if (office && ['docx', 'doc', 'odt', 'rtf', 'pptx', 'xlsx'].includes(ext(file))) {
    // LibreOffice keeps original layout far better than HTML printing.
    await exec(office, ['--headless', '--convert-to', 'pdf', '--outdir', path.dirname(out), file]);
    const produced = path.join(path.dirname(out), `${title(file)}.pdf`);
    if (produced !== out && fs.existsSync(produced)) fs.renameSync(produced, out);
    return out;
  }
  if (!renderer) throw new Error('PDF printing is unavailable');
  const html = ext(file).startsWith('htm') ? fs.readFileSync(file, 'utf8') : wrap(title(file), await toHtmlBody(file));
  fs.writeFileSync(out, await renderer.htmlToPdf(html, path.dirname(file)));
  return out;
}

function csvToJson(file) {
  const delim = ext(file) === 'tsv' ? '\t' : ',';
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  const src = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((v) => v !== ''));
  const out = outPath(file, 'json');
  fs.writeFileSync(out, JSON.stringify(body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))), null, 2));
  return out;
}

function jsonToCsv(file) {
  let data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) data = [data];
  const keys = [...new Set(data.flatMap((r) => Object.keys(r || {})))];
  const esc = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = outPath(file, 'csv');
  fs.writeFileSync(out, [keys.map(esc).join(','), ...data.map((r) => keys.map((k) => esc(r?.[k])).join(','))].join('\n'));
  return out;
}

module.exports = {
  setRenderer,
  hasLibreOffice: () => !!soffice(),
  toPdf,
  toHtml: async (file) => {
    const out = outPath(file, 'html');
    fs.writeFileSync(out, wrap(title(file), await toHtmlBody(file)));
    return out;
  },
  toMarkdown: async (file) => {
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    const out = outPath(file, 'md');
    fs.writeFileSync(out, td.turndown(await toHtmlBody(file)));
    return out;
  },
  toText: async (file) => {
    const out = outPath(file, 'txt');
    if (ext(file) === 'docx') fs.writeFileSync(out, (await mammoth.extractRawText({ path: file })).value);
    else {
      const html = await toHtmlBody(file);
      fs.writeFileSync(out, html.replace(/<(br|\/p|\/h\d|\/li|\/tr)>/gi, '\n').replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim());
    }
    return out;
  },
  // macOS ships textutil, which writes .docx/.rtf/.odt natively.
  viaTextutil: async (file, format) => {
    const out = outPath(file, format);
    await exec('/usr/bin/textutil', ['-convert', format, '-output', out, file]);
    return out;
  },
  csvToJson,
  jsonToCsv,
};
