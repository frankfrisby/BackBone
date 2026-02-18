import { Entity } from '../Entity.js';

export class SplineEntity extends Entity {
  constructor(props = {}) {
    super('spline', props);
    this.points = props.points || [];
  }

  toJSON() { return { ...super.toJSON(), points: this.points }; }
  static fromJSON(d) { return new SplineEntity(d); }

  draw2D(ctx, camera, layerColor) {
    if (this.points.length < 2) return;
    ctx.strokeStyle = this.getDrawColor(layerColor);
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    if (this.points.length === 2) {
      ctx.lineTo(this.points[1].x, this.points[1].y);
    } else {
      for (let i = 1; i < this.points.length - 1; i++) {
        const xc = (this.points[i].x + this.points[i + 1].x) / 2;
        const yc = (this.points[i].y + this.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(this.points[i].x, this.points[i].y, xc, yc);
      }
      const last = this.points[this.points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }

  getGripPoints() { return this.points.map(p => ({ x: p.x, y: p.y })); }

  getBBox() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  hitTest(px, py, tol = 5) {
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i], b = this.points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, lenSq = dx * dx + dy * dy;
      let t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
      if (Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)) <= tol) return true;
    }
    return false;
  }

  to3DMesh(THREE) {
    const pts = this.points.map(p => new THREE.Vector3(p.x, 0.1, -p.y));
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: this.color || '#ffffff' }));
  }
}
