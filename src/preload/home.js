const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('orbital', {
  status: () => ipcRenderer.invoke('app:status'),
  jobs: () => ipcRenderer.invoke('app:jobs'),
  catalog: () => ipcRenderer.invoke('app:catalog'),
  saveSettings: (patch) => ipcRenderer.invoke('app:settings', patch),
  requestPermission: () => ipcRenderer.invoke('app:requestPermission'),
  chooseFolder: () => ipcRenderer.invoke('app:chooseFolder'),
  reveal: (p) => ipcRenderer.send('app:reveal', p),
  drop: (fileList) => ipcRenderer.send('home:drop', Array.from(fileList).map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
  onJobs: (cb) => ipcRenderer.on('jobs', (_e, jobs) => cb(jobs)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
});
