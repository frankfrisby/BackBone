/**
 * Word Manager - Generate .docx documents for BACKBONE deliverables
 * Uses the `docx` package to create professional Word documents.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType
} from "docx";
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const DOCS_DIR = path.join(getDataDir(), "documents");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveDocPath(name) {
  ensureDir(DOCS_DIR);
  if (!name.endsWith(".docx")) name += ".docx";
  return path.join(DOCS_DIR, name);
}

/**
 * Create a professional Word document.
 * @param {string} filename
 * @param {Object} options
 * @param {string} options.title
 * @param {string} [options.subtitle]
 * @param {string} [options.author]
 * @param {Array<{heading?:string, level?:number, body?:string, bullets?:string[], table?:{headers:string[], rows:string[][]}}>} options.sections
 * @returns {Promise<{path:string}>}
 */
export async function createDocument(filename, { title, subtitle, author = "BACKBONE Engine", sections = [] } = {}) {
  const filePath = resolveDocPath(filename);

  const children = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 48, color: "1a1a2e", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 }
  }));

  // Subtitle
  if (subtitle) {
    children.push(new Paragraph({
      children: [new TextRun({ text: subtitle, size: 24, color: "555555", font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 }
    }));
  }

  // Date/Author
  children.push(new Paragraph({
    children: [new TextRun({ text: `${author} | ${new Date().toLocaleDateString()}`, size: 18, color: "888888" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }));

  // Sections
  for (const section of sections) {
    if (section.heading) {
      const level = section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1;
      children.push(new Paragraph({
        text: section.heading,
        heading: level,
        spacing: { before: 300, after: 100 }
      }));
    }

    if (section.body) {
      children.push(new Paragraph({
        children: [new TextRun({ text: section.body, size: 22, font: "Calibri" })],
        spacing: { after: 200, line: 360 }
      }));
    }

    if (section.bullets) {
      for (const bullet of section.bullets) {
        children.push(new Paragraph({
          children: [new TextRun({ text: bullet, size: 22, font: "Calibri" })],
          bullet: { level: 0 },
          spacing: { after: 80 }
        }));
      }
    }

    if (section.table) {
      children.push(buildTable(section.table));
    }
  }

  const doc = new Document({
    creator: author,
    title,
    sections: [{ children }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);

  return { path: filePath };
}

function buildTable({ headers, rows }) {
  const headerCells = headers.map(h => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 20 })] })],
    shading: { fill: "4472C4", type: ShadingType.SOLID, color: "4472C4" },
    width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA }
  }));

  const tableRows = [new TableRow({ children: headerCells })];

  for (let r = 0; r < rows.length; r++) {
    const fill = r % 2 === 0 ? "F2F2F2" : "FFFFFF";
    const cells = rows[r].map(cell => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ""), size: 20 })] })],
      shading: { fill, type: ShadingType.SOLID, color: fill },
      width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA }
    }));
    tableRows.push(new TableRow({ children: cells }));
  }

  return new Table({
    rows: tableRows,
    width: { size: 9000, type: WidthType.DXA }
  });
}

export function listWordDocs() {
  ensureDir(DOCS_DIR);
  return fs.readdirSync(DOCS_DIR)
    .filter(f => f.endsWith(".docx"))
    .map(f => {
      const fp = path.join(DOCS_DIR, f);
      const stats = fs.statSync(fp);
      return { name: f, path: fp, size: stats.size, modified: stats.mtime.toISOString() };
    });
}

export default { createDocument, listWordDocs, resolveDocPath, DOCS_DIR };
