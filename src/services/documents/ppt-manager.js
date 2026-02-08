/**
 * PowerPoint Manager - Generate .pptx presentations for BACKBONE deliverables
 * Uses pptxgenjs to create professional slide decks.
 */
import PptxGenJS from "pptxgenjs";
import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const PRES_DIR = path.join(getDataDir(), "presentations");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolvePresPath(name) {
  ensureDir(PRES_DIR);
  if (!name.endsWith(".pptx")) name += ".pptx";
  return path.join(PRES_DIR, name);
}

// BACKBONE color scheme
const COLORS = {
  primary: "1a1a2e",
  accent: "4472C4",
  light: "E8EEF7",
  dark: "333333",
  white: "FFFFFF",
  gray: "888888"
};

/**
 * Create a presentation with multiple slides.
 * @param {string} filename
 * @param {Object} options
 * @param {string} options.title - Presentation title
 * @param {string} [options.subtitle]
 * @param {string} [options.author]
 * @param {Array<{type: "title"|"content"|"bullets"|"table"|"twoCol", title?:string, body?:string, bullets?:string[], table?:{headers:string[], rows:string[][]}, left?:string[], right?:string[]}>} options.slides
 * @returns {Promise<{path:string, slideCount:number}>}
 */
export async function createPresentation(filename, { title, subtitle, author = "BACKBONE Engine", slides = [] } = {}) {
  const filePath = resolvePresPath(filename);

  const pptx = new PptxGenJS();
  pptx.author = author;
  pptx.title = title;
  pptx.layout = "LAYOUT_16x9";

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { fill: COLORS.primary };
  titleSlide.addText(title, {
    x: 0.5, y: 1.5, w: 9, h: 1.5,
    fontSize: 36, bold: true, color: COLORS.white,
    fontFace: "Calibri", align: "center"
  });
  if (subtitle) {
    titleSlide.addText(subtitle, {
      x: 0.5, y: 3.2, w: 9, h: 0.8,
      fontSize: 18, color: COLORS.light,
      fontFace: "Calibri", align: "center"
    });
  }
  titleSlide.addText(`${author} | ${new Date().toLocaleDateString()}`, {
    x: 0.5, y: 4.8, w: 9, h: 0.5,
    fontSize: 12, color: COLORS.gray,
    fontFace: "Calibri", align: "center"
  });

  // Content slides
  for (const slide of slides) {
    const s = pptx.addSlide();

    // Accent bar at top
    s.addShape("rect", { x: 0, y: 0, w: 10, h: 0.08, fill: { color: COLORS.accent } });

    if (slide.title) {
      s.addText(slide.title, {
        x: 0.5, y: 0.3, w: 9, h: 0.7,
        fontSize: 24, bold: true, color: COLORS.primary,
        fontFace: "Calibri"
      });
    }

    if (slide.type === "bullets" && slide.bullets) {
      const bulletText = slide.bullets.map(b => ({ text: b, options: { fontSize: 16, bullet: true, color: COLORS.dark, breakLine: true, lineSpacing: 28 } }));
      s.addText(bulletText, {
        x: 0.7, y: 1.2, w: 8.6, h: 4,
        fontFace: "Calibri", valign: "top"
      });
    }

    if (slide.type === "content" && slide.body) {
      s.addText(slide.body, {
        x: 0.7, y: 1.2, w: 8.6, h: 4,
        fontSize: 16, color: COLORS.dark,
        fontFace: "Calibri", valign: "top", lineSpacing: 26
      });
    }

    if (slide.type === "table" && slide.table) {
      const tableData = [
        slide.table.headers.map(h => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: COLORS.accent }, fontSize: 12 } })),
        ...slide.table.rows.map((row, i) =>
          row.map(cell => ({ text: String(cell ?? ""), options: { fontSize: 11, fill: { color: i % 2 === 0 ? "F2F2F2" : "FFFFFF" } } }))
        )
      ];
      s.addTable(tableData, {
        x: 0.5, y: 1.2, w: 9,
        border: { pt: 0.5, color: "CCCCCC" },
        colW: Array(slide.table.headers.length).fill(9 / slide.table.headers.length),
        fontFace: "Calibri"
      });
    }

    if (slide.type === "twoCol") {
      if (slide.left) {
        const leftText = slide.left.map(b => ({ text: b, options: { fontSize: 14, bullet: true, color: COLORS.dark, breakLine: true, lineSpacing: 26 } }));
        s.addText(leftText, {
          x: 0.5, y: 1.2, w: 4.2, h: 4,
          fontFace: "Calibri", valign: "top"
        });
      }
      if (slide.right) {
        const rightText = slide.right.map(b => ({ text: b, options: { fontSize: 14, bullet: true, color: COLORS.dark, breakLine: true, lineSpacing: 26 } }));
        s.addText(rightText, {
          x: 5.3, y: 1.2, w: 4.2, h: 4,
          fontFace: "Calibri", valign: "top"
        });
      }
    }

    // Footer
    s.addText("BACKBONE Engine", {
      x: 0.5, y: 5.1, w: 4, h: 0.3,
      fontSize: 8, color: COLORS.gray, fontFace: "Calibri"
    });
  }

  await pptx.writeFile({ fileName: filePath });
  return { path: filePath, slideCount: slides.length + 1 };
}

export function listPresentations() {
  ensureDir(PRES_DIR);
  return fs.readdirSync(PRES_DIR)
    .filter(f => f.endsWith(".pptx"))
    .map(f => {
      const fp = path.join(PRES_DIR, f);
      const stats = fs.statSync(fp);
      return { name: f, path: fp, size: stats.size, modified: stats.mtime.toISOString() };
    });
}

export default { createPresentation, listPresentations, resolvePresPath, PRES_DIR };
