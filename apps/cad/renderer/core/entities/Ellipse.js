import { Entity } from '../Entity.js';

export class EllipseEntity extends Entity {
  constructor(props = {}) {
    super('ellipse', props);
    this.cx = props.cx || 0; this.cy = props.cy || 0;
    this.rx = props.rx || 20; this.ry = props.ry || 10;
  }

  toJSON() { return { ...super.toJSON(), cx: this.cx, cy: this.cy, rx: this.rx, ry: this.ry }; }
  static fromJSON(d) { return new EllipseEntity(d); }

  draw2D(ctx, camera, layerColor) {
    ctx.strokeStyle = this.getDrawColor(layerColor);
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    ctx.ellipse(this.cx, this.cy, this.rx, this.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  getGripPoints() {
    return [{ x: this.cx, y: this.cy }, { x: this.cx + this.rx, y: this.cy }, { x: this.cx, y: this.cy + this.ry }];
  }

  getBBox() { return { x: this.cx - this.rx, y: this.cy - this.ry, w: this.rx * 2, h: this.ry * 2 }; }

  hitTest(px, py, tol = 5) {
    const nx = (px - this.cx) / this.rx, ny = (py - this.cy) / this.ry;
    const d = Math.sqrt(nx * nx + ny * ny);
    return Math.abs(d - 1) * Math.min(this.rx, this.ry) <= tol;
  }

  to3DMesh(THREE) {
    const curve = new THREE.EllipseCurve(this.cx, -this.cy, this.rx, this.ry, 0, Math.PI * 2, false);
    const pts = curve.getPoints(64).map(p => new THREE.Vector3(p.x, 0.1, p.y));
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: this.color || '#ffffff' }));
  }
}
