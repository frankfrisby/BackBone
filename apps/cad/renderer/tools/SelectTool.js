export class SelectTool {
  constructor(app) {
    this.app = app;
    this.dragging = false;
    this.dragStart = null;
  }

  activate() {
    this.app.renderer2d.toolPreview = null;
  }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    this.dragging = true;
    this.dragStart = { x: wx, y: wy };
  }

  onMouseMove(e, wx, wy) {
    if (!this.dragging) return;
    const { x: x1, y: y1 } = this.dragStart;
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      const crossing = wx < x1;
      ctx.strokeStyle = crossing ? '#00ff00' : '#0078d4';
      ctx.fillStyle = crossing ? 'rgba(0,255,0,0.05)' : 'rgba(0,120,212,0.05)';
      ctx.lineWidth = 1 / cam.scale;
      if (crossing) ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.fillRect(x1, y1, wx - x1, wy - y1);
      ctx.strokeRect(x1, y1, wx - x1, wy - y1);
      ctx.setLineDash([]);
    };
  }

  onMouseUp(e, wx, wy) {
    if (!this.dragging) return;
    this.dragging = false;
    this.app.renderer2d.toolPreview = null;

    const { x: x1, y: y1 } = this.dragStart;
    const dist = Math.hypot(wx - x1, wy - y1);

    if (dist < 3 / this.app.renderer2d.camera.scale) {
      // Click select
      const hit = this.app.renderer2d.hitTester.hitTest(wx, wy, this.app.renderer2d.camera);
      if (!e.shiftKey) this.app.selection.clear();
      if (hit) this.app.selection.toggle(hit);
    } else {
      // Window/crossing select
      const crossing = wx < x1;
      const hits = this.app.renderer2d.hitTester.windowSelect(x1, y1, wx, wy, crossing);
      if (!e.shiftKey) this.app.selection.clear();
      for (const h of hits) this.app.selection.add(h);
    }
  }

  cancel() {
    this.dragging = false;
    this.app.renderer2d.toolPreview = null;
    this.app.selection.clear();
  }
}
