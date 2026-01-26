# Data Analysis Skill

Analyze and visualize data programmatically.

## Dependencies
```bash
npm install simple-statistics lodash mathjs csv-parse csv-stringify
```

## Basic Statistics

```javascript
import ss from 'simple-statistics';

function analyzeData(numbers) {
  return {
    count: numbers.length,
    sum: ss.sum(numbers),
    mean: ss.mean(numbers),
    median: ss.median(numbers),
    mode: ss.mode(numbers),
    min: ss.min(numbers),
    max: ss.max(numbers),
    range: ss.max(numbers) - ss.min(numbers),
    variance: ss.variance(numbers),
    standardDeviation: ss.standardDeviation(numbers),
    percentile25: ss.quantile(numbers, 0.25),
    percentile75: ss.quantile(numbers, 0.75),
    iqr: ss.interquartileRange(numbers)
  };
}

function detectOutliers(numbers, threshold = 1.5) {
  const q1 = ss.quantile(numbers, 0.25);
  const q3 = ss.quantile(numbers, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - threshold * iqr;
  const upperBound = q3 + threshold * iqr;

  return numbers.filter(n => n < lowerBound || n > upperBound);
}
```

## Data Transformation

```javascript
import _ from 'lodash';

function groupAndAggregate(data, groupBy, aggregations) {
  const grouped = _.groupBy(data, groupBy);

  return Object.entries(grouped).map(([key, items]) => {
    const result = { [groupBy]: key };

    for (const [field, aggType] of Object.entries(aggregations)) {
      const values = items.map(i => i[field]).filter(v => v != null);

      switch (aggType) {
        case 'sum': result[`${field}_sum`] = _.sum(values); break;
        case 'avg': result[`${field}_avg`] = _.mean(values); break;
        case 'min': result[`${field}_min`] = _.min(values); break;
        case 'max': result[`${field}_max`] = _.max(values); break;
        case 'count': result[`${field}_count`] = values.length; break;
      }
    }

    return result;
  });
}

function pivotTable(data, rowField, colField, valueField, aggType = 'sum') {
  const rows = [...new Set(data.map(d => d[rowField]))];
  const cols = [...new Set(data.map(d => d[colField]))];

  const pivot = rows.map(row => {
    const rowData = { [rowField]: row };

    cols.forEach(col => {
      const values = data
        .filter(d => d[rowField] === row && d[colField] === col)
        .map(d => d[valueField]);

      rowData[col] = aggType === 'sum' ? _.sum(values) : _.mean(values);
    });

    return rowData;
  });

  return { rows, cols, data: pivot };
}
```

## Time Series Analysis

```javascript
function movingAverage(data, window) {
  const result = [];
  for (let i = window - 1; i < data.length; i++) {
    const slice = data.slice(i - window + 1, i + 1);
    result.push(_.mean(slice));
  }
  return result;
}

function calculateGrowthRate(data) {
  const rates = [];
  for (let i = 1; i < data.length; i++) {
    const rate = (data[i] - data[i - 1]) / data[i - 1] * 100;
    rates.push(rate);
  }
  return rates;
}

function detectTrend(data) {
  const n = data.length;
  const xMean = (n - 1) / 2;
  const yMean = _.mean(data);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (data[i] - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = numerator / denominator;

  return {
    slope,
    direction: slope > 0 ? 'upward' : slope < 0 ? 'downward' : 'flat',
    strength: Math.abs(slope)
  };
}
```

## Correlation Analysis

```javascript
function correlationMatrix(data, fields) {
  const matrix = {};

  for (const field1 of fields) {
    matrix[field1] = {};
    for (const field2 of fields) {
      const values1 = data.map(d => d[field1]);
      const values2 = data.map(d => d[field2]);
      matrix[field1][field2] = ss.sampleCorrelation(values1, values2);
    }
  }

  return matrix;
}

function findCorrelatedFields(data, fields, threshold = 0.7) {
  const correlations = [];

  for (let i = 0; i < fields.length; i++) {
    for (let j = i + 1; j < fields.length; j++) {
      const values1 = data.map(d => d[fields[i]]);
      const values2 = data.map(d => d[fields[j]]);
      const corr = ss.sampleCorrelation(values1, values2);

      if (Math.abs(corr) >= threshold) {
        correlations.push({
          field1: fields[i],
          field2: fields[j],
          correlation: corr,
          type: corr > 0 ? 'positive' : 'negative'
        });
      }
    }
  }

  return correlations;
}
```

## CSV Processing

```javascript
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import fs from 'fs';

function readCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true });
}

function writeCSV(filepath, data) {
  const output = stringify(data, { header: true });
  fs.writeFileSync(filepath, output);
  return filepath;
}

function filterCSV(data, conditions) {
  return data.filter(row => {
    return Object.entries(conditions).every(([field, condition]) => {
      if (typeof condition === 'function') return condition(row[field]);
      return row[field] === condition;
    });
  });
}
```

## Report Generation

```javascript
function generateDataReport(data, options = {}) {
  const numericFields = Object.keys(data[0] || {}).filter(k =>
    data.every(d => !isNaN(parseFloat(d[k])))
  );

  const report = {
    summary: {
      totalRecords: data.length,
      fields: Object.keys(data[0] || {}),
      numericFields
    },
    statistics: {},
    insights: []
  };

  // Calculate statistics for numeric fields
  numericFields.forEach(field => {
    const values = data.map(d => parseFloat(d[field]));
    report.statistics[field] = analyzeData(values);

    const outliers = detectOutliers(values);
    if (outliers.length > 0) {
      report.insights.push(`${field}: Found ${outliers.length} outliers`);
    }

    const trend = detectTrend(values);
    report.insights.push(`${field}: ${trend.direction} trend (slope: ${trend.slope.toFixed(4)})`);
  });

  // Find correlations
  if (numericFields.length > 1) {
    const correlations = findCorrelatedFields(data, numericFields);
    correlations.forEach(c => {
      report.insights.push(`Strong ${c.type} correlation (${c.correlation.toFixed(2)}) between ${c.field1} and ${c.field2}`);
    });
  }

  return report;
}
```

## Usage Examples

```javascript
// Basic analysis
const numbers = [23, 45, 67, 12, 89, 34, 56, 78, 90, 11];
const stats = analyzeData(numbers);
console.log('Mean:', stats.mean, 'Std Dev:', stats.standardDeviation);

// Read and analyze CSV
const salesData = readCSV('sales.csv');
const byRegion = groupAndAggregate(salesData, 'region', { revenue: 'sum', units: 'avg' });

// Time series
const monthly = [100, 120, 115, 140, 135, 160, 175, 180];
const ma = movingAverage(monthly, 3);
const growth = calculateGrowthRate(monthly);
const trend = detectTrend(monthly);

// Pivot table
const pivot = pivotTable(salesData, 'product', 'quarter', 'revenue', 'sum');

// Generate report
const report = generateDataReport(salesData);
console.log(report.insights);

// Export results
writeCSV('analysis_results.csv', byRegion);
```
