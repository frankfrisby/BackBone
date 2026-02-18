import fs from 'fs';
import DxfParser from 'dxf-parser';

export async function importDXF(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parser = new DxfParser();
  const dxf = parser.parseSync(content);

  const doc = {
    settings: { units: 'mm', gridSize: 10 },
    layers: {},
    entities: [],
    blocks: {}
  };

  // Import layers
  if (dxf.tables?.layer?.layers) {
    for (const [name, layer] of Object.entries(dxf.tables.layer.layers)) {
      doc.layers[name] = {
        id: name,
        name,
        color: dxfColorToHex(layer.color),
        visible: true,
        locked: false
      };
    }
  }

  // Import entities
  if (dxf.entities) {
    for (const e of dxf.entities) {
      const entity = convertDxfEntity(e);
      if (entity) doc.entities.push(entity);
    }
  }

  return doc;
}

function convertDxfEntity(e) {
  const base = { layer: e.layer || '0', color: dxfColorToHex(e.color) };

  switch (e.type) {
    case 'LINE':
      return { ...base, type: 'line', x1: e.vertices[0].x, y1: e.vertices[0].y, x2: e.vertices[1].x, y2: e.vertices[1].y };
    case 'CIRCLE':
      return { ...base, type: 'circle', cx: e.center.x, cy: e.center.y, radius: e.radius };
    case 'ARC':
      return { ...base, type: 'arc', cx: e.center.x, cy: e.center.y, radius: e.radius, startAngle: e.startAngle * Math.PI / 180, endAngle: e.endAngle * Math.PI / 180 };
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return { ...base, type: 'polyline', points: (e.vertices || []).map(v => ({ x: v.x, y: v.y })), closed: e.shape || false };
    case 'ELLIPSE':
      return { ...base, type: 'ellipse', cx: e.center.x, cy: e.center.y, rx: Math.sqrt(e.majorAxisEndPoint.x ** 2 + e.majorAxisEndPoint.y ** 2), ry: Math.sqrt(e.majorAxisEndPoint.x ** 2 + e.majorAxisEndPoint.y ** 2) * e.axisRatio };
    case 'TEXT':
    case 'MTEXT':
      return { ...base, type: 'text', x: e.startPoint?.x || e.position?.x || 0, y: e.startPoint?.y || e.position?.y || 0, text: e.text || '', height: e.height || 10 };
    default:
      return null;
  }
}

const DXF_COLORS = ['#000000','#ff0000','#ffff00','#00ff00','#00ffff','#0000ff','#ff00ff','#ffffff'];
function dxfColorToHex(colorIndex) {
  if (!colorIndex || colorIndex < 0) return '#ffffff';
  return DXF_COLORS[colorIndex % DXF_COLORS.length] || '#ffffff';
}
