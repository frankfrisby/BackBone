# PowerPoint Presentation Creation Skill

Create professional Microsoft PowerPoint presentations (.pptx) programmatically.

## Dependencies
```bash
npm install pptxgenjs
```

## Basic Presentation Creation

```javascript
import PptxGenJS from 'pptxgenjs';

async function createPresentation(filename, slides) {
  const pptx = new PptxGenJS();

  slides.forEach(slideData => {
    const slide = pptx.addSlide();

    if (slideData.title) {
      slide.addText(slideData.title, {
        x: 0.5, y: 0.5, w: '90%',
        fontSize: 36, bold: true, color: '363636'
      });
    }

    if (slideData.content) {
      slide.addText(slideData.content, {
        x: 0.5, y: 1.5, w: '90%',
        fontSize: 18, color: '666666'
      });
    }
  });

  await pptx.writeFile({ fileName: filename });
  return filename;
}
```

## Create Title Slide

```javascript
function addTitleSlide(pptx, title, subtitle) {
  const slide = pptx.addSlide();

  slide.addText(title, {
    x: 0.5, y: 2, w: '90%', h: 1.5,
    fontSize: 44, bold: true, color: '363636',
    align: 'center', valign: 'middle'
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 3.5, w: '90%', h: 1,
      fontSize: 24, color: '666666',
      align: 'center', valign: 'middle'
    });
  }

  return slide;
}
```

## Create Bullet Point Slide

```javascript
function addBulletSlide(pptx, title, bullets) {
  const slide = pptx.addSlide();

  slide.addText(title, {
    x: 0.5, y: 0.5, w: '90%',
    fontSize: 32, bold: true, color: '363636'
  });

  const bulletText = bullets.map(b => ({ text: b, options: { bullet: true } }));

  slide.addText(bulletText, {
    x: 0.5, y: 1.5, w: '90%', h: 4,
    fontSize: 20, color: '666666',
    valign: 'top'
  });

  return slide;
}
```

## Create Slide with Table

```javascript
function addTableSlide(pptx, title, tableData) {
  const slide = pptx.addSlide();

  slide.addText(title, {
    x: 0.5, y: 0.5, w: '90%',
    fontSize: 32, bold: true, color: '363636'
  });

  const rows = tableData.map((row, rowIndex) =>
    row.map(cell => ({
      text: cell,
      options: {
        fill: rowIndex === 0 ? '4472C4' : 'FFFFFF',
        color: rowIndex === 0 ? 'FFFFFF' : '363636',
        bold: rowIndex === 0
      }
    }))
  );

  slide.addTable(rows, {
    x: 0.5, y: 1.5, w: 9, h: 3,
    border: { pt: 1, color: 'CFCFCF' },
    fontFace: 'Arial',
    fontSize: 14
  });

  return slide;
}
```

## Create Slide with Chart

```javascript
function addChartSlide(pptx, title, chartData, chartType = 'bar') {
  const slide = pptx.addSlide();

  slide.addText(title, {
    x: 0.5, y: 0.3, w: '90%',
    fontSize: 32, bold: true, color: '363636'
  });

  slide.addChart(pptx.ChartType[chartType], chartData, {
    x: 0.5, y: 1.2, w: 9, h: 4.5,
    showLegend: true,
    legendPos: 'b'
  });

  return slide;
}
```

## Create Slide with Image

```javascript
function addImageSlide(pptx, title, imagePath, caption) {
  const slide = pptx.addSlide();

  slide.addText(title, {
    x: 0.5, y: 0.5, w: '90%',
    fontSize: 32, bold: true, color: '363636'
  });

  slide.addImage({
    path: imagePath,
    x: 1.5, y: 1.5, w: 7, h: 4
  });

  if (caption) {
    slide.addText(caption, {
      x: 0.5, y: 5.7, w: '90%',
      fontSize: 14, color: '999999',
      align: 'center'
    });
  }

  return slide;
}
```

## Complete Presentation Example

```javascript
async function createFullPresentation(filename, data) {
  const pptx = new PptxGenJS();

  // Set presentation properties
  pptx.author = data.author || 'Author';
  pptx.title = data.title || 'Presentation';
  pptx.subject = data.subject || '';

  // Title slide
  addTitleSlide(pptx, data.title, data.subtitle);

  // Content slides
  data.slides.forEach(slideData => {
    switch (slideData.type) {
      case 'bullets':
        addBulletSlide(pptx, slideData.title, slideData.bullets);
        break;
      case 'table':
        addTableSlide(pptx, slideData.title, slideData.tableData);
        break;
      case 'chart':
        addChartSlide(pptx, slideData.title, slideData.chartData, slideData.chartType);
        break;
      case 'image':
        addImageSlide(pptx, slideData.title, slideData.imagePath, slideData.caption);
        break;
      default:
        const slide = pptx.addSlide();
        slide.addText(slideData.title, { x: 0.5, y: 0.5, fontSize: 32, bold: true });
        slide.addText(slideData.content || '', { x: 0.5, y: 1.5, fontSize: 18 });
    }
  });

  await pptx.writeFile({ fileName: filename });
  return filename;
}
```

## Usage Examples

```javascript
// Simple presentation
await createPresentation('simple.pptx', [
  { title: 'Welcome', content: 'Introduction to our project' },
  { title: 'Goals', content: 'Our main objectives for this quarter' }
]);

// Full business presentation
await createFullPresentation('quarterly.pptx', {
  title: 'Q4 Review',
  subtitle: 'Performance Analysis',
  author: 'John Smith',
  slides: [
    { type: 'bullets', title: 'Highlights', bullets: ['Revenue up 15%', 'New clients: 50', 'Team growth: 3 new hires'] },
    { type: 'table', title: 'Sales by Region', tableData: [['Region', 'Q3', 'Q4'], ['North', '$1M', '$1.2M'], ['South', '$800K', '$950K']] },
    { type: 'chart', title: 'Monthly Trend', chartType: 'line', chartData: [{ name: 'Sales', labels: ['Jan', 'Feb', 'Mar'], values: [100, 120, 150] }] }
  ]
});
```
