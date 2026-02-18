import { Camera2D } from './Camera2D.js';
import { Grid2D } from './Grid2D.js';
import { Crosshair2D } from './Crosshair2D.js';
import { SnapEngine } from './SnapEngine.js';
import { HitTester2D } from './HitTester2D.js';

export class Renderer2D {
  constructor(canvas, doc) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.doc = doc;
    this.camera = new Camera2D();
    this.grid = new Grid2D();
    this.crosshair = new Crosshair2D();
    this.snap = new SnapEngine(doc);
    this.hitTester = new HitTester2D(doc);
    this.toolPreview = null; // function(ctx, camera)
    this.running = false;

    // Center origin
    this.camera.tx = canvas.width / 2;
    this.camera.ty = canvas.height / 2;
  }

  start() {
    this.running = true;
    this._frame();
  }

  stop() { this.running = false; }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  _frame() {
    if (!this.running) return;
    this.render();
    requestAnimationFrame(() => this._frame());
  }

  render() {
    const { ctx, canvas, camera, doc } = this;
    const w = canvas.width, h = canvas.height;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);

    // Apply camera
    camera.applyTransform(ctx);

    // Grid
    this.grid.draw(ctx, camera, w, h);

    // Entities
    for (const entity of doc.entities.values()) {
      const layer = doc.getLayer(entity.layer);
      if (!layer.visible) continue;
      entity.draw2D(ctx, camera, layer.color);
    }

    // Selection grips
    for (const entity of doc.entities.values()) {
      if (!entity.selected) continue;
      const grips = entity.getGripPoints();
      const gs = 4 / camera.scale;
      ctx.fillStyle = '#0066ff';
      for (const g of grips) {
        ctx.fillRect(g.x - gs, g.y - gs, gs * 2, gs * 2);
      }
    }

    // Snap indicator
    this.snap.drawIndicator(ctx, camera);

    // Tool preview
    if (this.toolPreview) this.toolPreview(ctx, camera);

    // Crosshair
    this.crosshair.draw(ctx, camera, w, h);
  }

  getImageDataUrl() {
    // Render at 2x for PDF export
    const w = this.canvas.width * 2, h = this.canvas.height * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = w; offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const savedTx = this.camera.tx, savedTy = this.camera.ty, savedScale = this.camera.scale;
    this.camera.tx *= 2; this.camera.ty *= 2; this.camera.scale *= 2;
    this.camera.applyTransform(ctx);
    for (const entity of this.doc.entities.values()) {
      const layer = this.doc.getLayer(entity.layer);
      if (!layer.visible) continue;
      entity.draw2D(ctx, this.camera, '#000000');
    }
    this.camera.tx = savedTx; this.camera.ty = savedTy; this.camera.scale = savedScale;
    return offscreen.toDataURL('image/png');
  }
}
