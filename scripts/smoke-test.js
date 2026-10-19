// Runs every catalog action that doesn't need an Electron window against generated fixtures.
// Usage: npm test            (all)
//        npm test -- vid.     (only actions whose id starts with "vid.")
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { runFfmpeg, setOutputDir } = require('../src/main/engine/util');
const { actions } = require('../src/main/catalog');

const NEEDS_WINDOW = new Set(['pdf.png', 'pdf.jpg', 'pdf.txt', 'doc.pdf', 'doc.merge.pdf', 'pdf.compress.light', 'pdf.compress.medium', 'pdf.compress.strong']);
const filter = process.argv[2] || '';

async function fixtures(dir) {
  const f = (n) => path.join(dir, n);
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#3a7bd5' } })
    .composite([{ input: Buffer.from('<svg width="400" height="300"><circle cx="200" cy="150" r="120" fill="#ffcc00"/></svg>'), left: 500, top: 300 }])
    .jpeg().toFile(f('photo.jpg'));
  await sharp({ create: { width: 600, height: 600, channels: 4, background: '#e94560' } }).png().toFile(f('logo.png'));
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f('clip.mp4')]);
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f('silent.mov')]);
  await runFfmpeg(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=5', f('tone.wav')]);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) pdf.addPage([595, 842]).drawText(`Page ${i}`, { x: 60, y: 760, size: 32, font });
  fs.writeFileSync(f('report.pdf'), await pdf.save());
  fs.writeFileSync(f('notes.md'), '# Notes\n\nSome **bold** text and a list:\n\n- one\n- two\n');
  fs.writeFileSync(f('page.html'), '<html><body><h1>Hello</h1><p>World &amp; friends</p></body></html>');
  fs.writeFileSync(f('people.csv'), 'name,age,quote\nAda,36,"Hello, world"\nLinus,"28","He said ""hi"""\n');
  fs.writeFileSync(f('people.json'), JSON.stringify([{ name: 'Ada', tags: ['x'] }, { name: 'Linus', age: 28 }]));
  return {
    image: [f('photo.jpg'), f('logo.png')],
    video: [f('clip.mp4'), f('silent.mov')],
    audio: [f('tone.wav')],
    pdf: [f('report.pdf')],
    doc: [f('notes.md'), f('page.html')],
    data: [f('people.csv'), f('people.json')],
  };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-test-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out);
  const fx = await fixtures(dir);
  setOutputDir(out);

  let pass = 0; let fail = 0; let skip = 0;
  for (const a of actions) {
    if (!a.id.startsWith(filter)) continue;
    if (!a.run || NEEDS_WINDOW.has(a.id)) { skip++; continue; }
    const kind = a.kinds[0];
    let inputs = fx[kind];
    if (a.onlyExt) inputs = inputs.filter((p) => a.onlyExt.includes(path.extname(p).slice(1)));
    if (a.mode === 'all' && a.id === 'pdf.merge') inputs = [fx.pdf[0], fx.image[0], fx.pdf[0]];
    else if (a.mode === 'all' && inputs.length < 2) inputs = [inputs[0], inputs[0]];
    const t = Date.now();
    try {
      const results = a.mode === 'all' ? [await a.run(inputs, () => {})] : await Promise.all(inputs.slice(0, 1).map((i) => a.run(i, () => {})));
      for (const r of results) if (!r || !fs.existsSync(r)) throw new Error(`no output (${r})`);
      pass++;
      console.log(`ok   ${a.id.padEnd(22)} ${String(Date.now() - t).padStart(5)}ms  ${results.map((r) => path.basename(r)).join(', ')}`);
    } catch (e) {
      fail++;
      console.log(`FAIL ${a.id.padEnd(22)} ${e.message}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped (need Electron). ${actions.length} actions total. Output: ${out}`);
  process.exit(fail ? 1 : 0);
})();
