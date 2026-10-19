// Runs real Orbital conversions on the downloaded assets and records the results for the demo video.
// Usage: env -u ELECTRON_RUN_AS_NODE npx electron demo/run-conversions.js
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(__dirname, 'assets');
const OUT = path.join(__dirname, 'out', 'results');
app.setPath('userData', path.join(__dirname, 'out', 'userdata'));
app.on('window-all-closed', () => {});

const a = (name) => path.join(ASSETS, name);
const size = (p) => {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((s, f) => s + fs.statSync(path.join(p, f)).size, 0);
};

const JOBS = [
  ['img.to.webp', 'Blue Marble.jpg'],
  ['img.compress.strong', 'Blue Marble.jpg'],
  ['img.resize.w1920', 'Blue Marble.jpg'],
  ['img.crop.4:5', 'Earthset from Orion.jpg'],
  ['img.crop.1:1', 'Cosmic Cliffs.jpg'],
  ['img.merge.pdf', ['Blue Marble.jpg', 'Earthset from Orion.jpg', 'Cosmic Cliffs.jpg']],
  ['vid.compress.25mb', 'Artemis I Launch.mp4'],
  ['vid.audio.mp3', 'Artemis I Launch.mp4'],
  ['media.first15', 'Artemis I Launch.mp4'],
  ['aud.compress.voice', 'Mars Habitat Audio Log.mp3'],
  ['media.first60', 'Mars Habitat Audio Log.mp3'],
  ['pdf.split', 'Artemis I Press Kit.pdf'],
  ['pdf.png', 'Artemis I Press Kit.pdf'],
  ['pdf.txt', 'Artemis I Press Kit.pdf'],
  ['doc.pdf', 'WBS Handbook.docx'],
  ['doc.md', 'WBS Handbook.docx'],
];

app.whenReady().then(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const renderHost = require(path.join(ROOT, 'src/main/render-host'));
  require(path.join(ROOT, 'src/main/engine/pdf')).setRenderer(renderHost);
  require(path.join(ROOT, 'src/main/engine/doc')).setRenderer(renderHost);
  const { setOutputDir } = require(path.join(ROOT, 'src/main/engine/util'));
  const { byId } = require(path.join(ROOT, 'src/main/catalog'));
  setOutputDir(OUT);

  const results = [];
  for (const [id, input] of JOBS) {
    const action = byId.get(id);
    const inputs = [].concat(input).map(a);
    const t = Date.now();
    try {
      const output = await action.run(action.mode === 'all' ? inputs : inputs[0], () => {});
      const r = {
        id, label: action.label, category: action.cat,
        inputs: [].concat(input), inputBytes: inputs.reduce((s, f) => s + size(f), 0),
        output: path.relative(OUT, output), outputBytes: size(output),
        files: fs.statSync(output).isDirectory() ? fs.readdirSync(output).length : 1,
        seconds: (Date.now() - t) / 1000,
      };
      results.push(r);
      console.log(`ok   ${id.padEnd(20)} ${(r.inputBytes / 1e6).toFixed(1)} MB -> ${(r.outputBytes / 1e6).toFixed(2)} MB  ${r.seconds.toFixed(1)}s  ${r.output}`);
    } catch (err) {
      console.log(`FAIL ${id}: ${err.message}`);
    }
    fs.writeFileSync(path.join(__dirname, 'out', 'results.json'), JSON.stringify(results, null, 2));
  }
  app.exit(0);
});
