import { EllipseEntity } from '../core/entities/Ellipse.js';

export class EllipseTool {
  constructor(app) { this.app = app; this.center = null; }
  activate() { this.center = null; this.app.commandLine?.log('ELLIPSE: Specify center'); }
  deactivate() { this.center = null; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    if (!this.center) {
      this.center = pt;
      this.app.commandLine?.log('ELLIPSE: Specify corner');
    } else {
      const rx = Math.abs(pt.x - this.center.x);
      const ry = Math.abs(pt.y - this.center.y);
      this.app.doc.addEntity(new EllipseEntity({ cx: this.center.x, cy: this.center.y, rx: rx || 1, ry: ry || 1 }));
      this.center = null;
      this.app.renderer2d.toolPreview = null;
    }
  }

  onMouseMove(e, wx, wy) {
    if (!this.center) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      ctx.strokeStyle = '#0078d4'; ctx.lineWidth = 1 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.beginPath();
      ctx.ellipse(this.center.x, this.center.y, Math.abs(pt.x - this.center.x) || 1, Math.abs(pt.y - this.center.y) || 1, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }

  cancel() { this.center = null; this.app.renderer2d.toolPreview = null; }
}
