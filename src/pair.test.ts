import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TOKEN_PATH } from './constants';

const loggerMock = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
jest.mock('./services/logger', () => ({ __esModule: true, default: loggerMock }));

const requestDeviceData = jest.fn<(token: string) => Promise<unknown>>();
const isValidPairingToken = jest.fn<(token: string) => boolean>();
jest.mock('./services/fireblocks-agent', () => ({
  __esModule: true,
  default: { requestDeviceData, isValidPairingToken },
}));

import { EXIT_BAD_INPUT, EXIT_PAIRED, EXIT_PAIRING_FAILED, runPairing } from './pair';

// Not real credentials; these tests never reach the gateway.
const TOKEN = 'header.not-a-real-pairing-token.signature';
const DEVICE_DATA = {
  userId: '792e0405-6212-47e3-82b4-d96d393c05b0',
  deviceId: '4323c5b7-7070-4cf2-ac57-6529d50fde45',
  refreshToken: 'not-a-real-refresh-token',
};

let dir: string;
let env: Record<string, string>;
const allLogText = () => [...loggerMock.info.mock.calls, ...loggerMock.error.mock.calls].flat().join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-'));
  fs.writeFileSync(path.join(dir, 'token'), `${TOKEN}\n`);
  env = { PAIRING_TOKEN_FILE: path.join(dir, 'token'), DEVICE_DATA_OUTPUT_FILE: path.join(dir, 'device-data') };
  isValidPairingToken.mockReturnValue(true);
  requestDeviceData.mockResolvedValue(DEVICE_DATA);
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('runPairing', () => {
  it('pairs with the token from the file and writes the device data to the output file', async () => {
    const existedBefore = fs.existsSync(TOKEN_PATH);

    expect(await runPairing(env)).toBe(EXIT_PAIRED);

    expect(requestDeviceData).toHaveBeenCalledWith(TOKEN);
    expect(JSON.parse(fs.readFileSync(env.DEVICE_DATA_OUTPUT_FILE, 'utf8'))).toEqual(DEVICE_DATA);
    expect(fs.statSync(env.DEVICE_DATA_OUTPUT_FILE).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(TOKEN_PATH)).toBe(existedBefore);
  });

  it('logs neither the pairing token nor the refresh token', async () => {
    await runPairing(env);
    expect(allLogText()).not.toContain(TOKEN);
    expect(allLogText()).not.toContain(DEVICE_DATA.refreshToken);
  });

  it('needs both settings', async () => {
    expect(await runPairing({ PAIRING_TOKEN_FILE: env.PAIRING_TOKEN_FILE })).toBe(EXIT_BAD_INPUT);
    expect(await runPairing({ DEVICE_DATA_OUTPUT_FILE: env.DEVICE_DATA_OUTPUT_FILE })).toBe(EXIT_BAD_INPUT);
    expect(requestDeviceData).not.toHaveBeenCalled();
  });

  it('refuses an unreadable token file without pairing', async () => {
    expect(await runPairing({ ...env, PAIRING_TOKEN_FILE: path.join(dir, 'missing') })).toBe(EXIT_BAD_INPUT);
    expect(requestDeviceData).not.toHaveBeenCalled();
  });

  it('refuses a token that is not a JWT without pairing', async () => {
    isValidPairingToken.mockReturnValue(false);
    expect(await runPairing(env)).toBe(EXIT_BAD_INPUT);
    expect(requestDeviceData).not.toHaveBeenCalled();
  });

  it('refuses to overwrite an existing output file, before spending the token', async () => {
    fs.writeFileSync(env.DEVICE_DATA_OUTPUT_FILE, 'earlier result');
    expect(await runPairing(env)).toBe(EXIT_BAD_INPUT);
    expect(requestDeviceData).not.toHaveBeenCalled();
    expect(fs.readFileSync(env.DEVICE_DATA_OUTPUT_FILE, 'utf8')).toBe('earlier result');
  });

  it('refuses an output directory that cannot be written, before spending the token', async () => {
    expect(await runPairing({ ...env, DEVICE_DATA_OUTPUT_FILE: path.join(dir, 'no-such-dir', 'out') })).toBe(
      EXIT_BAD_INPUT,
    );
    expect(requestDeviceData).not.toHaveBeenCalled();
  });

  it('reports a failed pairing with the token removed, and leaves no output file', async () => {
    requestDeviceData.mockRejectedValue(new Error(`gateway rejected ${TOKEN}`));

    expect(await runPairing(env)).toBe(EXIT_PAIRING_FAILED);

    expect(fs.existsSync(env.DEVICE_DATA_OUTPUT_FILE)).toBe(false);
    expect(allLogText()).toContain('gateway rejected [redacted]');
    expect(allLogText()).not.toContain(TOKEN);
  });
});
