export function exportDXF(doc) {
  let dxf = '';

  // HEADER
  dxf += '0\nSECTION\n2\nHEADER\n';
  dxf += '9\n$ACADVER\n1\nAC1027\n';
  dxf += '9\n$INSUNITS\n70\n4\n';
  dxf += '0\nENDSEC\n';

  // TABLES - Layers
  dxf += '0\nSECTION\n2\nTABLES\n';
  dxf += '0\nTABLE\n2\nLAYER\n';
  const layers = doc.layers || { '0': { name: '0', color: '#ffffff' } };
  dxf += `70\n${Object.keys(layers).length}\n`;
  for (const layer of Object.values(layers)) {
    dxf += '0\nLAYER\n';
    dxf += `2\n${layer.name}\n`;
    dxf += '70\n0\n';
    dxf += `62\n${hexToDxfColor(layer.color)}\n`;
    dxf += '6\nCONTINUOUS\n';
  }
  dxf += '0\nENDTAB\n';
  dxf += '0\nENDSEC\n';

  // ENTITIES
  dxf += '0\nSECTION\n2\nENTITIES\n';
  for (const e of (doc.entities || [])) {
    dxf += entityToDxf(e);
  }
  dxf += '0\nENDSEC\n';

  dxf += '0\nEOF\n';
  return dxf;
}

function entityToDxf(e) {
  let s = '';
  const layer = e.layer || '0';

  switch (e.type) {
    case 'line':
      s += `0\nLINE\n8\n${layer}\n`;
      s += `10\n${e.x1}\n20\n${-e.y1}\n`;
      s += `11\n${e.x2}\n21\n${-e.y2}\n`;
      break;
    case 'circle':
      s += `0\nCIRCLE\n8\n${layer}\n`;
      s += `10\n${e.cx}\n20\n${-e.cy}\n`;
      s += `40\n${e.radius}\n`;
      break;
    case 'arc':
      s += `0\nARC\n8\n${layer}\n`;
      s += `10\n${e.cx}\n20\n${-e.cy}\n`;
      s += `40\n${e.radius}\n`;
      s += `50\n${(-e.endAngle * 180 / Math.PI + 360) % 360}\n`;
      s += `51\n${(-e.startAngle * 180 / Math.PI + 360) % 360}\n`;
      break;
    case 'rectangle':
      // Export as LWPOLYLINE
      const pts = [
        { x: e.x, y: e.y }, { x: e.x + e.width, y: e.y },
        { x: e.x + e.width, y: e.y + e.height }, { x: e.x, y: e.y + e.height }
      ];
      s += `0\nLWPOLYLINE\n8\n${layer}\n90\n4\n70\n1\n`;
      for (const p of pts) s += `10\n${p.x}\n20\n${-p.y}\n`;
      break;
    case 'polyline':
      s += `0\nLWPOLYLINE\n8\n${layer}\n90\n${e.points.length}\n70\n${e.closed ? 1 : 0}\n`;
      for (const p of e.points) s += `10\n${p.x}\n20\n${-p.y}\n`;
      break;
    case 'ellipse':
      s += `0\nELLIPSE\n8\n${layer}\n`;
      s += `10\n${e.cx}\n20\n${-e.cy}\n30\n0\n`;
      s += `11\n${e.rx}\n21\n0\n31\n0\n`;
      s += `40\n${e.ry / e.rx}\n`;
      s += `41\n0\n42\n${Math.PI * 2}\n`;
      break;
    case 'text':
      s += `0\nTEXT\n8\n${layer}\n`;
      s += `10\n${e.x}\n20\n${-e.y}\n`;
      s += `40\n${e.height || 10}\n`;
      s += `1\n${e.text}\n`;
      break;
  }
  return s;
}

function hexToDxfColor(hex) {
  if (!hex) return 7;
  const map = { '#ff0000': 1, '#ffff00': 2, '#00ff00': 3, '#00ffff': 4, '#0000ff': 5, '#ff00ff': 6, '#ffffff': 7, '#000000': 0 };
  return map[hex?.toLowerCase()] || 7;
}
