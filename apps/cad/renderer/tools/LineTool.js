import { LineEntity } from '../core/entities/Line.js';

export class LineTool {
  constructor(app) {
    this.app = app;
    this.firstPoint = null;
  }

  activate() {
    this.firstPoint = null;
    this.app.commandLine?.log('LINE: Specify first point');
  }

  deactivate() {
    this.firstPoint = null;
    this.app.renderer2d.toolPreview = null;
  }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    if (!this.firstPoint) {
      this.firstPoint = pt;
      this.app.commandLine?.log(`First point: ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}`);
      this.app.commandLine?.log('LINE: Specify next point');
    } else {
      const entity = new LineEntity({
        x1: this.firstPoint.x, y1: this.firstPoint.y,
        x2: pt.x, y2: pt.y
      });
      this.app.doc.addEntity(entity);
      this.app.commandLine?.log(`Line to: ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}`);
      // Continue chain
      this.firstPoint = pt;
      this.app.commandLine?.log('LINE: Specify next point (Enter to finish)');
    }
  }

  onMouseMove(e, wx, wy) {
    if (!this.firstPoint) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    this.app.renderer2d.toolPreview = (ctx, cam) => {
      ctx.strokeStyle = '#0078d4';
      ctx.lineWidth = 1 / cam.scale;
      ctx.setLineDash([4 / cam.scale, 4 / cam.scale]);
      ctx.beginPath();
      ctx.moveTo(this.firstPoint.x, this.firstPoint.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }

  onKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'Escape') {
      this.firstPoint = null;
      this.app.renderer2d.toolPreview = null;
      if (e.key === 'Escape') this.app.toolCtrl.activate('select');
    }
  }

  cancel() {
    this.firstPoint = null;
    this.app.renderer2d.toolPreview = null;
  }

  handleCoord(pt) {
    if (!this.firstPoint) {
      this.firstPoint = pt;
      this.app.commandLine?.log('LINE: Specify next point');
    } else {
      const entity = new LineEntity({
        x1: this.firstPoint.x, y1: this.firstPoint.y,
        x2: pt.x, y2: pt.y
      });
      this.app.doc.addEntity(entity);
      this.firstPoint = pt;
    }
  }
}
