import { PolylineEntity } from '../core/entities/Polyline.js';

export class PolylineTool {
  constructor(app) { this.app = app; this.points = []; }
  activate() { this.points = []; this.app.commandLine?.log('POLYLINE: Specify first point'); }
  deactivate() { this.points = []; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    this.points.push(pt);
    this.app.commandLine?.log('POLYLINE: Next point (Enter to finish, C to close)');
  }

  onMouseMove(e, wx, wy) {
    if (!this.points.length) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      ctx.strokeStyle = '#0078d4'; ctx.lineWidth = 1 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }

  onKeyDown(e) {
    if ((e.key === 'Enter' || e.key === 'c' || e.key === 'C') && this.points.length >= 2) {
      const closed = e.key === 'c' || e.key === 'C';
      this.app.doc.addEntity(new PolylineEntity({ points: [...this.points], closed }));
      this.points = [];
      this.app.renderer2d.toolPreview = null;
      this.app.commandLine?.log('POLYLINE: Specify first point');
    } else if (e.key === 'Escape') {
      this.cancel();
    }
  }

  cancel() { this.points = []; this.app.renderer2d.toolPreview = null; }
}
