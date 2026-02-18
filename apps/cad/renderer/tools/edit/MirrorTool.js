export class MirrorTool {
  constructor(app) { this.app = app; this.p1 = null; }
  activate() {
    this.p1 = null;
    if (this.app.selection.count() === 0) { this.app.commandLine?.log('MIRROR: Select objects first'); return; }
    this.app.commandLine?.log('MIRROR: Specify first point of mirror line');
  }
  deactivate() { this.p1 = null; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    if (!this.p1) {
      this.p1 = pt;
      this.app.commandLine?.log('MIRROR: Specify second point of mirror line');
    } else {
      for (const entity of this.app.selection.items()) {
        const json = entity.toJSON();
        const mirrored = mirrorEntityData(json, this.p1, pt);
        this.app.doc.updateEntity(entity.id, mirrored);
      }
      this.p1 = null;
      this.app.renderer2d.toolPreview = null;
      this.app.toolCtrl.activate('select');
    }
  }

  cancel() { this.p1 = null; this.app.renderer2d.toolPreview = null; }
}

function mirrorEntityData(json, p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  const mir = (x, y) => {
    const t = ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq;
    return { x: 2 * (p1.x + t * dx) - x, y: 2 * (p1.y + t * dy) - y };
  };
  const props = {};
  if ('x1' in json) { const a = mir(json.x1, json.y1); const b = mir(json.x2, json.y2); Object.assign(props, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
  if ('cx' in json) { const c = mir(json.cx, json.cy); props.cx = c.x; props.cy = c.y; }
  if ('x' in json && 'y' in json && !('cx' in json)) { const c = mir(json.x, json.y); props.x = c.x; props.y = c.y; }
  if ('points' in json) { props.points = json.points.map(p => mir(p.x, p.y)); }
  return props;
}
