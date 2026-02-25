---
name: Microsoft Excel
description: Create, edit, and analyze spreadsheets via desktop automation
triggers: [excel, spreadsheet, workbook, csv, data analysis, pivot table, microsoft excel]
type: desktop-app
app: excel
process: EXCEL
---

# Microsoft Excel — Desktop Automation

## When to Use
- User asks to create or edit a spreadsheet
- User wants data analysis, charts, or calculations
- User asks to open a CSV or Excel file

## Launch
- Command: `Start-Process excel -ArgumentList /e` (opens blank workbook, skips start screen)
- Wait: 6 seconds for full load
- Process name: `EXCEL`

## Key Shortcuts
| Action | Shortcut |
|--------|----------|
| New workbook | Ctrl+N |
| Open file | Ctrl+O |
| Save | Ctrl+S |
| Save As | F12 |
| Bold | Ctrl+B |
| Undo | Ctrl+Z |
| Select all | Ctrl+A |
| Find | Ctrl+F |
| Go to cell | Ctrl+G or F5 |
| Insert row | Ctrl+Shift++ |
| Delete row | Ctrl+- |
| AutoSum | Alt+= |
| Format cells | Ctrl+1 |
| Move to next cell | Tab |
| Move to cell below | Enter |
| Close | Alt+F4 |

## Common Workflows

### Enter Data
1. Launch Excel with /e flag
2. Click cell A1 (or it's already selected)
3. Type header, press Tab for next column
4. Press Enter to go to next row
5. Tab between cells in a row

### Create Formula
1. Click target cell
2. Type = followed by formula (e.g., =SUM(A1:A10))
3. Press Enter

### Create Chart
1. Select data range
2. Alt+N → open Insert tab
3. Click chart type (recommended charts shown)

## Programmatic Alternative
For creating Excel files without desktop automation, use the `excel-spreadsheet` skill with ExcelJS library.

## Closing
- Alt+F4 → N for "Don't Save"
