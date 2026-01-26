# PDF Document Creation Skill

Create and manipulate PDF documents programmatically.

## Dependencies
```bash
npm install pdf-lib pdfkit
```

## Basic PDF Creation with PDFKit

```javascript
import PDFDocument from 'pdfkit';
import fs from 'fs';

function createPDF(filename, content) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filename);

    doc.pipe(stream);

    // Add content
    if (content.title) {
      doc.fontSize(24).text(content.title, { align: 'center' });
      doc.moveDown();
    }

    if (content.body) {
      doc.fontSize(12).text(content.body);
    }

    doc.end();

    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}
```

## Create PDF with Headers and Sections

```javascript
function createFormattedPDF(filename, sections) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filename);

    doc.pipe(stream);

    sections.forEach((section, index) => {
      if (index > 0) doc.addPage();

      // Section title
      doc.fontSize(20).fillColor('#333333').text(section.title);
      doc.moveDown();

      // Section content
      if (section.content) {
        doc.fontSize(12).fillColor('#666666').text(section.content);
      }

      // Bullet points
      if (section.bullets) {
        section.bullets.forEach(bullet => {
          doc.fontSize(12).text(`• ${bullet}`, { indent: 20 });
        });
      }
    });

    doc.end();
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}
```

## Create PDF with Table

```javascript
function createPDFWithTable(filename, title, tableData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filename);

    doc.pipe(stream);

    // Title
    doc.fontSize(20).text(title, { align: 'center' });
    doc.moveDown(2);

    // Table settings
    const tableTop = doc.y;
    const colWidth = 100;
    const rowHeight = 25;
    const cols = tableData[0].length;
    const tableWidth = colWidth * cols;
    const startX = (doc.page.width - tableWidth) / 2;

    // Draw table
    tableData.forEach((row, rowIndex) => {
      const y = tableTop + (rowIndex * rowHeight);

      // Header row background
      if (rowIndex === 0) {
        doc.fillColor('#4472C4').rect(startX, y, tableWidth, rowHeight).fill();
      }

      // Draw cells
      row.forEach((cell, colIndex) => {
        const x = startX + (colIndex * colWidth);

        // Cell border
        doc.strokeColor('#CCCCCC').rect(x, y, colWidth, rowHeight).stroke();

        // Cell text
        doc.fillColor(rowIndex === 0 ? '#FFFFFF' : '#333333')
          .fontSize(10)
          .text(cell, x + 5, y + 8, { width: colWidth - 10, align: 'center' });
      });
    });

    doc.end();
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}
```

## Create PDF with Images

```javascript
function createPDFWithImage(filename, title, imagePath, caption) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filename);

    doc.pipe(stream);

    // Title
    doc.fontSize(20).text(title, { align: 'center' });
    doc.moveDown();

    // Image
    if (fs.existsSync(imagePath)) {
      doc.image(imagePath, {
        fit: [400, 300],
        align: 'center'
      });
    }

    // Caption
    if (caption) {
      doc.moveDown();
      doc.fontSize(10).fillColor('#999999').text(caption, { align: 'center' });
    }

    doc.end();
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
}
```

## Modify Existing PDF with pdf-lib

```javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

async function modifyPDF(inputPath, outputPath, modifications) {
  const existingPdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  // Add text to first page
  if (modifications.addText) {
    const firstPage = pages[0];
    firstPage.drawText(modifications.addText.text, {
      x: modifications.addText.x || 50,
      y: modifications.addText.y || 50,
      size: modifications.addText.size || 12,
      font: helveticaFont,
      color: rgb(0, 0, 0)
    });
  }

  // Add new page
  if (modifications.addPage) {
    const newPage = pdfDoc.addPage();
    newPage.drawText(modifications.addPage.text || '', {
      x: 50, y: newPage.getHeight() - 50,
      size: 12, font: helveticaFont
    });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
}
```

## Merge PDFs

```javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function mergePDFs(pdfPaths, outputPath) {
  const mergedPdf = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach(page => mergedPdf.addPage(page));
  }

  const mergedPdfBytes = await mergedPdf.save();
  fs.writeFileSync(outputPath, mergedPdfBytes);
  return outputPath;
}
```

## Extract Text from PDF

```javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function getPDFInfo(pdfPath) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  return {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle(),
    author: pdfDoc.getAuthor(),
    subject: pdfDoc.getSubject(),
    creator: pdfDoc.getCreator(),
    pages: pdfDoc.getPages().map((page, i) => ({
      number: i + 1,
      width: page.getWidth(),
      height: page.getHeight()
    }))
  };
}
```

## Usage Examples

```javascript
// Simple PDF
await createPDF('simple.pdf', {
  title: 'My Document',
  body: 'This is the content of my PDF document.'
});

// Formatted report
await createFormattedPDF('report.pdf', [
  { title: 'Executive Summary', content: 'Overview of key findings...' },
  { title: 'Recommendations', bullets: ['Increase budget', 'Hire more staff', 'Expand marketing'] }
]);

// PDF with table
await createPDFWithTable('sales.pdf', 'Sales Report', [
  ['Product', 'Q1', 'Q2', 'Q3'],
  ['Widget A', '$10K', '$15K', '$12K'],
  ['Widget B', '$8K', '$9K', '$11K']
]);

// Merge multiple PDFs
await mergePDFs(['doc1.pdf', 'doc2.pdf', 'doc3.pdf'], 'merged.pdf');
```
