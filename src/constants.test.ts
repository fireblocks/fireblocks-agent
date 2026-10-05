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

describe('constants FB_LONG_POLL_TIMEOUT_MS', () => {
  const ORIGINAL = process.env.FB_LONG_POLL_TIMEOUT_MS;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.FB_LONG_POLL_TIMEOUT_MS;
    } else {
      process.env.FB_LONG_POLL_TIMEOUT_MS = ORIGINAL;
    }
    jest.resetModules();
  });

  const loadLongPollTimeout = (value?: string): number => {
    jest.resetModules();
    if (value === undefined) {
      delete process.env.FB_LONG_POLL_TIMEOUT_MS;
    } else {
      process.env.FB_LONG_POLL_TIMEOUT_MS = value;
    }
    return require('./constants').FB_LONG_POLL_TIMEOUT_MS;
  };

  // The gateway holds /msg for ~20s (longPollWaitSec default), and there is a 60s
  // infrastructure request ceiling above it. The default has to clear BOTH -- clear of the
  // ceiling so a deadline that trips means "wedged" rather than "about to be killed upstream"
  // -- and past that, lower is better: the value is how long a wedged poll goes unnoticed.
  it('defaults to 90000 when unset', () => {
    expect(loadLongPollTimeout(undefined)).toBe(90000);
  });

  it('clears the gateway poll window and the infrastructure ceiling above it', () => {
    const value = loadLongPollTimeout(undefined);
    expect(value).toBeGreaterThan(60000);
  });

  it('falls back to the default for a non-numeric or non-positive value', () => {
    expect(loadLongPollTimeout('not-a-number')).toBe(90000);
    expect(loadLongPollTimeout('0')).toBe(90000);
    expect(loadLongPollTimeout('-5')).toBe(90000);
  });

  it('honors a valid positive numeric override', () => {
    expect(loadLongPollTimeout('45000')).toBe(45000);
  });
});

describe('constants timeout ordering check', () => {
  const ORIGINALS = {
    FB_HTTP_TIMEOUT_MS: process.env.FB_HTTP_TIMEOUT_MS,
    WS_CONNECT_TIMEOUT_MS: process.env.WS_CONNECT_TIMEOUT_MS,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINALS)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    jest.resetModules();
  });

  // Load constants in a fresh module registry with logger spied on first, so the boot-time
  // check's own warn is captured.
  const loadWith = (env: Record<string, string | undefined>) => {
    jest.resetModules();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    const logger = require('./services/logger').default;
    const warn = jest.spyOn(logger, 'warn').mockImplementation((() => undefined) as any);
    require('./constants');
    return warn;
  };

  it('stays quiet on the default ordering', () => {
    const warn = loadWith({ FB_HTTP_TIMEOUT_MS: undefined, WS_CONNECT_TIMEOUT_MS: undefined });

    expect(warn).not.toHaveBeenCalled();
  });

  // The ordering is load-bearing, not stylistic: the connect watchdog is a backstop for the
  // window the HTTP deadline cannot see, so it must fire second. Both are independently
  // env-tunable, so a deploy can invert it -- at which point the watchdog pre-empts a token
  // fetch that was still healthy and abandons the attempt on every slow fetch.
  it('warns when FB_HTTP_TIMEOUT_MS would not reject before the connect watchdog fires', () => {
    const warn = loadWith({ FB_HTTP_TIMEOUT_MS: '90000', WS_CONNECT_TIMEOUT_MS: '60000' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('WS_CONNECT_TIMEOUT_MS');
  });

  it('warns when the two are set equal', () => {
    const warn = loadWith({ FB_HTTP_TIMEOUT_MS: '30000', WS_CONNECT_TIMEOUT_MS: '30000' });

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
