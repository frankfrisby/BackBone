---
name: pdf-document
description: Create, modify, merge, split, and extract text from PDF documents. Use when the user wants to create a PDF, edit an existing PDF, merge multiple PDFs, extract text or tables, add watermarks, fill forms, or any .pdf file operation.
---

# PDF Document

Create and manipulate PDF files using Node.js libraries.

## Libraries

| Library | Use For |
|---------|---------|
| **PDFKit** | Creating new PDFs from scratch (text, tables, images, charts) |
| **pdf-lib** | Modifying existing PDFs (add text, merge, split, metadata) |
| **pdfjs-dist** | Extracting text from PDFs |

Install: `npm install pdfkit pdf-lib`

## Quick Start — Create a PDF

```javascript
import PDFDocument from "pdfkit";
import fs from "fs";

const doc = new PDFDocument({ bufferPages: true, margin: 50 });
doc.pipe(fs.createWriteStream("output.pdf"));
doc.fontSize(24).text("Title", { align: "center" });
doc.moveDown();
doc.fontSize(12).text("Body content here.");
doc.end();
```

## Key Operations

- **New PDF**: Use PDFKit — `new PDFDocument()`, add content, `doc.end()`
- **Modify existing**: Use pdf-lib — `PDFDocument.load(bytes)`, draw on pages, `save()`
- **Merge**: Use pdf-lib — create new doc, `copyPages()` from each source
- **Extract text**: Use pdfjs-dist or `pdf-parse` package
- **Add images**: PDFKit `doc.image(path, { fit: [w, h] })`
- **Tables**: Draw manually with PDFKit rects + text positioning

## BACKBONE Integration

- **Output**: Save PDFs to `projects/<name>/` or user-specified path
- **Deliverables pipeline**: `src/services/documents/` has PDF generation utilities
- **Open after creation**: Use `open-url.js` to open the file

## Pitfalls

- PDFKit requires `bufferPages: true` for `switchToPage()` footer rendering
- ReportLab renders Unicode subscript/superscript as solid black boxes
- PDF text extraction is lossy — tables especially lose structure
- Always `doc.end()` and wait for stream finish before reporting success
