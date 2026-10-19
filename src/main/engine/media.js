const { outPath, probe, runFfmpeg } = require('./util');

const H264 = ['-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const AAC = ['-c:a', 'aac', '-b:a', '160k'];

const VIDEO_FORMATS = {
  mp4: [...H264, '-crf', '21', ...AAC],
  hevc: ['-c:v', 'libx265', '-crf', '26', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ...AAC],
  webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k'],
  mov: [...H264, '-crf', '20', ...AAC],
  mkv: ['-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', ...AAC],
  avi: ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '3'],
};

const AUDIO_FORMATS = {
  mp3: { ext: 'mp3', args: ['-c:a', 'libmp3lame', '-b:a', '320k'] },
  mp3_192: { ext: 'mp3', args: ['-c:a', 'libmp3lame', '-b:a', '192k'], suffix: '-192k' },
  mp3_128: { ext: 'mp3', args: ['-c:a', 'libmp3lame', '-b:a', '128k'], suffix: '-128k' },
  mp3_voice: { ext: 'mp3', args: ['-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1'], suffix: '-voice' },
  m4a: { ext: 'm4a', args: ['-c:a', 'aac', '-b:a', '256k'] },
  wav: { ext: 'wav', args: ['-c:a', 'pcm_s16le'] },
  flac: { ext: 'flac', args: ['-c:a', 'flac'] },
  ogg: { ext: 'ogg', args: ['-c:a', 'libvorbis', '-q:a', '6'] },
  opus: { ext: 'opus', args: ['-c:a', 'libopus', '-b:a', '128k'] },
  opus_64: { ext: 'opus', args: ['-c:a', 'libopus', '-b:a', '64k'], suffix: '-64k' },
  aiff: { ext: 'aiff', args: ['-c:a', 'pcm_s16be'] },
};

const mediaExt = (info, file) => (info.hasVideo ? (/\.(webm)$/i.test(file) ? 'webm' : 'mp4') : file.split('.').pop().toLowerCase());
const encoderFor = (outExt) => (outExt === 'webm' ? VIDEO_FORMATS.webm : outExt === 'mp4' ? VIDEO_FORMATS.mp4 : []);

async function ff(file, args, outFile, onProgress, durationOverride) {
  const info = await probe(file);
  await runFfmpeg(['-i', file, ...args, outFile], { duration: durationOverride || info.duration, onProgress });
  return outFile;
}

// Even dimensions keep libx264 happy.
const scaleTo = (h) => `scale=-2:'min(${h},ih)'`;
const atempoChain = (speed) => {
  const parts = [];
  let s = speed;
  while (s > 2) { parts.push('atempo=2.0'); s /= 2; }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  parts.push(`atempo=${s}`);
  return parts.join(',');
};

module.exports = {
  probe,

  convertVideo: (file, fmt, p) => ff(file, VIDEO_FORMATS[fmt], outPath(file, fmt === 'hevc' ? 'mp4' : fmt, fmt === 'hevc' ? '-hevc' : ''), p),

  toGif: (file, p, width = 480, fps = 12) =>
    ff(file, ['-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[pal];[b][pal]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0'],
      outPath(file, 'gif'), p),

  toAudio: (file, fmt, p) => {
    const f = AUDIO_FORMATS[fmt];
    return ff(file, ['-vn', ...f.args], outPath(file, f.ext, f.suffix || ''), p);
  },

  compressVideo: async (file, level, p) => {
    const presets = {
      light: ['-crf', '24'],
      medium: ['-crf', '28', '-vf', scaleTo(1080)],
      strong: ['-crf', '31', '-vf', scaleTo(720), '-b:a', '96k'],
    };
    return ff(file, [...H264, ...AAC, ...presets[level]], outPath(file, 'mp4', `-${level}`), p);
  },

  // Single-pass bitrate targeting; lands a little under the limit in practice.
  compressToSize: async (file, megabytes, p) => {
    const { duration } = await probe(file);
    if (!duration) throw new Error('Could not read video duration');
    const totalKbps = (megabytes * 8 * 1024 * 0.92) / duration;
    const audioKbps = Math.min(128, Math.max(48, totalKbps * 0.1));
    const videoKbps = Math.max(100, Math.floor(totalKbps - audioKbps));
    const height = videoKbps < 600 ? 480 : videoKbps < 1500 ? 720 : 1080;
    return ff(file, ['-c:v', 'libx264', '-preset', 'medium', '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps * 1.2}k`, '-bufsize', `${videoKbps * 2}k`,
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-vf', scaleTo(height), '-c:a', 'aac', '-b:a', `${Math.round(audioKbps)}k`],
    outPath(file, 'mp4', `-${megabytes}MB`), p);
  },

  resizeVideo: (file, height, p) => ff(file, [...H264, '-crf', '22', ...AAC, '-vf', scaleTo(height)], outPath(file, 'mp4', `-${height}p`), p),

  cropVideo: (file, ratio, p) => {
    const [w, h] = ratio.split(':').map(Number);
    // Centre crop to the largest rectangle of the given ratio.
    const vf = `crop='if(gt(iw/ih,${w}/${h}),trunc(ih*${w}/${h}/2)*2,iw)':'if(gt(iw/ih,${w}/${h}),ih,trunc(iw*${h}/${w}/2)*2)'`;
    return ff(file, [...H264, '-crf', '21', ...AAC, '-vf', vf], outPath(file, 'mp4', `-${w}x${h}`), p);
  },

  trim: async (file, start, end, p) => {
    const info = await probe(file);
    const outExt = mediaExt(info, file);
    const args = ['-ss', String(start), '-i', file, '-t', String(Math.max(0.1, end - start))];
    const enc = info.hasVideo ? encoderFor(outExt) : [];
    const out = outPath(file, outExt, '-trimmed');
    await runFfmpeg([...args, ...enc, out], { duration: end - start, onProgress: p });
    return out;
  },

  editVideo: async (file, op, p) => {
    const info = await probe(file);
    const enc = [...H264, '-crf', '21'];
    const ops = {
      mute: { args: ['-c:v', 'copy', '-an'], suffix: '-muted' },
      rotateCw: { args: [...enc, ...AAC, '-vf', 'transpose=1'], suffix: '-rotated' },
      rotateCcw: { args: [...enc, ...AAC, '-vf', 'transpose=2'], suffix: '-rotated' },
      flipH: { args: [...enc, ...AAC, '-vf', 'hflip'], suffix: '-flipped' },
      grayscale: { args: [...enc, ...AAC, '-vf', 'hue=s=0'], suffix: '-gray' },
      speed2: { args: [...enc, '-vf', 'setpts=PTS/2', ...(info.hasAudio ? ['-af', atempoChain(2), ...AAC] : [])], suffix: '-2x', d: info.duration / 2 },
      speedHalf: { args: [...enc, '-vf', 'setpts=PTS*2', ...(info.hasAudio ? ['-af', atempoChain(0.5), ...AAC] : [])], suffix: '-slow', d: info.duration * 2 },
      reverse: { args: [...enc, '-vf', 'reverse', ...(info.hasAudio ? ['-af', 'areverse', ...AAC] : [])], suffix: '-reversed' },
      stabilize: { args: [...enc, ...AAC, '-vf', 'deshake'], suffix: '-stabilized' },
    };
    const o = ops[op];
    return ff(file, o.args, outPath(file, 'mp4', o.suffix), p, o.d);
  },

  thumbnail: async (file) => {
    const { duration } = await probe(file);
    const out = outPath(file, 'jpg', '-thumb');
    await runFfmpeg(['-ss', String(Math.min(1, duration / 2)), '-i', file, '-frames:v', '1', '-q:v', '2', out]);
    return out;
  },

  editAudio: async (file, op, p) => {
    const ext = file.split('.').pop().toLowerCase();
    const keep = AUDIO_FORMATS[ext] ? AUDIO_FORMATS[ext].args : AUDIO_FORMATS.m4a.args;
    const outExt = AUDIO_FORMATS[ext] ? ext : 'm4a';
    const info = await probe(file);
    const ops = {
      normalize: { af: 'loudnorm=I=-16:TP=-1.5:LRA=11', suffix: '-normalized' },
      mono: { af: 'pan=mono|c0=.5*c0+.5*c1', suffix: '-mono' },
      fade: { af: `afade=t=in:d=2,afade=t=out:st=${Math.max(0, info.duration - 2)}:d=2`, suffix: '-faded' },
      reverse: { af: 'areverse', suffix: '-reversed' },
      speed125: { af: atempoChain(1.25), suffix: '-1.25x', d: info.duration / 1.25 },
      speed15: { af: atempoChain(1.5), suffix: '-1.5x', d: info.duration / 1.5 },
      speed2: { af: atempoChain(2), suffix: '-2x', d: info.duration / 2 },
      slow: { af: atempoChain(0.75), suffix: '-0.75x', d: info.duration / 0.75 },
      removeSilence: { af: 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_threshold=-45dB:stop_duration=0.6', suffix: '-tight' },
    };
    const o = ops[op];
    return ff(file, ['-vn', '-af', o.af, ...keep], outPath(file, outExt, o.suffix), p, o.d);
  },

  // Concat filter re-encodes, so inputs with different sizes/codecs still join cleanly.
  mergeVideos: async (files, p) => {
    const infos = await Promise.all(files.map(probe));
    const W = infos[0].width - (infos[0].width % 2) || 1280;
    const H = infos[0].height - (infos[0].height % 2) || 720;
    const inputs = [];
    const filters = [];
    let extra = files.length;
    files.forEach((f, i) => {
      inputs.push('-i', f);
      filters.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
      if (infos[i].hasAudio) {
        filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
      } else {
        inputs.push('-f', 'lavfi', '-t', String(infos[i].duration || 1), '-i', 'anullsrc=r=48000:cl=stereo');
        filters.push(`[${extra++}:a]anull[a${i}]`);
      }
    });
    filters.push(`${files.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${files.length}:v=1:a=1[v][a]`);
    const out = outPath(files[0], 'mp4', '-merged');
    const duration = infos.reduce((s, i) => s + i.duration, 0);
    await runFfmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', ...H264, '-crf', '21', ...AAC, out], { duration, onProgress: p });
    return out;
  },

  mergeAudio: async (files, p) => {
    const infos = await Promise.all(files.map(probe));
    const inputs = files.flatMap((f) => ['-i', f]);
    const filter = files.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(';') +
      `;${files.map((_, i) => `[a${i}]`).join('')}concat=n=${files.length}:v=0:a=1[a]`;
    const out = outPath(files[0], 'mp3', '-merged');
    await runFfmpeg([...inputs, '-filter_complex', filter, '-map', '[a]', ...AUDIO_FORMATS.mp3.args, out],
      { duration: infos.reduce((s, i) => s + i.duration, 0), onProgress: p });
    return out;
  },
};
