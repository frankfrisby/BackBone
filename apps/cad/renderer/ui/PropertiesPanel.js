export class PropertiesPanel {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'properties-panel';
  }

  render() {
    document.getElementById('app').appendChild(this.el);
    this.update();

    this.app.selection.addEventListener('changed', () => this.update());
    this.app.doc.addEventListener('layerChanged', () => this.update());
  }

  update() {
    const sel = this.app.selection.items();
    let html = '<h3>Layers</h3>';

    for (const [name, layer] of this.app.doc.layers) {
      const active = name === this.app.doc.currentLayer ? 'active' : '';
      html += `<div class="layer-item ${active}" data-layer="${name}">
        <div class="layer-color" style="background:${layer.color}"></div>
        <span>${name}</span>
      </div>`;
    }

    if (sel.length > 0) {
      html += `<h3>Selection (${sel.length})</h3>`;
      if (sel.length === 1) {
        const e = sel[0];
        html += `<div class="prop-row"><label>Type</label><span>${e.type}</span></div>`;
        html += `<div class="prop-row"><label>Layer</label><span>${e.layer}</span></div>`;
        html += `<div class="prop-row"><label>ID</label><span style="font-size:9px">${e.id.slice(0,8)}</span></div>`;
        const json = e.toJSON();
        for (const [k, v] of Object.entries(json)) {
          if (['id', 'type', 'layer', 'color', 'lineWidth', 'visible'].includes(k)) continue;
          if (typeof v === 'number') {
            html += `<div class="prop-row"><label>${k}</label><span>${v.toFixed(2)}</span></div>`;
          }
        }
      } else {
        const types = new Set(sel.map(e => e.type));
        html += `<div class="prop-row"><label>Types</label><span>${[...types].join(', ')}</span></div>`;
      }
    } else {
      html += '<h3>Properties</h3>';
      html += `<div class="prop-row"><label>Entities</label><span>${this.app.doc.entities.size}</span></div>`;
      html += `<div class="prop-row"><label>Layers</label><span>${this.app.doc.layers.size}</span></div>`;
    }

    this.el.innerHTML = html;

    // Bind layer click
    this.el.querySelectorAll('.layer-item').forEach(el => {
      el.onclick = () => {
        this.app.doc.currentLayer = el.dataset.layer;
        this.update();
      };
    });
  }
}
