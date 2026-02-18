export class Layer {
  constructor(name, color = '#ffffff') {
    this.name = name;
    this.color = color;
    this.visible = true;
    this.locked = false;
  }

  toJSON() { return { name: this.name, color: this.color, visible: this.visible, locked: this.locked }; }
  static fromJSON(d) {
    const l = new Layer(d.name, d.color);
    l.visible = d.visible !== false;
    l.locked = d.locked || false;
    return l;
  }
}
