// Generates the app icon (build/icon.png → electron-builder makes .icns/.ico) and tray icons.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });

// macOS icon grid: 824px rounded square centred on a 1024 canvas.
const appIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d1b3a"/><stop offset="1" stop-color="#0a0c14"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8d6bff"/><stop offset="1" stop-color="#3dd6f5"/>
    </linearGradient>
    <radialGradient id="core" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#b9a6ff"/><stop offset=".55" stop-color="#7c5cff"/><stop offset="1" stop-color="#3b2aa6"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="4"/>
  <g transform="translate(512 512)">
    <!-- radial menu segments -->
    ${[0, 1, 2, 3, 4, 5].map((i) => {
      const a0 = (i * 60 + 4) * Math.PI / 180; const a1 = ((i + 1) * 60 - 4) * Math.PI / 180;
      const R = 300; const r = 215;
      const p = (rad, a) => `${(rad * Math.sin(a)).toFixed(1)},${(-rad * Math.cos(a)).toFixed(1)}`;
      return `<path d="M${p(R, a0)}A${R},${R} 0 0 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 0 0 ${p(r, a0)}Z" fill="${i === 0 ? 'url(#ring)' : 'rgba(255,255,255,.10)'}"/>`;
    }).join('')}
    <circle r="150" fill="#7c5cff" opacity=".45" filter="url(#glow)"/>
    <circle r="150" fill="url(#core)"/>
    <circle r="150" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="4"/>
    <circle cx="232" cy="-232" r="38" fill="#3dd6f5"/>
  </g>
</svg>`;

// Template image: black + alpha only; macOS tints it for light/dark menu bars.
const trayIcon = (color) => `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="10.5" fill="none" stroke="${color}" stroke-width="2.6"/>
  <circle cx="16" cy="16" r="4.5" fill="${color}"/>
  <circle cx="24.5" cy="7.5" r="3.6" fill="${color}"/>
</svg>`;

(async () => {
  await sharp(Buffer.from(appIcon)).png().toFile(path.join(root, 'build', 'icon.png'));
  await sharp(Buffer.from(appIcon)).resize(256).png().toFile(path.join(root, 'assets', 'icon-256.png'));
  await sharp(Buffer.from(trayIcon('#000'))).resize(16).png().toFile(path.join(root, 'assets', 'trayTemplate.png'));
  await sharp(Buffer.from(trayIcon('#000'))).resize(32).png().toFile(path.join(root, 'assets', 'trayTemplate@2x.png'));
  await sharp(Buffer.from(trayIcon('#8d6bff'))).resize(32).png().toFile(path.join(root, 'assets', 'tray.png'));
  console.log('Icons written to build/ and assets/');
})();
