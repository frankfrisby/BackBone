import { Entity } from '../Entity.js';

export class CircleEntity extends Entity {
  constructor(props = {}) {
    super('circle', props);
    this.cx = props.cx || 0; this.cy = props.cy || 0;
    this.radius = props.radius || 10;
  }

  toJSON() { return { ...super.toJSON(), cx: this.cx, cy: this.cy, radius: this.radius }; }
  static fromJSON(d) { return new CircleEntity(d); }

  draw2D(ctx, camera, layerColor) {
    ctx.strokeStyle = this.getDrawColor(layerColor);
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  getGripPoints() {
    return [
      { x: this.cx, y: this.cy },
      { x: this.cx + this.radius, y: this.cy },
      { x: this.cx, y: this.cy + this.radius },
      { x: this.cx - this.radius, y: this.cy },
      { x: this.cx, y: this.cy - this.radius }
    ];
  }

  getBBox() { return { x: this.cx - this.radius, y: this.cy - this.radius, w: this.radius * 2, h: this.radius * 2 }; }

  hitTest(px, py, tol = 5) {
    const d = Math.hypot(px - this.cx, py - this.cy);
    return Math.abs(d - this.radius) <= tol;
  }

  to3DMesh(THREE) {
    const geo = new THREE.CylinderGeometry(this.radius, this.radius, 0.5, 64);
    const mat = new THREE.MeshPhongMaterial({ color: this.color || '#ffffff', transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.cx, 0.25, -this.cy);
    return mesh;
  }
}
