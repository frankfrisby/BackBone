import { Entity } from '../Entity.js';

export class RectangleEntity extends Entity {
  constructor(props = {}) {
    super('rectangle', props);
    this.x = props.x || 0; this.y = props.y || 0;
    this.width = props.width || 50; this.height = props.height || 30;
  }

  toJSON() { return { ...super.toJSON(), x: this.x, y: this.y, width: this.width, height: this.height }; }
  static fromJSON(d) { return new RectangleEntity(d); }

  draw2D(ctx, camera, layerColor) {
    ctx.strokeStyle = this.getDrawColor(layerColor);
    ctx.lineWidth = this.lineWidth;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  }

  getGripPoints() {
    return [
      { x: this.x, y: this.y }, { x: this.x + this.width, y: this.y },
      { x: this.x + this.width, y: this.y + this.height }, { x: this.x, y: this.y + this.height },
      { x: this.x + this.width / 2, y: this.y + this.height / 2 }
    ];
  }

  getBBox() { return { x: this.x, y: this.y, w: this.width, h: this.height }; }

  hitTest(px, py, tol = 5) {
    const l = this.x, r = this.x + this.width, t = this.y, b = this.y + this.height;
    const dL = Math.abs(px - l), dR = Math.abs(px - r), dT = Math.abs(py - t), dB = Math.abs(py - b);
    const inX = px >= l - tol && px <= r + tol;
    const inY = py >= t - tol && py <= b + tol;
    return (inY && (dL <= tol || dR <= tol)) || (inX && (dT <= tol || dB <= tol));
  }

  to3DMesh(THREE) {
    const geo = new THREE.BoxGeometry(this.width, 0.5, this.height);
    const mat = new THREE.MeshPhongMaterial({ color: this.color || '#ffffff', transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.x + this.width / 2, 0.25, -(this.y + this.height / 2));
    return mesh;
  }
}
