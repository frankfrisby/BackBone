import { LineEntity } from './entities/Line.js';
import { ArcEntity } from './entities/Arc.js';
import { CircleEntity } from './entities/Circle.js';
import { RectangleEntity } from './entities/Rectangle.js';
import { PolylineEntity } from './entities/Polyline.js';
import { EllipseEntity } from './entities/Ellipse.js';
import { SplineEntity } from './entities/Spline.js';
import { TextEntity } from './entities/Text.js';

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
