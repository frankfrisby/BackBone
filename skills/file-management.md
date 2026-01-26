# File Management Skill

Manage files and directories programmatically.

## Dependencies
```bash
npm install fs-extra glob archiver unzipper
```

## Basic File Operations

```javascript
import fs from 'fs-extra';
import path from 'path';

// Read file
async function readFile(filepath) {
  return await fs.readFile(filepath, 'utf8');
}

// Write file
async function writeFile(filepath, content) {
  await fs.ensureDir(path.dirname(filepath));
  await fs.writeFile(filepath, content);
  return filepath;
}

// Copy file
async function copyFile(source, destination) {
  await fs.ensureDir(path.dirname(destination));
  await fs.copy(source, destination);
  return destination;
}

// Move file
async function moveFile(source, destination) {
  await fs.ensureDir(path.dirname(destination));
  await fs.move(source, destination);
  return destination;
}

// Delete file
async function deleteFile(filepath) {
  await fs.remove(filepath);
  return true;
}
```

## Directory Operations

```javascript
// Create directory
async function createDirectory(dirpath) {
  await fs.ensureDir(dirpath);
  return dirpath;
}

// List directory contents
async function listDirectory(dirpath, options = {}) {
  const items = await fs.readdir(dirpath, { withFileTypes: true });

  return items.map(item => ({
    name: item.name,
    path: path.join(dirpath, item.name),
    isDirectory: item.isDirectory(),
    isFile: item.isFile()
  })).filter(item => {
    if (options.filesOnly && !item.isFile) return false;
    if (options.dirsOnly && !item.isDirectory) return false;
    return true;
  });
}

// Copy directory
async function copyDirectory(source, destination) {
  await fs.copy(source, destination);
  return destination;
}

// Delete directory
async function deleteDirectory(dirpath) {
  await fs.remove(dirpath);
  return true;
}
```

## File Search

```javascript
import { glob } from 'glob';

async function findFiles(pattern, options = {}) {
  const files = await glob(pattern, {
    cwd: options.cwd || process.cwd(),
    ignore: options.ignore || ['node_modules/**'],
    absolute: options.absolute || false
  });
  return files;
}

async function findFilesByContent(directory, searchText, extensions = ['*']) {
  const pattern = `${directory}/**/*.{${extensions.join(',')}}`;
  const files = await findFiles(pattern);
  const matches = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      if (content.includes(searchText)) {
        const lines = content.split('\n');
        const matchingLines = lines
          .map((line, i) => ({ line: i + 1, content: line }))
          .filter(l => l.content.includes(searchText));
        matches.push({ file, matches: matchingLines });
      }
    } catch (e) { /* skip binary files */ }
  }

  return matches;
}
```

## File Information

```javascript
async function getFileInfo(filepath) {
  const stats = await fs.stat(filepath);

  return {
    path: filepath,
    name: path.basename(filepath),
    extension: path.extname(filepath),
    directory: path.dirname(filepath),
    size: stats.size,
    sizeFormatted: formatBytes(stats.size),
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory()
  };
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(2)} ${units[i]}`;
}

async function getDirectorySize(dirpath) {
  let totalSize = 0;

  async function calculateSize(dir) {
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        await calculateSize(itemPath);
      } else {
        const stats = await fs.stat(itemPath);
        totalSize += stats.size;
      }
    }
  }

  await calculateSize(dirpath);
  return { bytes: totalSize, formatted: formatBytes(totalSize) };
}
```

## Archive Operations

```javascript
import archiver from 'archiver';
import unzipper from 'unzipper';

async function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(outputPath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function createZipFromFiles(files, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(outputPath));
    archive.on('error', reject);

    archive.pipe(output);
    files.forEach(file => archive.file(file, { name: path.basename(file) }));
    archive.finalize();
  });
}

async function extractZip(zipPath, outputDir) {
  await fs.ensureDir(outputDir);

  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: outputDir }))
      .on('close', () => resolve(outputDir))
      .on('error', reject);
  });
}
```

## Watch Files

```javascript
function watchFiles(directory, callback, options = {}) {
  const watcher = fs.watch(directory, { recursive: options.recursive }, (eventType, filename) => {
    callback({
      type: eventType,
      filename,
      path: path.join(directory, filename),
      timestamp: new Date()
    });
  });

  return () => watcher.close();
}
```

## Batch Operations

```javascript
async function batchRename(directory, pattern, replacement) {
  const files = await listDirectory(directory, { filesOnly: true });
  const results = [];

  for (const file of files) {
    const newName = file.name.replace(new RegExp(pattern), replacement);
    if (newName !== file.name) {
      const newPath = path.join(directory, newName);
      await fs.rename(file.path, newPath);
      results.push({ old: file.name, new: newName });
    }
  }

  return results;
}

async function organizeByExtension(sourceDir, targetDir) {
  const files = await listDirectory(sourceDir, { filesOnly: true });
  const results = { moved: [], errors: [] };

  for (const file of files) {
    try {
      const ext = path.extname(file.name).slice(1) || 'no-extension';
      const destDir = path.join(targetDir, ext);
      const destPath = path.join(destDir, file.name);

      await fs.ensureDir(destDir);
      await fs.move(file.path, destPath);
      results.moved.push({ file: file.name, folder: ext });
    } catch (error) {
      results.errors.push({ file: file.name, error: error.message });
    }
  }

  return results;
}
```

## Usage Examples

```javascript
// Read/write files
const content = await readFile('input.txt');
await writeFile('output.txt', 'Hello World');

// Copy and move
await copyFile('source.txt', 'backup/source.txt');
await moveFile('old/file.txt', 'new/file.txt');

// Find files
const jsFiles = await findFiles('src/**/*.js');
const matches = await findFilesByContent('./src', 'TODO', ['js', 'ts']);

// Get info
const info = await getFileInfo('report.pdf');
const dirSize = await getDirectorySize('./node_modules');

// Create archives
await createZip('./project', 'project.zip');
await extractZip('archive.zip', './extracted');

// Batch operations
await batchRename('./photos', /IMG_/, 'Photo_');
await organizeByExtension('./downloads', './organized');

// Watch for changes
const stopWatching = watchFiles('./src', (event) => {
  console.log(`${event.type}: ${event.filename}`);
}, { recursive: true });
```
