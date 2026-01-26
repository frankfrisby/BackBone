# Web Scraping Skill

Extract data from websites programmatically.

## Dependencies
```bash
npm install cheerio puppeteer axios
```

## Basic Scraping with Cheerio

```javascript
import axios from 'axios';
import * as cheerio from 'cheerio';

async function scrapeHTML(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  return cheerio.load(response.data);
}

async function extractText(url, selector) {
  const $ = await scrapeHTML(url);
  return $(selector).text().trim();
}

async function extractLinks(url, selector) {
  const $ = await scrapeHTML(url);
  const links = [];
  $(selector || 'a').each((i, el) => {
    links.push({
      text: $(el).text().trim(),
      href: $(el).attr('href')
    });
  });
  return links;
}
```

## Extract Structured Data

```javascript
async function extractTableData(url, tableSelector) {
  const $ = await scrapeHTML(url);
  const table = $(tableSelector);
  const data = [];

  const headers = [];
  table.find('thead th, tr:first-child th, tr:first-child td').each((i, el) => {
    headers.push($(el).text().trim());
  });

  table.find('tbody tr, tr:not(:first-child)').each((i, row) => {
    const rowData = {};
    $(row).find('td').each((j, cell) => {
      rowData[headers[j] || `col${j}`] = $(cell).text().trim();
    });
    if (Object.keys(rowData).length > 0) data.push(rowData);
  });

  return { headers, data };
}

async function extractListItems(url, listSelector) {
  const $ = await scrapeHTML(url);
  const items = [];
  $(listSelector).find('li').each((i, el) => {
    items.push($(el).text().trim());
  });
  return items;
}
```

## Dynamic Content with Puppeteer

```javascript
import puppeteer from 'puppeteer';

async function scrapeWithPuppeteer(url, options = {}) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.goto(url, { waitUntil: 'networkidle2' });

  if (options.waitForSelector) {
    await page.waitForSelector(options.waitForSelector);
  }

  const content = await page.content();
  await browser.close();

  return cheerio.load(content);
}

async function scrapeInfiniteScroll(url, itemSelector, maxItems = 100) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });

  let items = [];
  let previousHeight = 0;

  while (items.length < maxItems) {
    items = await page.$$eval(itemSelector, els => els.map(el => el.textContent.trim()));

    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }

  await browser.close();
  return items.slice(0, maxItems);
}
```

## Screenshot and PDF

```javascript
async function takeScreenshot(url, outputPath, options = {}) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  await page.setViewport(options.viewport || { width: 1920, height: 1080 });
  await page.goto(url, { waitUntil: 'networkidle2' });

  await page.screenshot({
    path: outputPath,
    fullPage: options.fullPage || false
  });

  await browser.close();
  return outputPath;
}

async function pageToPDF(url, outputPath) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.pdf({ path: outputPath, format: 'A4' });

  await browser.close();
  return outputPath;
}
```

## Form Interaction

```javascript
async function fillAndSubmitForm(url, formData, submitSelector) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2' });

  // Fill form fields
  for (const [selector, value] of Object.entries(formData)) {
    await page.type(selector, value);
  }

  // Submit and wait for navigation
  await Promise.all([
    page.waitForNavigation(),
    page.click(submitSelector)
  ]);

  const result = await page.content();
  await browser.close();

  return cheerio.load(result);
}
```

## Rate-Limited Scraping

```javascript
async function scrapeMultiplePages(urls, extractor, delayMs = 1000) {
  const results = [];

  for (const url of urls) {
    try {
      const $ = await scrapeHTML(url);
      const data = extractor($);
      results.push({ url, success: true, data });
    } catch (error) {
      results.push({ url, success: false, error: error.message });
    }

    // Respect rate limits
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return results;
}
```

## Usage Examples

```javascript
// Extract all links from a page
const links = await extractLinks('https://example.com', 'nav a');

// Scrape table data
const tableData = await extractTableData('https://example.com/data', 'table.data');

// Scrape dynamic content
const $ = await scrapeWithPuppeteer('https://example.com/spa', {
  waitForSelector: '.loaded-content'
});
const content = $('.loaded-content').text();

// Take full-page screenshot
await takeScreenshot('https://example.com', 'screenshot.png', { fullPage: true });

// Convert page to PDF
await pageToPDF('https://example.com/article', 'article.pdf');

// Scrape multiple pages with delay
const results = await scrapeMultiplePages(
  ['https://example.com/page1', 'https://example.com/page2'],
  ($) => ({ title: $('h1').text(), content: $('article').text() }),
  2000
);
```
