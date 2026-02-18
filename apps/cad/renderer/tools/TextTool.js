import { TextEntity } from '../core/entities/Text.js';

export class TextTool {
  constructor(app) { this.app = app; }
  activate() { this.app.commandLine?.log('TEXT: Click to place, then type text in command line'); }
  deactivate() { this.app.renderer2d.toolPreview = null; }

  onMouseDown(e, wx, wy) {
    if (e.button !== 0) return;
    const pt = this.app.renderer2d.snap.snap(wx, wy, this.app.renderer2d.camera);
    const text = prompt('Enter text:') || 'Text';
    this.app.doc.addEntity(new TextEntity({ x: pt.x, y: pt.y, text, height: 10 }));
  }

  cancel() {}
}
