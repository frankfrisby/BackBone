const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cadAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // File operations
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (data, filePath) => ipcRenderer.invoke('file:save', { data, filePath }),
  exportDXF: (data) => ipcRenderer.invoke('file:exportDXF', data),
  exportPDF: (imageDataUrl) => ipcRenderer.invoke('file:exportPDF', imageDataUrl),

  // API server events
  onApiCommand: (callback) => {
    ipcRenderer.on('api:command', (e, cmd) => callback(cmd));
  },

  // Send API response back
  apiResponse: (id, result) => {
    ipcRenderer.send('api:response', { id, result });
  }
});
