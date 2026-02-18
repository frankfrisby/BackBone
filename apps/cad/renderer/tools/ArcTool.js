import { ArcEntity } from '../core/entities/Arc.js';

export class ArcTool {
  constructor(app) {
    this.app = app;
    this.points = [];
  }

  activate() { this.points = []; this.app.commandLine?.log('ARC: Specify start point'); }
  deactivate() { this.points = []; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    this.points.push(pt);
    if (this.points.length === 1) this.app.commandLine?.log('ARC: Specify second point');
    else if (this.points.length === 2) this.app.commandLine?.log('ARC: Specify end point');
    else if (this.points.length === 3) {
      // 3-point arc: compute center, radius, angles
      const [p1, p2, p3] = this.points;
      const arc = threePointArc(p1, p2, p3);
      if (arc) this.app.doc.addEntity(new ArcEntity(arc));
      this.points = [];
      this.app.commandLine?.log('ARC: Specify start point');
    }
  }

  onMouseMove(e, wx, wy) {
    if (this.points.length === 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      ctx.strokeStyle = '#0078d4';
      ctx.lineWidth = 1 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.beginPath();
      if (this.points.length === 1) {
        ctx.moveTo(this.points[0].x, this.points[0].y);
        ctx.lineTo(pt.x, pt.y);
      } else if (this.points.length === 2) {
        const arc = threePointArc(this.points[0], this.points[1], pt);
        if (arc) ctx.arc(arc.cx, arc.cy, arc.radius, arc.startAngle, arc.endAngle);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }

  cancel() { this.points = []; this.app.renderer2d.toolPreview = null; }
}

function threePointArc(p1, p2, p3) {
  const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-10) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const startAngle = Math.atan2(ay - uy, ax - ux);
  const endAngle = Math.atan2(cy - uy, cx - ux);
  return { cx: ux, cy: uy, radius: r, startAngle, endAngle };
}
