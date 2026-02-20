export class Grid2D {
  draw(ctx, camera, canvasW, canvasH) {
    const topLeft = camera.screenToWorld(0, 0);
    const bottomRight = camera.screenToWorld(canvasW, canvasH);

    // Adaptive grid spacing
    const worldWidth = bottomRight.x - topLeft.x;
    let minor = 10;
    if (worldWidth > 5000) minor = 100;
    else if (worldWidth > 1000) minor = 50;
    else if (worldWidth < 100) minor = 1;
    else if (worldWidth < 500) minor = 5;

    const major = minor * 10;

    // Minor grid
    ctx.strokeStyle = '#2d2d2d';
    ctx.lineWidth = 0.5 / camera.scale;
    this._drawGridLines(ctx, topLeft, bottomRight, minor);

    // Major grid
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1 / camera.scale;
    this._drawGridLines(ctx, topLeft, bottomRight, major);

    // Origin axes
    ctx.lineWidth = 2 / camera.scale;
    ctx.strokeStyle = '#8b3333';
    ctx.beginPath(); ctx.moveTo(topLeft.x, 0); ctx.lineTo(bottomRight.x, 0); ctx.stroke();
    ctx.strokeStyle = '#338b33';
    ctx.beginPath(); ctx.moveTo(0, topLeft.y); ctx.lineTo(0, bottomRight.y); ctx.stroke();

    // Origin marker
    ctx.fillStyle = '#ffffff';
    const r = 3 / camera.scale;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    // Axis labels
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ox = camera.worldToScreen(0, 0);
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = '#8b3333';
    ctx.fillText('X', Math.min(Math.max(ox.x + 15, 15), canvasW - 15), ox.y - 5);
    ctx.fillStyle = '#338b33';
    ctx.fillText('Y', ox.x + 5, Math.min(Math.max(ox.y - 15, 15), canvasH - 10));
    ctx.restore();
    camera.applyTransform(ctx);
  }

  _drawGridLines(ctx, tl, br, spacing) {
    const startX = Math.floor(tl.x / spacing) * spacing;
    const startY = Math.floor(tl.y / spacing) * spacing;
    ctx.beginPath();
    for (let x = startX; x <= br.x; x += spacing) {
      ctx.moveTo(x, tl.y);
      ctx.lineTo(x, br.y);
    }
    for (let y = startY; y <= br.y; y += spacing) {
      ctx.moveTo(tl.x, y);
      ctx.lineTo(br.x, y);
    }
    ctx.stroke();
  }
}
