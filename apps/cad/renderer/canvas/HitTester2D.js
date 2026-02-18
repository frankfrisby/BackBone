export class HitTester2D {
  constructor(doc) {
    this.doc = doc;
  }

  hitTest(worldX, worldY, camera) {
    const tolerance = 5 / camera.scale;
    // Reverse order: topmost entity first
    const entities = [...this.doc.entities.values()].reverse();
    for (const entity of entities) {
      const layer = this.doc.getLayer(entity.layer);
      if (!layer.visible || layer.locked) continue;
      if (entity.hitTest(worldX, worldY, tolerance)) return entity;
    }
    return null;
  }

  windowSelect(x1, y1, x2, y2, crossing = false) {
    const left = Math.min(x1, x2), right = Math.max(x1, x2);
    const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
    const results = [];
    for (const entity of this.doc.entities.values()) {
      const layer = this.doc.getLayer(entity.layer);
      if (!layer.visible || layer.locked) continue;
      const bb = entity.getBBox();
      if (crossing) {
        // Crossing: any overlap
        if (bb.x + bb.w >= left && bb.x <= right && bb.y + bb.h >= top && bb.y <= bottom) {
          results.push(entity);
        }
      } else {
        // Window: fully inside
        if (bb.x >= left && bb.x + bb.w <= right && bb.y >= top && bb.y + bb.h <= bottom) {
          results.push(entity);
        }
      }
    }
    return results;
  }
}
