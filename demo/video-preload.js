const fs = require('fs');
const path = require('path');
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('DATA', JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'media', 'data.json'), 'utf8')));
