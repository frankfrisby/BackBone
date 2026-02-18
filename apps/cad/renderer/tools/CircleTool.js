import { CircleEntity } from '../core/entities/Circle.js';

export class CircleTool {
  constructor(app) {
    this.app = app;
    this.center = null;
  }

  activate() {
    this.center = null;
    this.app.commandLine?.log('CIRCLE: Specify center point');
  }

  deactivate() { this.center = null; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    if (!this.center) {
      this.center = pt;
      this.app.commandLine?.log('CIRCLE: Specify radius');
    } else {
      const radius = Math.hypot(pt.x - this.center.x, pt.y - this.center.y);
      this.app.doc.addEntity(new CircleEntity({ cx: this.center.x, cy: this.center.y, radius }));
      this.center = null;
      this.app.renderer2d.toolPreview = null;
      this.app.commandLine?.log('CIRCLE: Specify center point');
    }
  }

  onMouseMove(e, wx, wy) {
    if (!this.center) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    const r = Math.hypot(pt.x - this.center.x, pt.y - this.center.y);
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      ctx.strokeStyle = '#0078d4';
      ctx.lineWidth = 1 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }

  cancel() { this.center = null; this.app.renderer2d.toolPreview = null; }

  handleCoord(pt) {
    if (!this.center) {
      this.center = pt;
      this.app.commandLine?.log('CIRCLE: Specify radius');
    } else {
      const radius = Math.hypot(pt.x - this.center.x, pt.y - this.center.y);
      this.app.doc.addEntity(new CircleEntity({ cx: this.center.x, cy: this.center.y, radius }));
      this.center = null;
    }
  }

  handleValue(val) {
    if (this.center) {
      this.app.doc.addEntity(new CircleEntity({ cx: this.center.x, cy: this.center.y, radius: val }));
      this.center = null;
      this.app.renderer2d.toolPreview = null;
    }
  }
}
