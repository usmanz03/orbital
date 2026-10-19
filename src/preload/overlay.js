const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('orbital', {
  onShow: (cb) => ipcRenderer.on('overlay:show', (_e, payload) => cb(payload)),
  onHide: (cb) => ipcRenderer.on('overlay:hide', () => cb()),
  menuFor: (query) => ipcRenderer.invoke('menu:for', query),
  run: (actionId, files) => ipcRenderer.send('overlay:run', actionId, files),
  hide: () => ipcRenderer.send('overlay:hide'),
  setMode: (mode) => ipcRenderer.send('overlay:mode', mode),
  pathsFor: (fileList) => Array.from(fileList).map((f) => webUtils.getPathForFile(f)).filter(Boolean),
});
