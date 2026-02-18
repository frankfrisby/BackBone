export class Crosshair2D {
  constructor() {
    this.x = 0; this.y = 0;
    this.visible = true;
  }

  update(worldX, worldY) {
    this.x = worldX;
    this.y = worldY;
  }

  draw(ctx, camera, canvasW, canvasH) {
    if (!this.visible) return;
    const tl = camera.screenToWorld(0, 0);
    const br = camera.screenToWorld(canvasW, canvasH);

    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 0.5 / camera.scale;
    ctx.setLineDash([4 / camera.scale, 4 / camera.scale]);
    ctx.beginPath();
    ctx.moveTo(tl.x, this.y); ctx.lineTo(br.x, this.y);
    ctx.moveTo(this.x, tl.y); ctx.lineTo(this.x, br.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
