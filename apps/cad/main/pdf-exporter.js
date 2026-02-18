import fs from 'fs';

export async function exportPDF(imageDataUrl, filePath) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  doc.addImage(imageDataUrl, 'PNG', 0, 0, 420, 297);
  const buffer = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync(filePath, buffer);
}
