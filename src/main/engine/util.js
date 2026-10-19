const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

// Binaries inside node_modules live in app.asar.unpacked once packaged.
const unpacked = (p) => p && p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

const ffmpegPath = unpacked(require('ffmpeg-static'));

const KIND_BY_EXT = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tif', 'tiff', 'bmp', 'heic', 'heif', 'svg', 'ico'],
  video: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ts', 'mts'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'aiff', 'aif', 'wma', 'amr'],
  pdf: ['pdf'],
  doc: ['docx', 'doc', 'odt', 'rtf', 'md', 'markdown', 'html', 'htm', 'txt', 'pages'],
  data: ['csv', 'json', 'tsv'],
};

const ext = (file) => path.extname(file).slice(1).toLowerCase();

function kindOf(file) {
  const e = ext(file);
  for (const [kind, list] of Object.entries(KIND_BY_EXT)) if (list.includes(e)) return kind;
  return 'other';
}

let outputDirOverride = null;
function setOutputDir(dir) { outputDirOverride = dir || null; }

// photo.png + ("webp", "-small") -> photo-small.webp, never overwriting an existing file.
function outPath(src, newExt, suffix = '') {
  const dir = outputDirOverride || path.dirname(src);
  const base = path.basename(src, path.extname(src)) + suffix;
  let candidate = path.join(dir, `${base}.${newExt}`);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i}).${newExt}`);
  return candidate;
}

function outDirFor(src, suffix) {
  const dir = outputDirOverride || path.dirname(src);
  const base = path.basename(src, path.extname(src)) + suffix;
  let candidate = path.join(dir, base);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})`);
  fs.mkdirSync(candidate, { recursive: true });
  return candidate;
}

const tmpFile = (extension) =>
  path.join(os.tmpdir(), `orbital-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`);

function parseTime(str) {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(str);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

// Reads stream info from ffmpeg's banner; avoids shipping ffprobe as well.
function probe(file) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', '-i', file], (_err, _stdout, stderr) => {
      const duration = parseTime((/Duration: ([\d:.]+)/.exec(stderr) || [])[1] || '');
      const video = /Stream.*Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr);
      resolve({
        duration,
        hasVideo: !!video,
        hasAudio: /Stream.*Audio:/.test(stderr),
        width: video ? +video[1] : 0,
        height: video ? +video[2] : 0,
      });
    });
  });
}

function runFfmpeg(args, { duration = 0, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-y', ...args]);
    let tail = '';
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-4000);
      const t = /time=([\d:.]+)/.exec(text);
      if (t && duration && onProgress) onProgress(Math.min(1, parseTime(t[1]) / duration));
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      const lines = tail.trim().split('\n');
      reject(new Error(lines.slice(-3).join(' ').slice(0, 300) || `ffmpeg exited with ${code}`));
    });
  });
}

function which(cmd, extraPaths = []) {
  for (const p of extraPaths) if (fs.existsSync(p)) return p;
  const dirs = (process.env.PATH || '').split(path.delimiter).concat(['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']);
  const names = process.platform === 'win32' ? [`${cmd}.exe`, `${cmd}.cmd`] : [cmd];
  for (const d of dirs) for (const n of names) {
    const full = path.join(d, n);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function exec(cmd, args) {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).toString().slice(0, 300))) : resolve(stdout)));
}

module.exports = {
  ffmpegPath, kindOf, ext, outPath, outDirFor, tmpFile, probe, runFfmpeg, which, exec, setOutputDir, KIND_BY_EXT,
};
