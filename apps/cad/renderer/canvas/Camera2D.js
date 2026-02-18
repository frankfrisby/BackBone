export class Camera2D {
  constructor() {
    this.tx = 0; this.ty = 0;
    this.scale = 1;
    this.minScale = 0.01;
    this.maxScale = 100;
  }

  worldToScreen(wx, wy) {
    return { x: wx * this.scale + this.tx, y: wy * this.scale + this.ty };
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale };
  }

  zoom(delta, cx, cy) {
    const oldScale = this.scale;
    const factor = delta > 0 ? 1.1 : 1 / 1.1;
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    // Zoom centered on cursor
    this.tx = cx - (cx - this.tx) * (this.scale / oldScale);
    this.ty = cy - (cy - this.ty) * (this.scale / oldScale);
  }

  pan(dx, dy) {
    this.tx += dx;
    this.ty += dy;
  }

  applyTransform(ctx) {
    ctx.setTransform(this.scale, 0, 0, this.scale, this.tx, this.ty);
  }

  reset(ctx) {
    ctx.setTransform(1, 0, 0, 0, 0, 0);
  }

  fitExtents(bbox, canvasW, canvasH) {
    const padding = 50;
    const scaleX = (canvasW - padding * 2) / (bbox.w || 1);
    const scaleY = (canvasH - padding * 2) / (bbox.h || 1);
    this.scale = Math.min(scaleX, scaleY);
    this.tx = canvasW / 2 - (bbox.x + bbox.w / 2) * this.scale;
    this.ty = canvasH / 2 - (bbox.y + bbox.h / 2) * this.scale;
  }
}
