/**
 * Plaid Service Tests
 * Tests for Plaid banking integration with sandbox mode
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    watch: vi.fn(() => ({ close: vi.fn() }))
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  watch: vi.fn(() => ({ close: vi.fn() }))
}));

// Mock firebase-config
vi.mock('../services/firebase/firebase-config.js', () => ({
  fetchPlaidConfig: vi.fn(() => Promise.resolve(null))
}));

// Mock open-url
vi.mock('../services/open-url.js', () => ({
  openUrl: vi.fn()
}));

// Import after mocks
import { PlaidService, getPlaidService, isPlaidConfigured, hasPlaidCredentials } from '../src/services/integrations/plaid-service.js';

describe('Plaid Service - Configuration', () => {
  let service;

  beforeEach(() => {
    // Clear environment
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;
    delete process.env.PLAID_ENV;

    // Create fresh instance
    service = new PlaidService();
  });

  it('should default to sandbox environment', () => {
    expect(service.env).toBe('sandbox');
  });

  it('should report no credentials when not configured', () => {
    expect(service.hasCredentials()).toBe(false);
  });

  it('should report credentials when configured', () => {
    service.clientId = 'test_client_id';
    service.secret = 'test_secret';

    expect(service.hasCredentials()).toBe(true);
  });

  it('should report not configured without access tokens', () => {
    service.clientId = 'test_client_id';
    service.secret = 'test_secret';

    expect(service.isConfigured()).toBe(false);
  });

  it('should report configured with access tokens', () => {
    service.clientId = 'test_client_id';
    service.secret = 'test_secret';
    service.accessTokens = [{ accessToken: 'test_token' }];

    expect(service.isConfigured()).toBe(true);
  });
});

describe('Plaid Service - Environment URLs', () => {
  let service;

  beforeEach(() => {
    service = new PlaidService();
  });

  it('should return sandbox URL by default', () => {
    service.env = 'sandbox';
    expect(service.getBaseUrl()).toBe('https://sandbox.plaid.com');
  });

  it('should return development URL when set', () => {
    service.env = 'development';
    expect(service.getBaseUrl()).toBe('https://development.plaid.com');
  });

  it('should return production URL when set', () => {
    service.env = 'production';
    expect(service.getBaseUrl()).toBe('https://production.plaid.com');
  });

  it('should fall back to sandbox for unknown env', () => {
    service.env = 'unknown';
    expect(service.getBaseUrl()).toBe('https://sandbox.plaid.com');
  });
});

describe('Plaid Service - Config Status', () => {
  let service;

  beforeEach(() => {
    service = new PlaidService();
    service.env = 'sandbox';
  });

  it('should return complete config status', () => {
    service.clientId = 'test_id';
    service.secret = 'test_secret';
    service.accessTokens = [{ accessToken: 'tok1' }, { accessToken: 'tok2' }];
    service.data.accounts = [{ id: 'acc1' }, { id: 'acc2' }, { id: 'acc3' }];
    service.data.lastUpdated = '2026-01-25T00:00:00.000Z';

    const config = service.getConfig();

    expect(config.hasCredentials).toBe(true);
    expect(config.configured).toBe(true);
    expect(config.environment).toBe('sandbox');
    expect(config.institutionCount).toBe(2);
    expect(config.accountCount).toBe(3);
    expect(config.lastUpdated).toBe('2026-01-25T00:00:00.000Z');
  });
});

describe('Plaid Service - Display Data', () => {
  let service;

  beforeEach(() => {
    service = new PlaidService();
    service.clientId = 'test_id';
    service.secret = 'test_secret';
    service.accessTokens = [{ accessToken: 'tok1' }];
  });

  it('should return formatted display data', () => {
    service.data = {
      accounts: [
        { id: 'acc1', type: 'depository', balance: 5000 },
        { id: 'acc2', type: 'depository', balance: 3000 },
        { id: 'acc3', type: 'credit', balance: 1000 }
      ],
      institutions: ['Bank 1'],
      netWorth: { total: 7000, assets: 8000, liabilities: 1000 },
      lastUpdated: '2026-01-25T00:00:00.000Z'
    };

    const display = service.getDisplayData();

    expect(display.connected).toBe(true);
    expect(display.netWorth.total).toBe(7000);
    expect(display.accountCount).toBe(3);
    expect(display.accountsByType.depository.count).toBe(2);
    expect(display.accountsByType.depository.balance).toBe(8000);
    expect(display.accountsByType.credit.count).toBe(1);
  });

  it('should return net worth data for life scores', () => {
    service.data = {
      netWorth: { total: 50000, assets: 60000, liabilities: 10000 },
      accounts: [{ id: 'acc1' }, { id: 'acc2' }],
      lastUpdated: '2026-01-25T00:00:00.000Z'
    };

    const netWorth = service.getNetWorthData();

    expect(netWorth.total).toBe(50000);
    expect(netWorth.assets).toBe(60000);
    expect(netWorth.liabilities).toBe(10000);
    expect(netWorth.accounts).toBe(2);
  });
});

describe('Plaid Service - Format Currency', () => {
  let service;

  beforeEach(() => {
    service = new PlaidService();
  });

  it('should format positive amounts', () => {
    const formatted = service.formatCurrency(1234567);
    expect(formatted).toBe('$1,234,567');
  });

  it('should format zero', () => {
    const formatted = service.formatCurrency(0);
    expect(formatted).toBe('$0');
  });

  it('should handle null', () => {
    const formatted = service.formatCurrency(null);
    expect(formatted).toBe('$0');
  });

  it('should format negative amounts', () => {
    const formatted = service.formatCurrency(-5000);
    expect(formatted).toBe('-$5,000');
  });
});

describe('Plaid Service - Stale Data Check', () => {
  let service;

  beforeEach(() => {
    service = new PlaidService();
  });

  it('should report stale when no lastUpdated', () => {
    service.data.lastUpdated = null;
    expect(service.isStale()).toBe(true);
  });

  it('should report stale when data is old', () => {
    // 5 hours ago (cache is 4 hours)
    const oldTime = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    service.data.lastUpdated = oldTime;
    expect(service.isStale()).toBe(true);
  });

  it('should report not stale when data is fresh', () => {
    // 1 hour ago
    const freshTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    service.data.lastUpdated = freshTime;
    expect(service.isStale()).toBe(false);
  });
});

describe('Plaid Service - Connected Institutions', () => {
  let service;

  beforeEach(() => {
    service = new PlaidService();
  });

  it('should return list of connected institutions', () => {
    service.accessTokens = [
      { itemId: 'item1', institutionName: 'Chase', addedAt: '2026-01-01' },
      { itemId: 'item2', institutionName: 'Bank of America', addedAt: '2026-01-15' }
    ];

    const institutions = service.getConnectedInstitutions();

    expect(institutions.length).toBe(2);
    expect(institutions[0].name).toBe('Chase');
    expect(institutions[1].name).toBe('Bank of America');
  });

  it('should return empty array when no institutions', () => {
    service.accessTokens = [];
    const institutions = service.getConnectedInstitutions();
    expect(institutions).toEqual([]);
  });
});

describe('Plaid Service - Singleton', () => {
  it('should return singleton instance', () => {
    const instance1 = getPlaidService();
    const instance2 = getPlaidService();

    expect(instance1).toBe(instance2);
  });
});

describe('Plaid Service - Helper Functions', () => {
  it('isPlaidConfigured should check configuration', () => {
    const service = getPlaidService();
    service.clientId = null;
    service.secret = null;
    service.accessTokens = [];

    expect(isPlaidConfigured()).toBe(false);
  });

  it('hasPlaidCredentials should check credentials', () => {
    const service = getPlaidService();
    service.clientId = null;
    service.secret = null;

    expect(hasPlaidCredentials()).toBe(false);

    service.clientId = 'test';
    service.secret = 'test';

    expect(hasPlaidCredentials()).toBe(true);
  });
});

describe('Plaid Service - Sandbox Environment', () => {
  let service;

  beforeEach(() => {
    service = new PlaidService();
    service.env = 'sandbox';
  });

  it('should be in sandbox mode by default', () => {
    expect(service.env).toBe('sandbox');
    expect(service.getBaseUrl()).toContain('sandbox');
  });

  it('should use sandbox URL for API requests', () => {
    expect(service.getBaseUrl()).toBe('https://sandbox.plaid.com');
  });
});

console.log('Plaid Service Tests - Run with: npx vitest run tests/plaid-service.test.js');
