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
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.5 / camera.scale;
    this._drawGridLines(ctx, topLeft, bottomRight, minor);

    // Major grid
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1 / camera.scale;
    this._drawGridLines(ctx, topLeft, bottomRight, major);

    // Origin axes
    ctx.lineWidth = 1.5 / camera.scale;
    ctx.strokeStyle = '#553333';
    ctx.beginPath(); ctx.moveTo(topLeft.x, 0); ctx.lineTo(bottomRight.x, 0); ctx.stroke();
    ctx.strokeStyle = '#335533';
    ctx.beginPath(); ctx.moveTo(0, topLeft.y); ctx.lineTo(0, bottomRight.y); ctx.stroke();
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
