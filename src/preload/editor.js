const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbital', {
  load: (kind, file) => ipcRenderer.invoke('editor:load', kind, file),
  apply: (kind, file, params) => ipcRenderer.send('editor:apply', kind, file, params),
});
