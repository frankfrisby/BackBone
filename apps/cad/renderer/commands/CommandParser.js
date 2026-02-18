import { CoordParser } from './CoordParser.js';

export class CommandParser {
  constructor(app) {
    this.app = app;
    this.lastPoint = { x: 0, y: 0 };
  }

  execute(input) {
    input = input.trim();
    if (!input) return;

    // Try as command first
    const handler = this.app.commandRegistry.resolve(input);
    if (handler) {
      handler();
      return;
    }

    // Try as coordinate/value input for active tool
    const parsed = CoordParser.parse(input, this.lastPoint);
    if (parsed && this.app.toolCtrl.activeTool) {
      if ('value' in parsed) {
        this.app.toolCtrl.activeTool.handleValue?.(parsed.value);
      } else {
        this.lastPoint = parsed;
        this.app.toolCtrl.activeTool.handleCoord?.(parsed);
      }
      return;
    }

    this.app.commandLine?.log(`Unknown command: ${input}`);
  }
}
