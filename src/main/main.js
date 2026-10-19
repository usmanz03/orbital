const path = require('path');
const { pathToFileURL } = require('url');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage, shell, dialog,
} = require('electron');
const settings = require('./settings');
const trigger = require('./trigger');
const jobs = require('./jobs');
const renderHost = require('./render-host');
const catalog = require('./catalog');
const { setOutputDir, kindOf, probe, exec } = require('./engine/util');
const image = require('./engine/image');
const media = require('./engine/media');
require('./engine/pdf').setRenderer(renderHost);
require('./engine/doc').setRenderer(renderHost);

const isMac = process.platform === 'darwin';
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload');
const OVERLAY_SIZE = 640;

let tray = null;
let overlay = null;
let home = null;
let editor = null;
let overlayMode = null;
let dragEndTimer = null;

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- Overlay (the radial menu) ----------

function createOverlay() {
  overlay = new BrowserWindow({
    width: OVERLAY_SIZE,
    height: OVERLAY_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    ...(isMac ? { type: 'panel' } : { type: 'toolbar' }),
    webPreferences: { preload: path.join(PRELOAD, 'overlay.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(RENDERER, 'overlay.html'));
  overlay.on('blur', () => { if (overlayMode && overlayMode !== 'drag') hideOverlay(); });
}

function placeOverlay() {
  const p = screen.getCursorScreenPoint();
  const { workArea: wa } = screen.getDisplayNearestPoint(p);
  const half = OVERLAY_SIZE / 2;
  const x = Math.round(Math.min(Math.max(p.x - half, wa.x), wa.x + wa.width - OVERLAY_SIZE));
  const y = Math.round(Math.min(Math.max(p.y - half, wa.y), wa.y + wa.height - OVERLAY_SIZE));
  overlay.setBounds({ x, y, width: OVERLAY_SIZE, height: OVERLAY_SIZE });
}

// mode: 'drag' (opened by Shift+drag, invisible until files hover it),
//       'menu' (files known, pick with mouse/keyboard), 'hub' (empty drop target).
function showOverlay(mode, files = []) {
  if (!overlay || overlay.isDestroyed()) createOverlay();
  clearTimeout(dragEndTimer);
  overlayMode = mode;
  placeOverlay();
  overlay.webContents.send('overlay:show', { mode, files, menu: files.length ? catalog.menuFor(files) : [] });
  if (mode === 'drag') {
    overlay.showInactive();
  } else {
    overlay.show();
    overlay.focus();
    if (isMac) app.focus({ steal: true });
  }
}

function hideOverlay() {
  if (!overlay || !overlayMode) return;
  overlayMode = null;
  overlay.webContents.send('overlay:hide');
  overlay.hide();
  // Hand focus back to whichever app the user was in.
  if (isMac && !(home && home.isVisible()) && !(editor && editor.isVisible())) app.hide();
}

function onDragStart() {
  if (!settings.get().triggerEnabled) return;
  showOverlay('drag');
}

// Mouse released without a drop on the menu: the drag went elsewhere, so close.
function onDragEnd() {
  clearTimeout(dragEndTimer);
  dragEndTimer = setTimeout(() => { if (overlayMode === 'drag') hideOverlay(); }, 250);
}

// ---------- Finder selection (global shortcut) ----------

async function finderSelection() {
  if (!isMac) return [];
  const script = 'tell application "Finder" to set s to selection as alias list\n'
    + 'set out to ""\nrepeat with f in s\nset out to out & POSIX path of f & linefeed\nend repeat\nreturn out';
  try {
    return (await exec('/usr/bin/osascript', ['-e', script])).toString().split('\n').filter(Boolean)
      .filter((p) => !p.endsWith('/'));
  } catch {
    return [];
  }
}

async function onShortcut() {
  if (overlayMode) return hideOverlay();
  const files = await finderSelection();
  showOverlay(files.length ? 'menu' : 'hub', files);
}

function registerShortcut() {
  globalShortcut.unregisterAll();
  const { shortcut } = settings.get();
  if (shortcut && !globalShortcut.register(shortcut, onShortcut)) console.warn(`Shortcut ${shortcut} is taken`);
}

// ---------- Windows ----------

function openHome() {
  if (home && !home.isDestroyed()) { home.show(); home.focus(); return; }
  home = new BrowserWindow({
    width: 880,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    title: 'Orbital',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#0d0f14',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(PRELOAD, 'home.js'), contextIsolation: true, sandbox: false },
  });
  home.loadFile(path.join(RENDERER, 'home.html'));
  home.once('ready-to-show', () => { home.show(); if (isMac) app.focus({ steal: true }); });
  home.on('closed', () => { home = null; });
}

function openEditor(kind, file) {
  if (editor && !editor.isDestroyed()) editor.close();
  editor = new BrowserWindow({
    width: kind === 'crop' ? 980 : 860,
    height: kind === 'crop' ? 760 : 520,
    title: kind === 'crop' ? `Crop — ${path.basename(file)}` : `Trim — ${path.basename(file)}`,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#0d0f14',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(PRELOAD, 'editor.js'), contextIsolation: true, sandbox: false },
  });
  editor.loadFile(path.join(RENDERER, 'editor.html'), { query: { kind, file } });
  editor.once('ready-to-show', () => { editor.show(); if (isMac) app.focus({ steal: true }); });
  editor.on('closed', () => { editor = null; });
}

// ---------- Jobs → tray + home ----------

function runAction(actionId, files) {
  const action = catalog.byId.get(actionId);
  if (!action || !files.length) return;
  if (action.mode === 'ui') return openEditor(action.ui, files[0]);
  jobs.run(actionId, files);
}

jobs.events.on('change', () => {
  const active = jobs.history.filter((j) => j.status === 'running' || j.status === 'queued');
  if (tray) {
    const running = active.find((j) => j.status === 'running');
    const label = running ? `${Math.round(running.progress * 100)}%` : '';
    if (isMac) tray.setTitle(label ? ` ${label}` : '');
    tray.setToolTip(running ? `Orbital — ${running.label} ${label}` : 'Orbital');
  }
  if (home && !home.isDestroyed()) home.webContents.send('jobs', serializeJobs());
});

const serializeJobs = () => jobs.history.map(({ id, label, category, files, status, progress, outputs, error }) =>
  ({ id, label, category, files: files.map((f) => path.basename(f)), status, progress, outputs, error }));

// ---------- Settings ----------

function applySettings() {
  const s = settings.get();
  setOutputDir(s.outputMode === 'folder' && s.outputDir ? s.outputDir : null);
  trigger.setModifier(s.modifier);
  if (app.isPackaged && app.getLoginItemSettings().openAtLogin !== s.openAtLogin) {
    app.setLoginItemSettings({ openAtLogin: s.openAtLogin, openAsHidden: true });
  }
  registerShortcut();
  startTrigger();
}

function startTrigger() {
  trigger.start({ onDragStart, onDragEnd, modifier: settings.get().modifier });
}

// Shows the native macOS Accessibility prompt, then starts the hook as soon as it's granted.
let permissionPoll = null;
function requestPermissionAndWait() {
  trigger.requestPermission();
  clearInterval(permissionPoll);
  permissionPoll = setInterval(() => {
    if (!trigger.hasPermission()) return;
    clearInterval(permissionPoll);
    startTrigger();
    if (home && !home.isDestroyed()) home.webContents.send('status', status());
  }, 1500);
  setTimeout(() => clearInterval(permissionPoll), 10 * 60 * 1000);
}

function status() {
  return {
    platform: process.platform,
    version: app.getVersion(),
    hookRunning: trigger.isRunning(),
    hookSupported: trigger.supported(),
    permission: trigger.hasPermission(),
    actionCount: catalog.total,
    settings: settings.get(),
    extras: { ghostscript: require('./engine/pdf').hasGhostscript(), libreoffice: require('./engine/doc').hasLibreOffice() },
  };
}

// ---------- IPC ----------

ipcMain.handle('menu:for', (_e, { files, kinds }) => catalog.menuFor(files || [], kinds || []));
ipcMain.on('overlay:run', (_e, actionId, files) => { hideOverlay(); runAction(actionId, files); });
ipcMain.on('overlay:hide', () => hideOverlay());
ipcMain.on('overlay:mode', (_e, mode) => {
  overlayMode = mode;
  // After a drop the menu needs keyboard focus for search/Escape.
  if (mode === 'menu') { overlay.focus(); if (isMac) app.focus({ steal: true }); }
});
ipcMain.on('home:drop', (_e, files) => files.length && showOverlay('menu', files));

ipcMain.handle('app:status', () => status());
ipcMain.handle('app:jobs', () => serializeJobs());
ipcMain.handle('app:settings', (_e, patch) => { settings.set(patch); applySettings(); return status(); });
ipcMain.handle('app:requestPermission', () => {
  requestPermissionAndWait();
  return status();
});
ipcMain.handle('app:chooseFolder', async () => {
  const r = await dialog.showOpenDialog(home, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return status();
  settings.set({ outputMode: 'folder', outputDir: r.filePaths[0] });
  applySettings();
  return status();
});
ipcMain.handle('app:catalog', () => Object.entries(catalog.CATEGORIES).map(([id, c]) => ({
  id, label: c.label, items: catalog.actions.filter((a) => a.cat === id).map((a) => ({ id: a.id, label: a.label, kinds: a.kinds })),
})));
ipcMain.on('app:reveal', (_e, p) => shell.showItemInFolder(p));

ipcMain.handle('editor:load', async (_e, kind, file) => {
  if (kind === 'crop') return { kind, file, name: path.basename(file), ...(await image.preview(file)) };
  const info = await probe(file);
  return { kind, file, name: path.basename(file), url: pathToFileURL(file).href, isVideo: kindOf(file) === 'video', ...info };
});
ipcMain.on('editor:apply', (_e, kind, file, params) => {
  editor?.close();
  const label = kind === 'crop' ? 'Crop' : 'Trim';
  // Editors bypass the catalog's fixed presets but still go through the job queue.
  jobs.run(kind === 'crop' ? 'img.crop.custom' : 'media.trim', [file], (task, onProgress) =>
    (kind === 'crop' ? image.cropRect(task, params) : media.trim(task, params.start, params.end, onProgress)))
    .label = label;
});

// ---------- App lifecycle ----------

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, isMac ? 'trayTemplate.png' : 'tray.png'));
  if (isMac) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Orbital');
  const build = () => Menu.buildFromTemplate([
    { label: 'Open Picker', accelerator: settings.get().shortcut, click: onShortcut },
    { label: 'Settings…', click: openHome },
    { type: 'separator' },
    {
      label: 'Shift-Drag Trigger', type: 'checkbox', checked: settings.get().triggerEnabled,
      click: (item) => { settings.set({ triggerEnabled: item.checked }); },
    },
    { type: 'separator' },
    { label: 'Quit Orbital', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  ]);
  tray.on(isMac ? 'mouse-down' : 'click', () => tray.setContextMenu(build()));
  tray.setContextMenu(build());
}

function checkForUpdates() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdatesAndNotify().catch((err) => console.warn('Update check failed:', err.message));
  } catch (err) {
    console.warn('Updater unavailable:', err.message);
  }
}

// Launching the app again just shows the picker as a drop target.
app.on('second-instance', () => showOverlay('hub'));
let readyAt = Infinity;
app.on('activate', () => { if (Date.now() - readyAt > 3000) showOverlay('hub'); });
app.on('window-all-closed', (e) => e.preventDefault()); // lives in the menu bar / tray
app.on('will-quit', () => { globalShortcut.unregisterAll(); trigger.stop(); });

app.whenReady().then(() => {
  readyAt = Date.now();
  if (isMac) app.dock?.hide();
  createTray();
  createOverlay();
  applySettings();
  // No windows at launch: Orbital lives in the menu bar and only shows the picker.
  if (trigger.supported() && !trigger.hasPermission()) requestPermissionAndWait();
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
});

module.exports = { showOverlay };
