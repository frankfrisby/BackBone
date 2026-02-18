import { RectangleEntity } from '../core/entities/Rectangle.js';

export class RectangleTool {
  constructor(app) { this.app = app; this.corner = null; }
  activate() { this.corner = null; this.app.commandLine?.log('RECTANGLE: Specify first corner'); }
  deactivate() { this.corner = null; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    if (!this.corner) {
      this.corner = pt;
      this.app.commandLine?.log('RECTANGLE: Specify opposite corner');
    } else {
      const x = Math.min(this.corner.x, pt.x), y = Math.min(this.corner.y, pt.y);
      const w = Math.abs(pt.x - this.corner.x), h = Math.abs(pt.y - this.corner.y);
      this.app.doc.addEntity(new RectangleEntity({ x, y, width: w, height: h }));
      this.corner = null;
      this.app.renderer2d.toolPreview = null;
      this.app.commandLine?.log('RECTANGLE: Specify first corner');
    }
  }

  onMouseMove(e, wx, wy) {
    if (!this.corner) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      ctx.strokeStyle = '#0078d4'; ctx.lineWidth = 1 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      const x = Math.min(this.corner.x, pt.x), y = Math.min(this.corner.y, pt.y);
      ctx.strokeRect(x, y, Math.abs(pt.x - this.corner.x), Math.abs(pt.y - this.corner.y));
      ctx.setLineDash([]);
    };
  }

  cancel() { this.corner = null; this.app.renderer2d.toolPreview = null; }
}
