import { Entity } from '../Entity.js';

export class PolylineEntity extends Entity {
  constructor(props = {}) {
    super('polyline', props);
    this.points = props.points || [];
    this.closed = props.closed || false;
  }

  toJSON() { return { ...super.toJSON(), points: this.points, closed: this.closed }; }
  static fromJSON(d) { return new PolylineEntity(d); }

  draw2D(ctx, camera, layerColor) {
    if (this.points.length < 2) return;
    ctx.strokeStyle = this.getDrawColor(layerColor);
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
    if (this.closed) ctx.closePath();
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
      if (distSeg(px, py, this.points[i], this.points[i + 1]) <= tol) return true;
    }
    if (this.closed && this.points.length > 2) {
      if (distSeg(px, py, this.points[this.points.length - 1], this.points[0]) <= tol) return true;
    }
    return false;
  }

  to3DMesh(THREE) {
    const pts = this.points.map(p => new THREE.Vector3(p.x, 0.1, -p.y));
    if (this.closed && pts.length > 0) pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: this.color || '#ffffff' }));
  }
}

function distSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - a.x, py - a.y);
  let t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
