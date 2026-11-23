import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TOKEN_PATH } from '../constants';

const loggerMock = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
jest.mock('./logger', () => ({ __esModule: true, default: loggerMock }));

// Not a real credential; these tests never reach the gateway.
const DEVICE_DATA = {
  userId: '792e0405-6212-47e3-82b4-d96d393c05b0',
  deviceId: '4323c5b7-7070-4cf2-ac57-6529d50fde45',
  refreshToken: 'not-a-real-refresh-token',
};

const ORIGINAL_FB_DEVICE_DATA = process.env.FB_DEVICE_DATA;

// FB_DEVICE_DATA is read and parsed once at module scope, so each case needs a fresh graph.
const loadService = (value?: string) => {
  jest.resetModules();
  if (value === undefined) {
    delete process.env.FB_DEVICE_DATA;
  } else {
    process.env.FB_DEVICE_DATA = value;
  }
  return require('./device.service').default;
};

describe('device service FB_DEVICE_DATA', () => {
  // A real token file would make isPaired() true on its own, hiding what these assert.
  beforeEach(() => {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.copyFileSync(TOKEN_PATH, `${TOKEN_PATH}.envbak`);
      fs.unlinkSync(TOKEN_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(`${TOKEN_PATH}.envbak`)) {
      fs.copyFileSync(`${TOKEN_PATH}.envbak`, TOKEN_PATH);
      fs.unlinkSync(`${TOKEN_PATH}.envbak`);
    }
    if (ORIGINAL_FB_DEVICE_DATA === undefined) {
      delete process.env.FB_DEVICE_DATA;
    } else {
      process.env.FB_DEVICE_DATA = ORIGINAL_FB_DEVICE_DATA;
    }
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('reports paired from the env var with no token file present', () => {
    const service = loadService(JSON.stringify(DEVICE_DATA));

    expect(service.isPaired()).toBe(true);
    expect(fs.existsSync(TOKEN_PATH)).toBe(false);
  });

  it('reads the device data from the file named by FB_DEVICE_DATA_FILE', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-data-'));
    const file = path.join(dir, 'device-data');
    fs.writeFileSync(file, `${JSON.stringify(DEVICE_DATA)}\n`);
    process.env.FB_DEVICE_DATA_FILE = file;
    try {
      const service = loadService();

      expect(service.isPaired()).toBe(true);
      expect(service.getDeviceData()).toStrictEqual(DEVICE_DATA);
      expect(fs.existsSync(TOKEN_PATH)).toBe(false);
      expect(loggerMock.info).toHaveBeenCalledWith('Using the device data from the file named by FB_DEVICE_DATA_FILE');
      expect(JSON.stringify(loggerMock.info.mock.calls)).not.toContain(DEVICE_DATA.refreshToken);
    } finally {
      delete process.env.FB_DEVICE_DATA_FILE;
      delete process.env.FB_DEVICE_DATA;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses FB_DEVICE_DATA and FB_DEVICE_DATA_FILE together', () => {
    process.env.FB_DEVICE_DATA_FILE = '/does/not/matter';
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => loadService(JSON.stringify(DEVICE_DATA))).toThrow('process.exit');
      expect(exit).toHaveBeenCalledWith(2);
      expect(String(error.mock.calls[0][0])).toContain('Set either FB_DEVICE_DATA or FB_DEVICE_DATA_FILE, not both.');
    } finally {
      exit.mockRestore();
      error.mockRestore();
      delete process.env.FB_DEVICE_DATA_FILE;
    }
  });

  it('returns the injected device data', () => {
    const service = loadService(JSON.stringify(DEVICE_DATA));

    expect(service.getDeviceData()).toStrictEqual(DEVICE_DATA);
  });

  it('never writes the injected data to disk', () => {
    const service = loadService(JSON.stringify(DEVICE_DATA));

    service.getDeviceData();

    // The point of the env path: nothing to persist, so no volume is needed.
    expect(fs.existsSync(TOKEN_PATH)).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    const service = loadService(`  ${JSON.stringify(DEVICE_DATA)}\n`);

    expect(service.isPaired()).toBe(true);
    expect(service.getDeviceData()).toStrictEqual(DEVICE_DATA);
  });

  it('ignores a value that is not valid JSON', () => {
    const service = loadService('not-json');

    expect(service.isPaired()).toBe(false);
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'));
  });

  it('ignores an object missing required fields, and names the missing ones', () => {
    // The usual mistake: pasting the refresh token alone.
    const service = loadService(JSON.stringify({ refreshToken: DEVICE_DATA.refreshToken }));

    expect(service.isPaired()).toBe(false);
    const message = loggerMock.error.mock.calls.flat().join(' ');
    expect(message).toContain('userId');
    expect(message).toContain('deviceId');
  });

  it('ignores a field present but blank', () => {
    const service = loadService(JSON.stringify({ ...DEVICE_DATA, deviceId: '   ' }));

    expect(service.isPaired()).toBe(false);
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('deviceId'));
  });

  it('ignores a userId or deviceId that is not a GUID', () => {
    const service = loadService(JSON.stringify({ ...DEVICE_DATA, userId: 'invalid' }));

    expect(service.isPaired()).toBe(false);
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('userId'));
  });

  it('falls back to the token file when the env var is unset', () => {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(DEVICE_DATA));
    const service = loadService(undefined);

    expect(service.isPaired()).toBe(true);
    expect(service.getDeviceData()).toStrictEqual(DEVICE_DATA);

    fs.unlinkSync(TOKEN_PATH);
  });

  it('never writes the refresh token to the log', () => {
    const service = loadService(JSON.stringify({ refreshToken: DEVICE_DATA.refreshToken }));
    service.isPaired();

    const logged = [...loggerMock.info.mock.calls, ...loggerMock.error.mock.calls].flat().join(' ');
    expect(logged).not.toContain(DEVICE_DATA.refreshToken);
  });

  it('logs that the env var was used, without its value', () => {
    const service = loadService(JSON.stringify(DEVICE_DATA));
    service.isPaired();

    expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('FB_DEVICE_DATA'));
    const logged = [...loggerMock.info.mock.calls, ...loggerMock.error.mock.calls].flat().join(' ');
    expect(logged).not.toContain(DEVICE_DATA.refreshToken);
  });
});
