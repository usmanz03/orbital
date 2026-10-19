const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('worker', {
  onRun: (cb) => ipcRenderer.on('pdfworker:run', (_e, id, data, request) => cb(id, data, request)),
  page: (id, page) => ipcRenderer.send('pdfworker:page', id, page),
  done: (id, result) => ipcRenderer.send('pdfworker:done', id, result),
  error: (id, message) => ipcRenderer.send('pdfworker:error', id, message),
});
