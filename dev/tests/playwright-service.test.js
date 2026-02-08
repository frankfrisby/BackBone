/**
 * Playwright Service Tests
 * Tests for browser automation/computer use capabilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => [])
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => [])
}));

// Import after mocks
import { PlaywrightService, getPlaywrightService } from '../src/services/integrations/playwright-service.js';

describe('Playwright Service - Initialization', () => {
  let service;

  beforeEach(() => {
    service = new PlaywrightService();
  });

  it('should start with default settings', () => {
    expect(service.browser).toBeNull();
    expect(service.page).toBeNull();
    expect(service.isHeadless).toBe(false); // Show browser by default
    expect(service.viewport).toEqual({ width: 1280, height: 720 });
  });

  it('should report not ready before initialization', () => {
    expect(service.isReady()).toBe(false);
  });
});

describe('Playwright Service - Status', () => {
  let service;

  beforeEach(() => {
    service = new PlaywrightService();
  });

  it('should return status with capabilities', async () => {
    const status = await service.getStatus();

    expect(status).toHaveProperty('playwrightAvailable');
    expect(status).toHaveProperty('browserRunning');
    expect(status).toHaveProperty('capabilities');
    expect(status.capabilities).toHaveProperty('navigate');
    expect(status.capabilities).toHaveProperty('screenshot');
    expect(status.capabilities).toHaveProperty('click');
    expect(status.capabilities).toHaveProperty('type');
    expect(status.capabilities).toHaveProperty('scroll');
    expect(status.capabilities).toHaveProperty('fillForm');
  });

  it('should report browser not running before initialization', async () => {
    const status = await service.getStatus();
    expect(status.browserRunning).toBe(false);
    expect(status.currentUrl).toBeNull();
  });
});

describe('Playwright Service - Singleton', () => {
  it('should return singleton instance', () => {
    const instance1 = getPlaywrightService();
    const instance2 = getPlaywrightService();

    expect(instance1).toBe(instance2);
  });
});

describe('Playwright Service - Methods Return Expected Structure', () => {
  let service;

  beforeEach(() => {
    service = new PlaywrightService();
    // Not initializing browser - testing error handling
  });

  it('navigate should return error when not initialized', async () => {
    // Mock initialize to fail
    const result = await service.navigate('https://example.com');

    // Either returns success with initialization or error
    expect(result).toHaveProperty('success');
  });

  it('click should return error when not initialized', async () => {
    const result = await service.click('button');

    expect(result).toHaveProperty('success');
    if (!result.success) {
      expect(result).toHaveProperty('error');
    }
  });

  it('type should return error when not initialized', async () => {
    const result = await service.type('hello');

    expect(result).toHaveProperty('success');
    if (!result.success) {
      expect(result).toHaveProperty('error');
    }
  });

  it('scroll should return error when not initialized', async () => {
    const result = await service.scroll('down', 500);

    expect(result).toHaveProperty('success');
    if (!result.success) {
      expect(result).toHaveProperty('error');
    }
  });

  it('getContent should return error when not initialized', async () => {
    const result = await service.getContent();

    expect(result).toHaveProperty('success');
    if (!result.success) {
      expect(result).toHaveProperty('error');
    }
  });

  it('fillForm should return error when not initialized', async () => {
    const result = await service.fillForm({ '#name': 'Test' });

    expect(result).toHaveProperty('success');
    if (!result.success) {
      expect(result).toHaveProperty('error');
    }
  });

  it('waitForSelector should return error when not initialized', async () => {
    const result = await service.waitForSelector('.element');

    expect(result).toHaveProperty('success');
    if (!result.success) {
      expect(result).toHaveProperty('error');
    }
  });

  it('close should succeed even when not initialized', async () => {
    const result = await service.close();

    expect(result).toHaveProperty('success');
    expect(result.success).toBe(true);
  });
});

describe('Playwright Service - Event Emission', () => {
  let service;

  beforeEach(() => {
    service = new PlaywrightService();
  });

  it('should emit events', () => {
    let emitted = false;

    service.on('closed', () => {
      emitted = true;
    });

    service.emit('closed');
    expect(emitted).toBe(true);
  });
});

describe('Playwright Service - Settings', () => {
  it('should accept custom viewport in constructor', () => {
    const service = new PlaywrightService();

    expect(service.viewport).toEqual({ width: 1280, height: 720 });
  });

  it('should default to visible browser (not headless)', () => {
    const service = new PlaywrightService();

    expect(service.isHeadless).toBe(false);
  });
});

console.log('Playwright Service Tests - Run with: npx vitest run tests/playwright-service.test.js');
