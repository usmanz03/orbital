// App-wide hardening. Orbital only ever shows its own local pages and never needs the network
// from a renderer, so anything else is refused.
const { app, session, shell } = require('electron');

const SECURE_PREFS = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  webSecurity: true,
};

function lockDown() {
  // Renderers may load local files and inline data only; no web requests (tracking pixels,
  // remote fonts or scripts inside converted HTML/Markdown). Main-process requests such as
  // the update check carry no webContents and are unaffected.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const local = /^(file|data|blob|devtools|chrome-extension):/i.test(details.url);
    callback({ cancel: details.webContentsId != null && !local });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));

  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => { if (!url.startsWith('file:')) event.preventDefault(); });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

module.exports = { SECURE_PREFS, lockDown };
