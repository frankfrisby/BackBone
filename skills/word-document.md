# Word Document Creation Skill

Create professional Microsoft Word documents (.docx) programmatically.

## Dependencies
```bash
npm install docx
```

## Basic Document Creation

```javascript
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import fs from 'fs';

// Create a basic document
async function createWordDocument(filename, content) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: content
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filename, buffer);
  return filename;
}
```

## Create Document with Headings and Paragraphs

```javascript
async function createFormattedDocument(filename, title, sections) {
  const children = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER
    })
  ];

  for (const section of sections) {
    children.push(
      new Paragraph({
        text: section.heading,
        heading: HeadingLevel.HEADING_1
      }),
      new Paragraph({
        children: [new TextRun(section.content)]
      })
    );
  }

  const doc = new Document({
    sections: [{ children }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filename, buffer);
  return filename;
}
```

## Create Document with Table

```javascript
async function createDocumentWithTable(filename, title, tableData) {
  const tableRows = tableData.map(row =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          children: [new Paragraph(cell)],
          width: { size: 100 / row.length, type: WidthType.PERCENTAGE }
        })
      )
    })
  );

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
        new Table({ rows: tableRows })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filename, buffer);
  return filename;
}
```

## Create Document with Styled Text

```javascript
async function createStyledDocument(filename) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: "Bold Text", bold: true }),
            new TextRun({ text: " | " }),
            new TextRun({ text: "Italic Text", italics: true }),
            new TextRun({ text: " | " }),
            new TextRun({ text: "Underlined", underline: {} }),
            new TextRun({ text: " | " }),
            new TextRun({ text: "Colored", color: "FF0000" })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Large Text", size: 48 }),
            new TextRun({ text: " | " }),
            new TextRun({ text: "Small Text", size: 16 })
          ]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filename, buffer);
  return filename;
}
```

## Usage Examples

```javascript
// Simple document
await createWordDocument('output.docx', [
  new Paragraph({ text: 'Hello World!' })
]);

// Formatted report
await createFormattedDocument('report.docx', 'Monthly Report', [
  { heading: 'Summary', content: 'This month showed growth...' },
  { heading: 'Details', content: 'Detailed breakdown...' }
]);

// Document with table
await createDocumentWithTable('data.docx', 'Sales Data', [
  ['Product', 'Q1', 'Q2', 'Q3', 'Q4'],
  ['Widget A', '$100', '$150', '$200', '$180'],
  ['Widget B', '$80', '$90', '$110', '$120']
]);
```
