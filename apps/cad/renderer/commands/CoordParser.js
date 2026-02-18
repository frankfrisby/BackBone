export class CoordParser {
  static parse(input, lastPoint = { x: 0, y: 0 }) {
    input = input.trim();

    // Polar relative: @distance<angle
    const polarRel = input.match(/^@([\d.]+)<([\d.]+)$/);
    if (polarRel) {
      const d = parseFloat(polarRel[1]);
      const a = parseFloat(polarRel[2]) * Math.PI / 180;
      return { x: lastPoint.x + d * Math.cos(a), y: lastPoint.y + d * Math.sin(a) };
    }

    // Relative: @x,y
    const rel = input.match(/^@([-\d.]+),([-\d.]+)$/);
    if (rel) {
      return { x: lastPoint.x + parseFloat(rel[1]), y: lastPoint.y + parseFloat(rel[2]) };
    }

    // Absolute: x,y
    const abs = input.match(/^([-\d.]+),([-\d.]+)$/);
    if (abs) {
      return { x: parseFloat(abs[1]), y: parseFloat(abs[2]) };
    }

    // Single number (radius, distance, etc.)
    const num = parseFloat(input);
    if (!isNaN(num)) return { value: num };

    return null;
  }
}
