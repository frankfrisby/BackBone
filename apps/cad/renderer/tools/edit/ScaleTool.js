export class ScaleTool {
  constructor(app) { this.app = app; this.basePoint = null; }
  activate() {
    this.basePoint = null;
    if (this.app.selection.count() === 0) { this.app.commandLine?.log('SCALE: Select objects first'); return; }
    this.app.commandLine?.log('SCALE: Specify base point');
  }
  deactivate() { this.basePoint = null; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    if (!this.basePoint) {
      this.basePoint = pt;
      this.app.commandLine?.log('SCALE: Specify scale factor (click or type)');
    } else {
      const d = Math.hypot(pt.x - this.basePoint.x, pt.y - this.basePoint.y);
      const factor = d / 50;
      for (const entity of this.app.selection.items()) {
        const json = entity.toJSON();
        const scaled = scaleEntityData(json, this.basePoint, factor);
        this.app.doc.updateEntity(entity.id, scaled);
      }
      this.basePoint = null;
      this.app.renderer2d.toolPreview = null;
      this.app.toolCtrl.activate('select');
    }
  }

  cancel() { this.basePoint = null; this.app.renderer2d.toolPreview = null; }

  handleValue(val) {
    if (this.basePoint) {
      for (const entity of this.app.selection.items()) {
        const json = entity.toJSON();
        const scaled = scaleEntityData(json, this.basePoint, val);
        this.app.doc.updateEntity(entity.id, scaled);
      }
      this.basePoint = null;
      this.app.renderer2d.toolPreview = null;
      this.app.toolCtrl.activate('select');
    }
  }
}

function scaleEntityData(json, center, factor) {
  const sc = (x, y) => ({
    x: center.x + (x - center.x) * factor,
    y: center.y + (y - center.y) * factor
  });
  const props = {};
  if ('x1' in json) { const p1 = sc(json.x1, json.y1); const p2 = sc(json.x2, json.y2); Object.assign(props, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }); }
  if ('cx' in json) { const p = sc(json.cx, json.cy); props.cx = p.x; props.cy = p.y; }
  if ('radius' in json) props.radius = json.radius * factor;
  if ('rx' in json) { props.rx = json.rx * factor; props.ry = json.ry * factor; }
  if ('x' in json && 'y' in json && !('cx' in json)) { const p = sc(json.x, json.y); props.x = p.x; props.y = p.y; }
  if ('width' in json) { props.width = json.width * factor; props.height = json.height * factor; }
  if ('points' in json) { props.points = json.points.map(p => sc(p.x, p.y)); }
  return props;
}
