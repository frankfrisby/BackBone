#!/usr/bin/env node
'use strict';

/**
 * BACKBONE — CommonJS entry point for pkg (standalone executable)
 *
 * pkg cannot load ES modules directly from its snapshot filesystem.
 * This CJS wrapper uses dynamic import() to bootstrap the ESM app.
 */

// Load environment variables first
try {
  require('dotenv').config();
} catch (e) {
  // dotenv might not be available in all contexts
}

// Force color support for Windows
if (process.platform === 'win32') {
  process.env.FORCE_COLOR = '1';
  process.env.TERM = process.env.TERM || 'xterm-256color';
}

// Dynamic import of the ESM entry point
(async () => {
  try {
    await import('./backbone.js');
  } catch (err) {
    // If ESM import fails in pkg, show a clear error
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_UNSUPPORTED_ESM_URL_SCHEME') {
      console.error('\n[BACKBONE] Module loading failed in standalone mode.');
      console.error('[BACKBONE] This is a known pkg + ESM compatibility issue.');
      console.error('[BACKBONE] Attempting alternative load...\n');

      // Try loading from the filesystem (if running from project directory)
      try {
        const path = require('path');
        const entryPath = path.join(process.cwd(), 'bin', 'backbone.js');
        await import('file://' + entryPath.replace(/\\/g, '/'));
      } catch (err2) {
        console.error('[BACKBONE] Alternative load also failed.');
        console.error('[BACKBONE] Run with: node bin/backbone.js');
        console.error('[BACKBONE] Error:', err2.message);
        process.exit(1);
      }
    } else {
      console.error('[BACKBONE] Startup error:', err.message);
      console.error(err.stack);
      process.exit(1);
    }
  }
})();
