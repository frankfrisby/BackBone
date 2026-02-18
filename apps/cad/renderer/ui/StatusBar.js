export class StatusBar {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'statusbar';
  }

  render() {
    this.el.innerHTML = `
      <div class="coords" id="status-coords">X: 0.00 Y: 0.00</div>
      <div>
        <span class="snap-indicator" id="status-snap">SNAP</span>
        &nbsp;|&nbsp;
        <span id="status-layer">Layer: 0</span>
        &nbsp;|&nbsp;
        <span id="status-tool">Select</span>
      </div>
    `;
    document.getElementById('app').appendChild(this.el);
  }

  setCoords(x, y) {
    const el = document.getElementById('status-coords');
    if (el) el.textContent = `X: ${x.toFixed(2)}  Y: ${y.toFixed(2)}`;
  }

  setSnap(on) {
    const el = document.getElementById('status-snap');
    if (el) el.className = on ? 'snap-indicator' : 'snap-indicator off';
  }

  setLayer(name) {
    const el = document.getElementById('status-layer');
    if (el) el.textContent = `Layer: ${name}`;
  }

  setTool(name) {
    const el = document.getElementById('status-tool');
    if (el) el.textContent = name;
  }
}
