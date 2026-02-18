import { SplineEntity } from '../core/entities/Spline.js';

export class SplineTool {
  constructor(app) { this.app = app; this.points = []; }
  activate() { this.points = []; this.app.commandLine?.log('SPLINE: Specify points (Enter to finish)'); }
  deactivate() { this.points = []; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    this.points.push(this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera));
  }

  onMouseMove(e, wx, wy) {
    if (!this.points.length) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      ctx.strokeStyle = '#0078d4'; ctx.lineWidth = 1 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (const p of this.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }

  onKeyDown(e) {
    if (e.key === 'Enter' && this.points.length >= 2) {
      this.app.doc.addEntity(new SplineEntity({ points: [...this.points] }));
      this.points = [];
      this.app.renderer2d.toolPreview = null;
    } else if (e.key === 'Escape') this.cancel();
  }

  cancel() { this.points = []; this.app.renderer2d.toolPreview = null; }
}
