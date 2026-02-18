export class ToolController {
  constructor(app) {
    this.app = app;
    this.activeTool = null;
    this.tools = {};
  }

  register(name, tool) {
    this.tools[name] = tool;
  }

  activate(name) {
    if (this.activeTool) this.activeTool.deactivate?.();
    this.activeTool = this.tools[name] || null;
    if (this.activeTool) this.activeTool.activate?.();
    this.app.statusBar?.setTool(name);
    this.app.commandLine?.log(`Tool: ${name}`);
  }

  onMouseDown(e, worldX, worldY) { this.activeTool?.onMouseDown?.(e, worldX, worldY); }
  onMouseMove(e, worldX, worldY) { this.activeTool?.onMouseMove?.(e, worldX, worldY); }
  onMouseUp(e, worldX, worldY) { this.activeTool?.onMouseUp?.(e, worldX, worldY); }
  onKeyDown(e) { this.activeTool?.onKeyDown?.(e); }

  cancel() {
    this.activeTool?.cancel?.();
    this.activate('select');
  }
}
