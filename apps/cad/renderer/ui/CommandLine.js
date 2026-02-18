export class CommandLine {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'command-area';
    this.history = [];
    this.cmdHistory = [];
    this.cmdIndex = -1;
  }

  render(viewport) {
    this.el.innerHTML = `
      <div class="command-history" id="cmd-history"></div>
      <div class="command-input-row">
        <span class="prompt">Command:</span>
        <input type="text" id="cmd-input" autocomplete="off" spellcheck="false" />
      </div>
    `;
    viewport.appendChild(this.el);

    this.historyEl = this.el.querySelector('#cmd-history');
    this.inputEl = this.el.querySelector('#cmd-input');

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = this.inputEl.value.trim();
        if (val) {
          this.log(`> ${val}`);
          this.cmdHistory.push(val);
          this.cmdIndex = this.cmdHistory.length;
          this.app.commandParser.execute(val);
        }
        this.inputEl.value = '';
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.inputEl.value = '';
        this.app.toolCtrl.cancel();
      } else if (e.key === 'ArrowUp') {
        if (this.cmdIndex > 0) {
          this.cmdIndex--;
          this.inputEl.value = this.cmdHistory[this.cmdIndex];
        }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (this.cmdIndex < this.cmdHistory.length - 1) {
          this.cmdIndex++;
          this.inputEl.value = this.cmdHistory[this.cmdIndex];
        } else {
          this.cmdIndex = this.cmdHistory.length;
          this.inputEl.value = '';
        }
        e.preventDefault();
      }
    });

    this.log('BACKBONE CAD ready. Type a command or select a tool.');
  }

  log(msg) {
    this.history.push(msg);
    if (this.history.length > 200) this.history.shift();
    if (this.historyEl) {
      const line = document.createElement('div');
      line.className = 'cmd-line';
      line.textContent = msg;
      this.historyEl.appendChild(line);
      this.historyEl.scrollTop = this.historyEl.scrollHeight;
    }
  }

  focus() { this.inputEl?.focus(); }
}
