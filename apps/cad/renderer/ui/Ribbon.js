export class Ribbon {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'ribbon';
    this.mode3d = false;
  }

  render() {
    this.el.innerHTML = '';

    // File group
    const fileGroup = this._group('File');
    this._btn(fileGroup, 'New', () => this.app.newDrawing());
    this._btn(fileGroup, 'Open', () => this.app.openFile());
    this._btn(fileGroup, 'Save', () => this.app.saveFile());
    this._btn(fileGroup, 'Save As', () => this.app.saveFileAs());

    // Export group
    const exportGroup = this._group('Export');
    this._btn(exportGroup, 'DXF', () => this.app.exportDXF());
    this._btn(exportGroup, 'PDF', () => this.app.exportPDF());

    // View group
    const viewGroup = this._group('View');
    this._btn(viewGroup, '2D', () => this.setMode(false), !this.mode3d);
    this._btn(viewGroup, '3D', () => this.setMode(true), this.mode3d);
    this._btn(viewGroup, 'Zoom Fit', () => this.app.zoomFit());

    // Transform group
    const transGroup = this._group('Edit');
    this._btn(transGroup, 'Move', () => this.app.toolCtrl.activate('move'));
    this._btn(transGroup, 'Rotate', () => this.app.toolCtrl.activate('rotate'));
    this._btn(transGroup, 'Scale', () => this.app.toolCtrl.activate('scale'));
    this._btn(transGroup, 'Mirror', () => this.app.toolCtrl.activate('mirror'));
    this._btn(transGroup, 'Delete', () => this.app.selection.deleteSelected(this.app.doc));

    // Undo/Redo
    const undoGroup = this._group('History');
    this._btn(undoGroup, 'Undo', () => this.app.doc.undo.undo());
    this._btn(undoGroup, 'Redo', () => this.app.doc.undo.redo());

    document.getElementById('app').appendChild(this.el);
  }

  setMode(is3d) {
    this.mode3d = is3d;
    this.app.setViewMode(is3d ? '3d' : '2d');
    this.render();
  }

  _group(label) {
    const g = document.createElement('div');
    g.className = 'ribbon-group';
    this.el.appendChild(g);
    return g;
  }

  _btn(parent, label, onClick, active = false) {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (active) btn.className = 'active';
    btn.onclick = onClick;
    parent.appendChild(btn);
    return btn;
  }
}
