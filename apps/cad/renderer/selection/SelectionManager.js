export class SelectionManager extends EventTarget {
  constructor() {
    super();
    this.selected = new Set();
  }

  add(entity) {
    entity.selected = true;
    this.selected.add(entity);
    this._emit();
  }

  remove(entity) {
    entity.selected = false;
    this.selected.delete(entity);
    this._emit();
  }

  toggle(entity) {
    if (this.selected.has(entity)) this.remove(entity);
    else this.add(entity);
  }

  clear() {
    for (const e of this.selected) e.selected = false;
    this.selected.clear();
    this._emit();
  }

  items() { return [...this.selected]; }
  count() { return this.selected.size; }

  deleteSelected(doc) {
    for (const e of this.selected) doc.removeEntity(e.id);
    this.selected.clear();
    this._emit();
  }

  _emit() {
    this.dispatchEvent(new CustomEvent('changed', { detail: this.items() }));
  }
}
