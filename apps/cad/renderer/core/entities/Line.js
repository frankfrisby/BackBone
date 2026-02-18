import { Entity } from '../Entity.js';

export class LineEntity extends Entity {
  constructor(props = {}) {
    super('line', props);
    this.x1 = props.x1 || 0; this.y1 = props.y1 || 0;
    this.x2 = props.x2 || 0; this.y2 = props.y2 || 0;
  }

  toJSON() { return { ...super.toJSON(), x1: this.x1, y1: this.y1, x2: this.x2, y2: this.y2 }; }
  static fromJSON(d) { return new LineEntity(d); }

  draw2D(ctx, camera, layerColor) {
    ctx.strokeStyle = this.getDrawColor(layerColor);
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.stroke();
  }

  getGripPoints() { return [{ x: this.x1, y: this.y1 }, { x: this.x2, y: this.y2 }, { x: (this.x1 + this.x2) / 2, y: (this.y1 + this.y2) / 2 }]; }

  getBBox() {
    const x = Math.min(this.x1, this.x2), y = Math.min(this.y1, this.y2);
    return { x, y, w: Math.abs(this.x2 - this.x1), h: Math.abs(this.y2 - this.y1) };
  }

  hitTest(px, py, tol = 5) {
    return distToSegment(px, py, this.x1, this.y1, this.x2, this.y2) <= tol;
  }

  to3DMesh(THREE) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(this.x1, 0.1, -this.y1),
      new THREE.Vector3(this.x2, 0.1, -this.y2)
    ]);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: this.color || '#ffffff' }));
  }
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
