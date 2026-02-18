export class Block {
  constructor(name, entities = []) {
    this.name = name;
    this.entities = entities;
    this.basePoint = { x: 0, y: 0 };
  }

  toJSON() { return { name: this.name, entities: this.entities, basePoint: this.basePoint }; }
  static fromJSON(d) {
    const b = new Block(d.name, d.entities);
    b.basePoint = d.basePoint || { x: 0, y: 0 };
    return b;
  }
}
