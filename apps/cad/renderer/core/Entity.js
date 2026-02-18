import { LineEntity } from './entities/Line.js';
import { ArcEntity } from './entities/Arc.js';
import { CircleEntity } from './entities/Circle.js';
import { RectangleEntity } from './entities/Rectangle.js';
import { PolylineEntity } from './entities/Polyline.js';
import { EllipseEntity } from './entities/Ellipse.js';
import { SplineEntity } from './entities/Spline.js';
import { TextEntity } from './entities/Text.js';

export class Entity {
  constructor(type, props = {}) {
    this.id = props.id || crypto.randomUUID();
    this.type = type;
    this.layer = props.layer || '0';
    this.color = props.color || null; // null = bylayer
    this.lineWidth = props.lineWidth || 1;
    this.visible = props.visible !== false;
    this.selected = false;
  }

  toJSON() {
    return {
      id: this.id, type: this.type, layer: this.layer,
      color: this.color, lineWidth: this.lineWidth
    };
  }

  draw2D(ctx, camera) { }
  getGripPoints() { return []; }
  getBBox() { return { x: 0, y: 0, w: 0, h: 0 }; }
  hitTest(x, y, tolerance) { return false; }
  to3DMesh(THREE) { return null; }

  getDrawColor(layerColor) {
    if (this.selected) return '#00ff00';
    return this.color || layerColor || '#ffffff';
  }
}

const ENTITY_CLASSES = {
  line: LineEntity, arc: ArcEntity, circle: CircleEntity,
  rectangle: RectangleEntity, polyline: PolylineEntity,
  ellipse: EllipseEntity, spline: SplineEntity, text: TextEntity
};

export function createEntity(data) {
  const Cls = ENTITY_CLASSES[data.type];
  if (!Cls) return null;
  return Cls.fromJSON(data);
}
