export class RotateTool {
  constructor(app) { this.app = app; this.basePoint = null; this.refAngle = null; }
  activate() {
    this.basePoint = null; this.refAngle = null;
    if (this.app.selection.count() === 0) { this.app.commandLine?.log('ROTATE: Select objects first'); return; }
    this.app.commandLine?.log('ROTATE: Specify base point');
  }
  deactivate() { this.basePoint = null; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    if (!this.basePoint) {
      this.basePoint = pt;
      this.refAngle = 0;
      this.app.commandLine?.log('ROTATE: Specify rotation angle (click or type degrees)');
    } else {
      const angle = Math.atan2(pt.y - this.basePoint.y, pt.x - this.basePoint.x);
      for (const entity of this.app.selection.items()) {
        const json = entity.toJSON();
        const rotated = rotateEntityData(json, this.basePoint, angle);
        this.app.doc.updateEntity(entity.id, rotated);
      }
      this.basePoint = null;
      this.app.renderer2d.toolPreview = null;
      this.app.toolCtrl.activate('select');
    }
  }

  cancel() { this.basePoint = null; this.app.renderer2d.toolPreview = null; }
}

function rotateEntityData(json, center, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rot = (x, y) => ({
    x: center.x + (x - center.x) * cos - (y - center.y) * sin,
    y: center.y + (x - center.x) * sin + (y - center.y) * cos
  });
  const props = {};
  if ('x1' in json) { const p1 = rot(json.x1, json.y1); const p2 = rot(json.x2, json.y2); Object.assign(props, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }); }
  if ('cx' in json) { const p = rot(json.cx, json.cy); props.cx = p.x; props.cy = p.y; }
  if ('x' in json && 'y' in json && !('cx' in json)) { const p = rot(json.x, json.y); props.x = p.x; props.y = p.y; }
  if ('points' in json) { props.points = json.points.map(p => rot(p.x, p.y)); }
  return props;
}
