import { Entity } from '../Entity.js';

export class ArcEntity extends Entity {
  constructor(props = {}) {
    super('arc', props);
    this.cx = props.cx || 0; this.cy = props.cy || 0;
    this.radius = props.radius || 10;
    this.startAngle = props.startAngle || 0;
    this.endAngle = props.endAngle || Math.PI;
  }

  toJSON() { return { ...super.toJSON(), cx: this.cx, cy: this.cy, radius: this.radius, startAngle: this.startAngle, endAngle: this.endAngle }; }
  static fromJSON(d) { return new ArcEntity(d); }

  draw2D(ctx, camera, layerColor) {
    ctx.strokeStyle = this.getDrawColor(layerColor);
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, this.startAngle, this.endAngle);
    ctx.stroke();
  }

  getGripPoints() {
    return [
      { x: this.cx, y: this.cy },
      { x: this.cx + Math.cos(this.startAngle) * this.radius, y: this.cy + Math.sin(this.startAngle) * this.radius },
      { x: this.cx + Math.cos(this.endAngle) * this.radius, y: this.cy + Math.sin(this.endAngle) * this.radius }
    ];
  }

  getBBox() { return { x: this.cx - this.radius, y: this.cy - this.radius, w: this.radius * 2, h: this.radius * 2 }; }

  hitTest(px, py, tol = 5) {
    const d = Math.hypot(px - this.cx, py - this.cy);
    if (Math.abs(d - this.radius) > tol) return false;
    let angle = Math.atan2(py - this.cy, px - this.cx);
    if (angle < 0) angle += Math.PI * 2;
    let start = this.startAngle, end = this.endAngle;
    if (start < 0) start += Math.PI * 2;
    if (end < 0) end += Math.PI * 2;
    if (start <= end) return angle >= start && angle <= end;
    return angle >= start || angle <= end;
  }

  to3DMesh(THREE) {
    const curve = new THREE.ArcCurve(this.cx, -this.cy, this.radius, this.startAngle, this.endAngle, false);
    const points = curve.getPoints(50).map(p => new THREE.Vector3(p.x, 0.1, p.y));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: this.color || '#ffffff' }));
  }
}
