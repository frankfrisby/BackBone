const TOOLS = [
  { id: 'select', icon: '⊹', label: 'Select' },
  { id: 'line', icon: '╱', label: 'Line' },
  { id: 'arc', icon: '⌒', label: 'Arc' },
  { id: 'circle', icon: '○', label: 'Circle' },
  { id: 'rectangle', icon: '▭', label: 'Rectangle' },
  { id: 'polyline', icon: '⏣', label: 'Polyline' },
  { id: 'ellipse', icon: '⬭', label: 'Ellipse' },
  { id: 'spline', icon: '〜', label: 'Spline' },
  { id: 'text', icon: 'T', label: 'Text' },
];

export class ToolBar {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'toolbar';
    this.activeTool = 'select';
  }

  render() {
    this.el.innerHTML = '';
    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.textContent = tool.icon;
      btn.title = tool.label;
      if (this.activeTool === tool.id) btn.className = 'active';
      btn.onclick = () => {
        this.activeTool = tool.id;
        this.app.toolCtrl.activate(tool.id);
        this.render();
      };
      this.el.appendChild(btn);
    }
    document.getElementById('app').appendChild(this.el);
  }

  setActive(name) {
    this.activeTool = name;
    this.render();
  }
}
