import { Entity } from '../Entity.js';

export class TextEntity extends Entity {
  constructor(props = {}) {
    super('text', props);
    this.x = props.x || 0; this.y = props.y || 0;
    this.text = props.text || 'Text';
    this.height = props.height || 10;
    this.fontFamily = props.fontFamily || 'monospace';
  }

  toJSON() { return { ...super.toJSON(), x: this.x, y: this.y, text: this.text, height: this.height, fontFamily: this.fontFamily }; }
  static fromJSON(d) { return new TextEntity(d); }

  draw2D(ctx, camera, layerColor) {
    ctx.fillStyle = this.getDrawColor(layerColor);
    ctx.font = `${this.height}px ${this.fontFamily}`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(this.text, this.x, this.y);
  }

  getGripPoints() { return [{ x: this.x, y: this.y }]; }

  getBBox() {
    const w = this.text.length * this.height * 0.6;
    return { x: this.x, y: this.y - this.height, w, h: this.height };
  }

  hitTest(px, py, tol = 5) {
    const bb = this.getBBox();
    return px >= bb.x - tol && px <= bb.x + bb.w + tol && py >= bb.y - tol && py <= bb.y + bb.h + tol;
  }

  to3DMesh(THREE) { return null; /* Text not rendered in 3D for now */ }
}
