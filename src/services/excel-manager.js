/**
 * Excel Manager - Persistent spreadsheet-based data storage for BACKBONE
 *
 * Uses ExcelJS to create, read, and update Excel workbooks so project data,
 * research, cost breakdowns, and rolling logs survive across sessions.
 */
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

import { getDataDir } from "./paths.js";
const DATA_DIR = getDataDir();
const SPREADSHEETS_DIR = path.join(DATA_DIR, "spreadsheets");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/**
 * Resolve a spreadsheet path. If name has no directory component,
 * default to data/spreadsheets/. Ensures .xlsx extension.
 */
export function resolveSpreadsheetPath(nameOrPath) {
  let resolved = nameOrPath;
  if (!path.isAbsolute(resolved) && !resolved.includes("/") && !resolved.includes("\\")) {
    ensureDir(SPREADSHEETS_DIR);
    resolved = path.join(SPREADSHEETS_DIR, resolved);
  }
  if (!resolved.endsWith(".xlsx")) resolved += ".xlsx";
  return resolved;
}

/**
 * Create a new Excel workbook with headers, data rows, and optional formulas.
 *
 * @param {string} nameOrPath - Filename or full path (auto-resolves to data/spreadsheets/)
 * @param {Object} options
 * @param {string} options.sheetName - Worksheet name (default "Sheet1")
 * @param {Array<{name:string, key:string, width?:number}>} options.headers - Column definitions
 * @param {Array<Object>} options.rows - Data rows (objects keyed by header keys)
 * @param {Object} [options.formulas] - Column key → formula template with {row} placeholder
 * @param {string} [options.totalLabel] - If set, adds a totals row with SUM formulas for numeric columns
 * @returns {Promise<{path:string, rowCount:number}>}
 */
export async function createSpreadsheet(nameOrPath, { sheetName = "Sheet1", headers = [], rows = [], formulas = {}, totalLabel = null } = {}) {
  const filePath = resolveSpreadsheetPath(nameOrPath);
  ensureDir(path.dirname(filePath));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BACKBONE Engine";
  workbook.created = new Date();

  const ws = workbook.addWorksheet(sheetName);

  // Define columns
  ws.columns = headers.map(h => ({
    header: h.name,
    key: h.key,
    width: h.width || 15
  }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.alignment = { horizontal: "center" };

  // Add data rows
  for (const row of rows) {
    const added = ws.addRow(row);
    // Apply formulas if defined
    for (const [key, template] of Object.entries(formulas)) {
      if (!template) continue;
      const colIndex = headers.findIndex(h => h.key === key) + 1;
      if (colIndex > 0) {
        const cell = added.getCell(colIndex);
        cell.value = { formula: template.replace(/\{row\}/g, added.number) };
      }
    }
  }

  // Currency formatting for columns that have "cost", "price", "total", "amount" in key
  for (const h of headers) {
    if (/cost|price|total|amount|revenue|budget/i.test(h.key)) {
      ws.getColumn(h.key).numFmt = "$#,##0.00";
    }
  }

  // Totals row
  if (totalLabel && rows.length > 0) {
    const totalRow = {};
    const firstKey = headers[0]?.key;
    if (firstKey) totalRow[firstKey] = totalLabel;

    const addedTotal = ws.addRow(totalRow);
    addedTotal.font = { bold: true };

    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (/cost|price|total|amount|revenue|budget|quantity|units|count/i.test(h.key) && i > 0) {
        const col = String.fromCharCode(65 + i);
        addedTotal.getCell(i + 1).value = { formula: `SUM(${col}2:${col}${rows.length + 1})` };
      }
    }
  }

  // Auto-filter
  if (headers.length > 0) {
    const lastCol = String.fromCharCode(64 + headers.length);
    ws.autoFilter = { from: "A1", to: `${lastCol}1` };
  }

  await workbook.xlsx.writeFile(filePath);
  return { path: filePath, rowCount: rows.length };
}

/**
 * Read an existing spreadsheet and return structured data.
 *
 * @param {string} nameOrPath
 * @returns {Promise<{sheets: Array<{name:string, headers:string[], rows:Array<Object>}>}>}
 */
export async function readSpreadsheet(nameOrPath) {
  const filePath = resolveSpreadsheetPath(nameOrPath);
  if (!fs.existsSync(filePath)) return null;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheets = [];
  workbook.eachSheet((ws) => {
    const headerRow = ws.getRow(1);
    const headers = [];
    headerRow.eachCell((cell, colNum) => {
      headers[colNum - 1] = String(cell.value || `col${colNum}`);
    });

    const rows = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const obj = {};
      row.eachCell((cell, colNum) => {
        const key = headers[colNum - 1] || `col${colNum}`;
        obj[key] = cell.value?.result !== undefined ? cell.value.result : cell.value;
      });
      rows.push(obj);
    });

    sheets.push({ name: ws.name, headers, rows });
  });

  return { path: filePath, sheets };
}

/**
 * Append rows to an existing spreadsheet (or create if missing).
 *
 * @param {string} nameOrPath
 * @param {Array<Object>} newRows - Rows to append
 * @param {string} [sheetName] - Target sheet (default: first sheet)
 * @returns {Promise<{path:string, totalRows:number, added:number}>}
 */
export async function appendToSpreadsheet(nameOrPath, newRows, sheetName) {
  const filePath = resolveSpreadsheetPath(nameOrPath);

  if (!fs.existsSync(filePath)) {
    // Derive headers from first row keys
    if (!newRows || newRows.length === 0) {
      throw new Error("Cannot create spreadsheet: no rows provided");
    }
    const keys = Object.keys(newRows[0] || {});
    const headers = keys.map(k => ({ name: k, key: k, width: 18 }));
    return createSpreadsheet(nameOrPath, { sheetName: sheetName || "Sheet1", headers, rows: newRows });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const ws = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found`);

  for (const row of newRows) {
    ws.addRow(row);
  }

  await workbook.xlsx.writeFile(filePath);
  return { path: filePath, totalRows: ws.rowCount - 1, added: newRows.length };
}

/**
 * Update specific cells in a spreadsheet.
 *
 * @param {string} nameOrPath
 * @param {Array<{sheet?:string, row:number, col:number|string, value:any}>} updates
 * @returns {Promise<{path:string, updated:number}>}
 */
export async function updateSpreadsheetCells(nameOrPath, updates) {
  const filePath = resolveSpreadsheetPath(nameOrPath);
  if (!fs.existsSync(filePath)) throw new Error(`Spreadsheet not found: ${filePath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  let count = 0;
  for (const u of updates) {
    const ws = u.sheet ? workbook.getWorksheet(u.sheet) : workbook.worksheets[0];
    if (!ws) continue;
    const cell = typeof u.col === "string" ? ws.getCell(`${u.col}${u.row}`) : ws.getCell(u.row, u.col);
    cell.value = u.value;
    count++;
  }

  await workbook.xlsx.writeFile(filePath);
  return { path: filePath, updated: count };
}

/**
 * List all spreadsheets in data/spreadsheets/ directory.
 */
export function listSpreadsheets() {
  ensureDir(SPREADSHEETS_DIR);
  return fs.readdirSync(SPREADSHEETS_DIR)
    .filter(f => f.endsWith(".xlsx"))
    .map(f => {
      const fp = path.join(SPREADSHEETS_DIR, f);
      const stats = fs.statSync(fp);
      return {
        name: f.replace(".xlsx", ""),
        path: fp,
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

/**
 * Create a project cost breakdown spreadsheet.
 * Convenience wrapper for the common use case of tracking parts/costs.
 */
export async function createProjectCostSheet(projectName, parts = []) {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const headers = [
    { name: "Part", key: "part", width: 30 },
    { name: "Description", key: "description", width: 35 },
    { name: "Quantity", key: "quantity", width: 12 },
    { name: "Unit Cost", key: "unitCost", width: 14 },
    { name: "Total Cost", key: "totalCost", width: 14 },
    { name: "Vendor", key: "vendor", width: 20 },
    { name: "Status", key: "status", width: 14 },
    { name: "Notes", key: "notes", width: 25 }
  ];

  const rows = parts.map(p => ({
    part: p.part || p.name || "",
    description: p.description || "",
    quantity: p.quantity || 0,
    unitCost: p.unitCost || p.cost || 0,
    vendor: p.vendor || "",
    status: p.status || "Pending",
    notes: p.notes || ""
  }));

  return createSpreadsheet(`project-${slug}`, {
    sheetName: projectName,
    headers,
    rows,
    formulas: { totalCost: "C{row}*D{row}" },
    totalLabel: "TOTAL"
  });
}

export default {
  createSpreadsheet,
  readSpreadsheet,
  appendToSpreadsheet,
  updateSpreadsheetCells,
  listSpreadsheets,
  createProjectCostSheet,
  resolveSpreadsheetPath
};
