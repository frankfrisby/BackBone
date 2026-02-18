export class MoveTool {
  constructor(app) { this.app = app; this.basePoint = null; }
  activate() {
    this.basePoint = null;
    if (this.app.selection.count() === 0) { this.app.commandLine?.log('MOVE: Select objects first'); return; }
    this.app.commandLine?.log('MOVE: Specify base point');
  }
  deactivate() { this.basePoint = null; this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    if (!this.basePoint) {
      this.basePoint = pt;
      this.app.commandLine?.log('MOVE: Specify destination');
    } else {
      const dx = pt.x - this.basePoint.x, dy = pt.y - this.basePoint.y;
      for (const entity of this.app.selection.items()) {
        const json = entity.toJSON();
        const moved = moveEntityData(json, dx, dy);
        this.app.doc.updateEntity(entity.id, moved);
      }
      this.basePoint = null;
      this.app.renderer2d.toolPreview = null;
      this.app.toolCtrl.activate('select');
    }
  }

  onMouseMove(e, wx, wy) {
    if (!this.basePoint) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    const dx = pt.x - this.basePoint.x, dy = pt.y - this.basePoint.y;
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      ctx.strokeStyle = '#0078d4'; ctx.lineWidth = 1 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.beginPath();
      ctx.moveTo(this.basePoint.x, this.basePoint.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }

  cancel() { this.basePoint = null; this.app.renderer2d.toolPreview = null; }
}

function moveEntityData(json, dx, dy) {
  const props = {};
  if ('x1' in json) { props.x1 = json.x1 + dx; props.y1 = json.y1 + dy; props.x2 = json.x2 + dx; props.y2 = json.y2 + dy; }
  if ('cx' in json) { props.cx = json.cx + dx; props.cy = json.cy + dy; }
  if ('x' in json && 'y' in json && !('cx' in json)) { props.x = json.x + dx; props.y = json.y + dy; }
  if ('points' in json) { props.points = json.points.map(p => ({ x: p.x + dx, y: p.y + dy })); }
  return props;
}
