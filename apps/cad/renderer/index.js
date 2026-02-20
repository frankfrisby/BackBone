import { DrawingDocument } from './core/DrawingDocument.js';
import { Renderer2D } from './canvas/Renderer2D.js';
// Renderer3D loaded lazily on demand to avoid blocking 2D mode
import { ToolController } from './tools/ToolController.js';
import { SelectTool } from './tools/SelectTool.js';
import { LineTool } from './tools/LineTool.js';
import { ArcTool } from './tools/ArcTool.js';
import { CircleTool } from './tools/CircleTool.js';
import { RectangleTool } from './tools/RectangleTool.js';
import { PolylineTool } from './tools/PolylineTool.js';
import { EllipseTool } from './tools/EllipseTool.js';
import { SplineTool } from './tools/SplineTool.js';
import { TextTool } from './tools/TextTool.js';
import { MoveTool } from './tools/edit/MoveTool.js';
import { RotateTool } from './tools/edit/RotateTool.js';
import { ScaleTool } from './tools/edit/ScaleTool.js';
import { MirrorTool } from './tools/edit/MirrorTool.js';
import { SelectionManager } from './selection/SelectionManager.js';
import { CommandParser } from './commands/CommandParser.js';
import { CommandRegistry } from './commands/CommandRegistry.js';
import { AppShell } from './ui/AppShell.js';
import { Ribbon } from './ui/Ribbon.js';
import { ToolBar } from './ui/ToolBar.js';
import { PropertiesPanel } from './ui/PropertiesPanel.js';
import { CommandLine } from './ui/CommandLine.js';
import { StatusBar } from './ui/StatusBar.js';

class CADApp {
  constructor() {
    this.doc = new DrawingDocument();
    this.selection = new SelectionManager();
    this.viewMode = '2d';
    this.filePath = null;

    // UI
    this.shell = new AppShell();
    this.ribbon = new Ribbon(this);
    this.toolBar = new ToolBar(this);
    this.propertiesPanel = new PropertiesPanel(this);
    this.commandLine = new CommandLine(this);
    this.statusBar = new StatusBar(this);

    // Commands
    this.commandRegistry = new CommandRegistry();
    this.commandParser = new CommandParser(this);

    // Tools
    this.toolCtrl = new ToolController(this);
  }

  init() {
    // Build UI
    this.shell.createTitleBar();
    this.ribbon.render();
    const viewport = this.shell.createViewport();
    this.toolBar.render();
    this.propertiesPanel.render();
    this.statusBar.render();

    // Canvas
    this.canvas = document.createElement('canvas');
    viewport.appendChild(this.canvas);
    this.renderer2d = new Renderer2D(this.canvas, this.doc);

    // Command line (inside viewport)
    this.commandLine.render(viewport);

    // Size canvas
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    // Register tools
    this.toolCtrl.register('select', new SelectTool(this));
    this.toolCtrl.register('line', new LineTool(this));
    this.toolCtrl.register('arc', new ArcTool(this));
    this.toolCtrl.register('circle', new CircleTool(this));
    this.toolCtrl.register('rectangle', new RectangleTool(this));
    this.toolCtrl.register('polyline', new PolylineTool(this));
    this.toolCtrl.register('ellipse', new EllipseTool(this));
    this.toolCtrl.register('spline', new SplineTool(this));
    this.toolCtrl.register('text', new TextTool(this));
    this.toolCtrl.register('move', new MoveTool(this));
    this.toolCtrl.register('rotate', new RotateTool(this));
    this.toolCtrl.register('scale', new ScaleTool(this));
    this.toolCtrl.register('mirror', new MirrorTool(this));
    this.toolCtrl.activate('select');

    // Register commands
    this._registerCommands();

    // Mouse events on canvas
    this._bindCanvasEvents();

    // Keyboard
    document.addEventListener('keydown', (e) => this._onKeyDown(e));

    // API bridge
    window.cadAPI?.onApiCommand?.((cmd) => this._handleApiCommand(cmd));

    // Start rendering
    this.renderer2d.start();

    // Doc change events
    this.doc.addEventListener('entityAdded', () => this.propertiesPanel.update());
    this.doc.addEventListener('entityRemoved', () => this.propertiesPanel.update());
    this.doc.addEventListener('entityChanged', () => this.propertiesPanel.update());
    this.doc.addEventListener('undoRedo', () => this.propertiesPanel.update());
  }

  _resizeCanvas() {
    const vp = document.getElementById('viewport');
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.renderer2d.resize(rect.width, rect.height);
    if (this.renderer3d) this.renderer3d.resize(rect.width, rect.height);
  }

  _bindCanvasEvents() {
    const c = this.canvas;
    let panning = false;
    let panButton = -1;
    let lastMouse = { x: 0, y: 0 };

    c.addEventListener('mousedown', (e) => {
      // Middle-click or right-click to pan
      if (e.button === 1 || e.button === 2) {
        panning = true;
        panButton = e.button;
        lastMouse = { x: e.clientX, y: e.clientY };
        c.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
      const world = this.renderer2d.camera.screenToWorld(e.offsetX, e.offsetY);
      const snapped = this.renderer2d.snap.snap(world.x, world.y, this.renderer2d.camera);
      this.toolCtrl.onMouseDown(e, snapped.x, snapped.y);
    });

    c.addEventListener('mousemove', (e) => {
      if (panning) {
        this.renderer2d.camera.pan(e.clientX - lastMouse.x, e.clientY - lastMouse.y);
        lastMouse = { x: e.clientX, y: e.clientY };
        return;
      }
      const world = this.renderer2d.camera.screenToWorld(e.offsetX, e.offsetY);
      this.renderer2d.crosshair.update(world.x, world.y);
      this.statusBar.setCoords(world.x, world.y);
      const snapped = this.renderer2d.snap.snap(world.x, world.y, this.renderer2d.camera);
      this.toolCtrl.onMouseMove(e, snapped.x, snapped.y);
    });

    c.addEventListener('mouseup', (e) => {
      if (panning && (e.button === panButton)) {
        panning = false;
        panButton = -1;
        c.style.cursor = '';
        return;
      }
      const world = this.renderer2d.camera.screenToWorld(e.offsetX, e.offsetY);
      const snapped = this.renderer2d.snap.snap(world.x, world.y, this.renderer2d.camera);
      this.toolCtrl.onMouseUp(e, snapped.x, snapped.y);
    });

    // Stop panning if mouse leaves canvas
    c.addEventListener('mouseleave', () => {
      if (panning) {
        panning = false;
        panButton = -1;
        c.style.cursor = '';
      }
    });

    c.addEventListener('wheel', (e) => {
      this.renderer2d.camera.zoom(e.deltaY < 0 ? 1 : -1, e.offsetX, e.offsetY);
      e.preventDefault();
    }, { passive: false });

    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _onKeyDown(e) {
    // Don't intercept when typing in command line
    if (e.target.tagName === 'INPUT') {
      this.toolCtrl.onKeyDown(e);
      return;
    }

    if (e.ctrlKey && e.key === 'z') { this.doc.undo.undo(); e.preventDefault(); }
    else if (e.ctrlKey && e.key === 'y') { this.doc.undo.redo(); e.preventDefault(); }
    else if (e.ctrlKey && e.key === 's') { this.saveFile(); e.preventDefault(); }
    else if (e.key === 'Delete') { this.selection.deleteSelected(this.doc); }
    else if (e.key === 'Escape') { this.toolCtrl.cancel(); this.toolBar.setActive('select'); }
    else if (e.key === 'F8') { this.renderer2d.snap.gridSnap = !this.renderer2d.snap.gridSnap; this.statusBar.setSnap(this.renderer2d.snap.gridSnap); }
    else {
      // Focus command line for typing
      this.commandLine.focus();
      this.toolCtrl.onKeyDown(e);
    }
  }

  _registerCommands() {
    const r = this.commandRegistry;
    r.register('LINE', ['L'], () => { this.toolCtrl.activate('line'); this.toolBar.setActive('line'); });
    r.register('CIRCLE', ['C'], () => { this.toolCtrl.activate('circle'); this.toolBar.setActive('circle'); });
    r.register('ARC', ['A'], () => { this.toolCtrl.activate('arc'); this.toolBar.setActive('arc'); });
    r.register('RECTANGLE', ['REC', 'RECT'], () => { this.toolCtrl.activate('rectangle'); this.toolBar.setActive('rectangle'); });
    r.register('POLYLINE', ['PL', 'PLINE'], () => { this.toolCtrl.activate('polyline'); this.toolBar.setActive('polyline'); });
    r.register('ELLIPSE', ['EL'], () => { this.toolCtrl.activate('ellipse'); this.toolBar.setActive('ellipse'); });
    r.register('SPLINE', ['SPL'], () => { this.toolCtrl.activate('spline'); this.toolBar.setActive('spline'); });
    r.register('TEXT', ['T'], () => { this.toolCtrl.activate('text'); this.toolBar.setActive('text'); });
    r.register('MOVE', ['M'], () => { this.toolCtrl.activate('move'); });
    r.register('ROTATE', ['RO'], () => { this.toolCtrl.activate('rotate'); });
    r.register('SCALE', ['SC'], () => { this.toolCtrl.activate('scale'); });
    r.register('MIRROR', ['MI'], () => { this.toolCtrl.activate('mirror'); });
    r.register('ERASE', ['E', 'DEL', 'DELETE'], () => { this.selection.deleteSelected(this.doc); });
    r.register('UNDO', ['U'], () => { this.doc.undo.undo(); });
    r.register('REDO', [], () => { this.doc.undo.redo(); });
    r.register('ZOOM', ['Z'], () => { this.zoomFit(); });
    r.register('NEW', [], () => { this.newDrawing(); });
    r.register('SAVE', [], () => { this.saveFile(); });
    r.register('OPEN', [], () => { this.openFile(); });
  }

  // View mode
  async setViewMode(mode) {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    const viewport = document.getElementById('viewport');

    if (mode === '3d') {
      this.renderer2d.stop();
      this.canvas.style.display = 'none';
      const container = document.createElement('div');
      container.className = 'renderer-3d';
      container.id = 'container-3d';
      viewport.appendChild(container);
      const { Renderer3D } = await import('./scene3d/Renderer3D.js');
      this.renderer3d = new Renderer3D(container, this.doc);
      this.renderer3d.start();
    } else {
      if (this.renderer3d) {
        this.renderer3d.stop();
        document.getElementById('container-3d')?.remove();
        this.renderer3d = null;
      }
      this.canvas.style.display = '';
      this.renderer2d.start();
    }
  }

  // Zoom fit
  zoomFit() {
    if (this.doc.entities.size === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of this.doc.entities.values()) {
      const bb = e.getBBox();
      minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
      maxX = Math.max(maxX, bb.x + bb.w); maxY = Math.max(maxY, bb.y + bb.h);
    }
    this.renderer2d.camera.fitExtents({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, this.canvas.width, this.canvas.height);
  }

  // File operations
  newDrawing() { this.doc.clear(); this.filePath = null; this.commandLine.log('New drawing.'); }

  async openFile() {
    const result = await window.cadAPI?.openFile();
    if (!result) return;
    if (result.type === 'bxf') {
      this.doc.fromJSON(result.data);
      this.filePath = result.path;
    } else if (result.type === 'dxf') {
      this.doc.fromJSON(result.data);
    }
    this.commandLine.log('Drawing loaded.');
    this.zoomFit();
  }

  async saveFile() {
    const data = this.doc.toJSON();
    const path = await window.cadAPI?.saveFile(data, this.filePath);
    if (path) { this.filePath = path; this.doc.modified = false; this.commandLine.log(`Saved: ${path}`); }
  }

  async saveFileAs() {
    const data = this.doc.toJSON();
    const path = await window.cadAPI?.saveFile(data, null);
    if (path) { this.filePath = path; this.doc.modified = false; this.commandLine.log(`Saved: ${path}`); }
  }

  async exportDXF() {
    const path = await window.cadAPI?.exportDXF(this.doc.toJSON());
    if (path) this.commandLine.log(`DXF exported: ${path}`);
  }

  async exportPDF() {
    const imageData = this.renderer2d.getImageDataUrl();
    const path = await window.cadAPI?.exportPDF(imageData);
    if (path) this.commandLine.log(`PDF exported: ${path}`);
  }

  // API command handling
  _handleApiCommand(cmd) {
    const { _callbackId } = cmd;
    let result;
    try {
      switch (cmd.type) {
        case 'execute':
          result = this.doc.executeOperation(cmd.operation);
          if (result) result = result.toJSON?.() || result;
          break;
        case 'batch': {
          const results = [];
          for (const op of cmd.operations) {
            const r = this.doc.executeOperation(op);
            results.push(r?.toJSON?.() || r);
          }
          result = results;
          break;
        }
        case 'getEntities':
          result = [...this.doc.entities.values()].map(e => e.toJSON());
          break;
        case 'clear':
          this.doc.clear();
          result = { cleared: true };
          break;
        case 'load':
          this.doc.fromJSON(cmd.data);
          result = { loaded: true };
          break;
        case 'save':
          result = this.doc.toJSON();
          break;
      }
    } catch (e) {
      result = { error: e.message };
    }

    if (_callbackId && window.cadAPI) {
      window.cadAPI.apiResponse(_callbackId, result);
    }
  }
}

// Boot
const app = new CADApp();
app.init();

// Load a demo drawing so the app doesn't look empty
if (app.doc.entities.size === 0) {
  const ops = [
    { type: 'rectangle', x: -200, y: -150, width: 400, height: 300 },
    { type: 'line', x1: -200, y1: 0, x2: 200, y2: 0 },
    { type: 'line', x1: 0, y1: -150, x2: 0, y2: 150 },
    { type: 'circle', cx: -100, cy: 75, radius: 40 },
    { type: 'circle', cx: 100, cy: 75, radius: 40 },
    { type: 'circle', cx: -100, cy: -75, radius: 40 },
    { type: 'circle', cx: 100, cy: -75, radius: 40 },
    { type: 'text', x: -180, y: -170, text: 'BACKBONE CAD', height: 20 },
  ];
  for (const entity of ops) {
    app.doc.executeOperation({ action: 'add_entity', entity });
  }
  app.doc.undo.clear();
  app.zoomFit();
}
