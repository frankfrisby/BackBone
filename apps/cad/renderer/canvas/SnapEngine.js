export class SnapEngine {
  constructor(doc) {
    this.doc = doc;
    this.enabled = true;
    this.gridSnap = true;
    this.endpointSnap = true;
    this.midpointSnap = true;
    this.snapDistance = 10; // screen pixels
    this.lastSnap = null;
  }

  snap(worldX, worldY, camera) {
    if (!this.enabled) {
      this.lastSnap = null;
      return { x: worldX, y: worldY };
    }

    let bestDist = Infinity;
    let bestPoint = null;
    let snapType = null;

    // Endpoint/midpoint snap
    if (this.endpointSnap || this.midpointSnap) {
      for (const entity of this.doc.entities.values()) {
        const grips = entity.getGripPoints();
        for (const g of grips) {
          const screen = camera.worldToScreen(g.x, g.y);
          const screenMouse = camera.worldToScreen(worldX, worldY);
          const d = Math.hypot(screen.x - screenMouse.x, screen.y - screenMouse.y);
          if (d < this.snapDistance && d < bestDist) {
            bestDist = d;
            bestPoint = g;
            snapType = 'endpoint';
          }
        }
      }
    }

    if (bestPoint) {
      this.lastSnap = { ...bestPoint, type: snapType };
      return bestPoint;
    }

    // Grid snap
    if (this.gridSnap) {
      const gs = this.doc.settings.snapSize || 5;
      const sx = Math.round(worldX / gs) * gs;
      const sy = Math.round(worldY / gs) * gs;
      this.lastSnap = { x: sx, y: sy, type: 'grid' };
      return { x: sx, y: sy };
    }

    this.lastSnap = null;
    return { x: worldX, y: worldY };
  }

  drawIndicator(ctx, camera) {
    if (!this.lastSnap || this.lastSnap.type === 'grid') return;
    const s = 6 / camera.scale;
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1.5 / camera.scale;
    if (this.lastSnap.type === 'endpoint') {
      ctx.strokeRect(this.lastSnap.x - s / 2, this.lastSnap.y - s / 2, s, s);
    } else {
      ctx.beginPath();
      ctx.moveTo(this.lastSnap.x - s / 2, this.lastSnap.y);
      ctx.lineTo(this.lastSnap.x, this.lastSnap.y - s / 2);
      ctx.lineTo(this.lastSnap.x + s / 2, this.lastSnap.y);
      ctx.lineTo(this.lastSnap.x, this.lastSnap.y + s / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }
}
