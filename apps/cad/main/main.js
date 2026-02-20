import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startApiServer, resolveApiCallback } from './api-server.js';
import { setupFileIO } from './file-io.js';
import { importDXF } from './dxf-importer.js';
import { exportDXF } from './dxf-exporter.js';
import { exportPDF } from './pdf-exporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: true,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.openDevTools({ mode: 'bottom' });

  mainWindow.webContents.on('console-message', (e, level, msg, line, sourceId) => {
    console.log(`[Renderer] ${msg} (${sourceId}:${line})`);
  });
}

app.whenReady().then(() => {
  createWindow();
  setupFileIO(mainWindow);
  startApiServer(mainWindow);
});

app.on('window-all-closed', () => app.quit());

// API responses from renderer
ipcMain.on('api:response', (e, { id, result }) => resolveApiCallback(id, result));

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// File operations
ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [
      { name: 'CAD Files', extensions: ['bxf', 'dxf'] },
      { name: 'BACKBONE Drawing', extensions: ['bxf'] },
      { name: 'DXF', extensions: ['dxf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled || !filePaths.length) return null;
  const filePath = filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.dxf') {
    return { type: 'dxf', data: await importDXF(filePath) };
  }
  const fs = await import('fs');
  return { type: 'bxf', data: JSON.parse(fs.readFileSync(filePath, 'utf-8')), path: filePath };
});

ipcMain.handle('file:save', async (e, { data, filePath }) => {
  if (!filePath) {
    const { canceled, filePath: fp } = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'BACKBONE Drawing', extensions: ['bxf'] }]
    });
    if (canceled) return null;
    filePath = fp;
  }
  const fs = await import('fs');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
});

ipcMain.handle('file:exportDXF', async (e, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'DXF', extensions: ['dxf'] }]
  });
  if (canceled) return null;
  const fs = await import('fs');
  fs.writeFileSync(filePath, exportDXF(data));
  return filePath;
});

ipcMain.handle('file:exportPDF', async (e, imageDataUrl) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled) return null;
  await exportPDF(imageDataUrl, filePath);
  return filePath;
});
