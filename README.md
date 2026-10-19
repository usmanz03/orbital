# Orbital

Hold **Shift**, drag any file, and a radial menu opens under your cursor. Drop the file on an action and it's converted. Nothing is uploaded: every conversion runs on your machine.

- 135+ actions for images, video, audio, PDFs, documents and CSV/JSON
- Convert, compress, resize, smart-crop, trim, edit, and merge multiple files
- Lives in the menu bar or system tray, with no windows unless you open Settings
- macOS (Apple Silicon and Intel), Windows 10/11, Linux (X11; Wayland uses the shortcut)

**Download:** https://usmanz03.github.io/orbital

## Using it

| Do this | Get this |
| --- | --- |
| Shift + drag a file | Radial picker under the cursor. Drop on an action to run it, or drop on the centre to choose. |
| Select files in Finder, press `⌘⇧Space` | Picker with those files. Type to search, use the arrow keys, press Enter. |
| Launch Orbital again | Picker as a drop target |
| Menu-bar icon → Settings… | Trigger key, output folder, open at login |

Output is saved next to the original with a descriptive suffix (`photo-1x1.jpg`, `clip-25MB.mp4`). Originals are never overwritten.

On macOS, Shift-drag needs **Accessibility** permission. Orbital shows the system prompt the first time it starts.

## Development

```bash
npm install
npm start            # run the app
npm test             # run every conversion against generated fixtures
npm run dist:mac     # build a local .dmg (unsigned)
```

> Running from VS Code's terminal? It sets `ELECTRON_RUN_AS_NODE=1`, which stops Electron from starting. Use `env -u ELECTRON_RUN_AS_NODE npm start`.

`ORBITAL_SELFTEST=/tmp/out npx electron scripts/electron-selftest.js` exercises the Chromium-backed actions (PDF rendering, printing to PDF) and saves screenshots of the picker and editors.

### Layout

```
src/main/main.js          app lifecycle, tray, picker window, IPC
src/main/trigger.js       global Shift+drag detection (uiohook-napi)
src/main/catalog.js       every action, grouped into ring categories
src/main/jobs.js          job queue, progress, notifications
src/main/engine/          image (sharp), media (ffmpeg), pdf (pdf-lib/pdf.js), doc
src/renderer/overlay.*    the radial picker
src/renderer/editor.*     trim and crop editors
src/renderer/home.*       settings window
site/                     landing page (GitHub Pages)
```

Adding an action takes one line in `catalog.js`.

## Releasing

1. Bump `version` in `package.json` and commit.
2. `git tag v0.1.1 && git push --tags`
3. GitHub Actions builds macOS arm64 and x64, Windows and Linux, and attaches the installers to the release. The landing page picks up the newest release automatically.

### Signing (recommended before sharing widely)

Unsigned Mac apps show a "can't be opened" warning, and users have to right-click → Open. To sign and notarize, join the Apple Developer Program ($99/yr) and add these repository secrets:

| Secret | Value |
| --- | --- |
| `MAC_CERT_P12_BASE64` | Developer ID Application certificate, exported as .p12, then base64-encoded |
| `MAC_CERT_PASSWORD` | Password for that .p12 |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | From appleid.apple.com → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-character team ID |

Windows builds work unsigned. SmartScreen shows "More info → Run anyway" until the app builds a download reputation.

## License

MIT. Bundles FFmpeg (LGPL/GPL builds from ffmpeg-static) and libvips.
