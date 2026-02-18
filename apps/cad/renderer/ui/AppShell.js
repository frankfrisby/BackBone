export class AppShell {
  constructor() {
    this.el = document.getElementById('app');
  }

  createTitleBar() {
    const div = document.createElement('div');
    div.className = 'titlebar';
    div.innerHTML = `
      <span class="title">BACKBONE CAD</span>
      <div class="window-controls">
        <button id="btn-minimize">&#x2500;</button>
        <button id="btn-maximize">&#x25A1;</button>
        <button id="btn-close" class="close">&#x2715;</button>
      </div>
    `;
    this.el.appendChild(div);

    div.querySelector('#btn-minimize').onclick = () => window.cadAPI?.minimize();
    div.querySelector('#btn-maximize').onclick = () => window.cadAPI?.maximize();
    div.querySelector('#btn-close').onclick = () => window.cadAPI?.close();
  }

  createViewport() {
    const div = document.createElement('div');
    div.className = 'viewport';
    div.id = 'viewport';
    this.el.appendChild(div);
    return div;
  }
}
