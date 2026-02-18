import express from 'express';

let win = null;
let pendingCallbacks = new Map();
let callbackId = 0;

function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    const id = ++callbackId;
    pendingCallbacks.set(id, { resolve, reject, timer: setTimeout(() => {
      pendingCallbacks.delete(id);
      reject(new Error('Timeout'));
    }, 10000) });
    win.webContents.send('api:command', { ...cmd, _callbackId: id });
  });
}

export function resolveApiCallback(id, result) {
  const cb = pendingCallbacks.get(id);
  if (cb) {
    clearTimeout(cb.timer);
    pendingCallbacks.delete(id);
    cb.resolve(result);
  }
}

export function startApiServer(mainWindow) {
  win = mainWindow;
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.get('/api/status', (req, res) => res.json({ status: 'ok', app: 'backbone-cad' }));

  app.post('/api/drawing/execute', async (req, res) => {
    try {
      const result = await sendCommand({ type: 'execute', operation: req.body });
      res.json({ ok: true, result });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/drawing/batch', async (req, res) => {
    try {
      const result = await sendCommand({ type: 'batch', operations: req.body.ops || req.body.operations });
      res.json({ ok: true, result });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/api/drawing/entities', async (req, res) => {
    try {
      const result = await sendCommand({ type: 'getEntities' });
      res.json({ ok: true, entities: result });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/drawing/clear', async (req, res) => {
    try {
      const result = await sendCommand({ type: 'clear' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/drawing/load', async (req, res) => {
    try {
      const result = await sendCommand({ type: 'load', data: req.body });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/api/drawing/save', async (req, res) => {
    try {
      const result = await sendCommand({ type: 'save' });
      res.json({ ok: true, data: result });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.listen(9847, () => console.log('CAD API server on :9847'));
}
