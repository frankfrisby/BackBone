# Excel Spreadsheet Creation Skill

Create and manipulate Microsoft Excel files (.xlsx) programmatically.

## Dependencies
```bash
npm install exceljs
```

## Basic Excel Creation

```javascript
import ExcelJS from 'exceljs';

async function createExcelFile(filename, sheetName, data) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Add data rows
  data.forEach(row => worksheet.addRow(row));

  await workbook.xlsx.writeFile(filename);
  return filename;
}
```

## Create Excel with Headers and Formatting

```javascript
async function createFormattedExcel(filename, sheetName, headers, data) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Add headers with styling
  worksheet.columns = headers.map(h => ({
    header: h.name,
    key: h.key,
    width: h.width || 15
  }));

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' }
  };

  // Add data
  data.forEach(row => worksheet.addRow(row));

  // Auto-filter
  worksheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(64 + headers.length)}1`
  };

  await workbook.xlsx.writeFile(filename);
  return filename;
}
```

## Create Excel with Multiple Sheets

```javascript
async function createMultiSheetExcel(filename, sheets) {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    sheet.data.forEach(row => worksheet.addRow(row));
  }

  await workbook.xlsx.writeFile(filename);
  return filename;
}
```

## Create Excel with Formulas

```javascript
async function createExcelWithFormulas(filename, data) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Calculations');

  // Headers
  worksheet.addRow(['Item', 'Quantity', 'Price', 'Total']);

  // Data with formulas
  data.forEach((row, index) => {
    const rowNum = index + 2;
    worksheet.addRow([row.item, row.quantity, row.price, { formula: `B${rowNum}*C${rowNum}` }]);
  });

  // Sum formula at bottom
  const lastRow = data.length + 2;
  worksheet.addRow(['', '', 'Grand Total:', { formula: `SUM(D2:D${lastRow - 1})` }]);

  // Format currency columns
  worksheet.getColumn(3).numFmt = '$#,##0.00';
  worksheet.getColumn(4).numFmt = '$#,##0.00';

  await workbook.xlsx.writeFile(filename);
  return filename;
}
```

## Create Excel with Charts (via data preparation)

```javascript
async function createExcelWithChartData(filename, chartData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Chart Data');

  // Add headers
  worksheet.addRow(['Category', 'Value']);

  // Add chart data
  chartData.forEach(item => {
    worksheet.addRow([item.category, item.value]);
  });

  // Style for chart-ready data
  worksheet.getColumn(1).width = 20;
  worksheet.getColumn(2).width = 15;

  await workbook.xlsx.writeFile(filename);
  return filename;
}
```

## Read Excel File

```javascript
async function readExcelFile(filename) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);

  const data = [];
  workbook.eachSheet((worksheet) => {
    const sheetData = { name: worksheet.name, rows: [] };
    worksheet.eachRow((row) => {
      sheetData.rows.push(row.values.slice(1)); // Remove empty first element
    });
    data.push(sheetData);
  });

  return data;
}
```

## Usage Examples

```javascript
// Simple spreadsheet
await createExcelFile('data.xlsx', 'Sheet1', [
  ['Name', 'Age', 'City'],
  ['John', 30, 'New York'],
  ['Jane', 25, 'Los Angeles']
]);

// Formatted report
await createFormattedExcel('report.xlsx', 'Sales',
  [
    { name: 'Product', key: 'product', width: 20 },
    { name: 'Revenue', key: 'revenue', width: 15 },
    { name: 'Units', key: 'units', width: 10 }
  ],
  [
    { product: 'Widget A', revenue: 5000, units: 100 },
    { product: 'Widget B', revenue: 3500, units: 70 }
  ]
);

// Invoice with calculations
await createExcelWithFormulas('invoice.xlsx', [
  { item: 'Service A', quantity: 5, price: 100 },
  { item: 'Service B', quantity: 3, price: 250 }
]);
```
