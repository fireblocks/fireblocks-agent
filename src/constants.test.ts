import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('constants WS_PING_INTERVAL_MS', () => {
  const ORIGINAL = process.env.WS_PING_INTERVAL_MS;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.WS_PING_INTERVAL_MS;
    } else {
      process.env.WS_PING_INTERVAL_MS = ORIGINAL;
    }
    jest.resetModules();
  });

  // Re-require constants with a fresh module graph so the module-level constant is
  // re-evaluated against the desired env value (dotenv does not override an existing var).
  const loadWsPingInterval = (value?: string): number => {
    jest.resetModules();
    if (value === undefined) {
      delete process.env.WS_PING_INTERVAL_MS;
    } else {
      process.env.WS_PING_INTERVAL_MS = value;
    }
    return require('./constants').WS_PING_INTERVAL_MS;
  };

  it('falls back to 30000 for a non-numeric value', () => {
    expect(loadWsPingInterval('not-a-number')).toBe(30000);
  });

  it('falls back to 30000 for a non-positive value', () => {
    expect(loadWsPingInterval('0')).toBe(30000);
    expect(loadWsPingInterval('-5')).toBe(30000);
  });

  it('honors a valid positive numeric override', () => {
    expect(loadWsPingInterval('5000')).toBe(5000);
  });

  it('defaults to 30000 when unset', () => {
    expect(loadWsPingInterval(undefined)).toBe(30000);
  });
});

describe('constants WEBSOCKET_ENABLED opt-out', () => {
  const ORIGINAL = process.env.WEBSOCKET_ENABLED;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.WEBSOCKET_ENABLED;
    } else {
      process.env.WEBSOCKET_ENABLED = ORIGINAL;
    }
    jest.resetModules();
  });

  const loadWebsocketEnabled = (value?: string): boolean => {
    jest.resetModules();
    if (value === undefined) {
      delete process.env.WEBSOCKET_ENABLED;
    } else {
      process.env.WEBSOCKET_ENABLED = value;
    }
    return require('./constants').WEBSOCKET_ENABLED;
  };

  it('is on by default', () => {
    expect(loadWebsocketEnabled(undefined)).toBe(true);
  });

  it('disables only on recognized false-ish values (case-insensitive, trimmed)', () => {
    expect(loadWebsocketEnabled('false')).toBe(false);
    expect(loadWebsocketEnabled('False')).toBe(false);
    expect(loadWebsocketEnabled('FALSE')).toBe(false);
    expect(loadWebsocketEnabled(' false ')).toBe(false);
    expect(loadWebsocketEnabled('0')).toBe(false);
    expect(loadWebsocketEnabled('no')).toBe(false);
    expect(loadWebsocketEnabled('off')).toBe(false);
  });

  it('stays enabled (fail-safe on) for true-ish, blank, or unrecognized values', () => {
    expect(loadWebsocketEnabled('true')).toBe(true);
    expect(loadWebsocketEnabled('1')).toBe(true);
    expect(loadWebsocketEnabled('yes')).toBe(true);
    expect(loadWebsocketEnabled('on')).toBe(true);
    expect(loadWebsocketEnabled('   ')).toBe(true); // blank -> default on
    expect(loadWebsocketEnabled('maybe')).toBe(true); // unrecognized -> default on
  });
});
