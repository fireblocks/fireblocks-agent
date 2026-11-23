import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const passwordMock = jest.fn<(...args: any[]) => Promise<string>>();
const pairDeviceMock = jest.fn<(pairingToken: string) => Promise<void>>();
const isValidPairingTokenMock = jest.fn<(pairingToken: string) => boolean>();
const loggerMock = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
const spinnerMock = { succeed: jest.fn(), fail: jest.fn() };
const isPairedMock = jest.fn<() => boolean>();
const getDeviceDataMock = jest.fn<() => object>();
const runAgentMainLoopMock = jest.fn();

jest.mock('@inquirer/password', () => ({ __esModule: true, default: passwordMock }));
jest.mock('ora', () => ({ __esModule: true, default: () => ({ start: () => spinnerMock }) }));
jest.mock('./services/logger', () => ({ __esModule: true, default: loggerMock }));
jest.mock('./services/device.service', () => ({
  __esModule: true,
  default: { isPaired: isPairedMock, getDeviceData: getDeviceDataMock },
}));
jest.mock('./services/fireblocks-agent', () => ({
  __esModule: true,
  default: {
    pairDevice: pairDeviceMock,
    isValidPairingToken: isValidPairingTokenMock,
    runAgentMainLoop: runAgentMainLoopMock,
  },
}));

// JWT-shaped, not a real credential: `isValidPairingToken` only does a `jwt.decode`.
const PROMPT_TOKEN = 'header.eyJ1c2VySWQiOiJwcm9tcHRlZCJ9.signature';

describe('fb-agent-cli pairDevice', () => {
  beforeEach(() => {
    isValidPairingTokenMock.mockReturnValue(true);
    pairDeviceMock.mockResolvedValue(undefined);
    passwordMock.mockResolvedValue(PROMPT_TOKEN);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('pairs with the token entered at the prompt', async () => {
    const { pairDevice } = require('./fb-agent-cli');

    await expect(pairDevice()).resolves.toBe(true);

    expect(passwordMock).toHaveBeenCalled();
    expect(pairDeviceMock).toHaveBeenCalledWith(PROMPT_TOKEN);
    expect(spinnerMock.succeed).toHaveBeenCalled();
  });

  it('reports a pairing failure through the spinner and logger', async () => {
    pairDeviceMock.mockRejectedValueOnce(new Error('gateway rejected the pairing token'));
    const { pairDevice } = require('./fb-agent-cli');

    await expect(pairDevice()).resolves.toBe(false);

    expect(spinnerMock.fail).toHaveBeenCalled();
    expect(spinnerMock.succeed).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('handles a rejection at the token step, where no spinner exists yet', async () => {
    // Ctrl+C rejects the prompt before ora().start() assigns `spinner`; an unguarded
    // spinner.fail() would throw a TypeError over the real error.
    passwordMock.mockRejectedValueOnce(new Error('User force closed the prompt'));
    const { pairDevice } = require('./fb-agent-cli');

    await expect(pairDevice()).resolves.toBe(false);

    expect(spinnerMock.fail).not.toHaveBeenCalled();
    expect(pairDeviceMock).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it('redacts the token from an error that echoes it back', async () => {
    // The gateway is given the token, so an error from that call can carry it.
    pairDeviceMock.mockRejectedValueOnce(new Error(`rejected token ${PROMPT_TOKEN}`));
    const { pairDevice } = require('./fb-agent-cli');

    await pairDevice();

    const logged = [...loggerMock.info.mock.calls, ...loggerMock.error.mock.calls].flat().join(' ');
    expect(logged).not.toContain(PROMPT_TOKEN);
    expect(logged).toContain('[redacted]');
    expect(spinnerMock.fail).toHaveBeenCalledWith(expect.not.stringContaining(PROMPT_TOKEN));
  });

  it('never writes the pairing token to the log', async () => {
    pairDeviceMock.mockRejectedValueOnce(new Error('gateway rejected the pairing token'));
    const { pairDevice } = require('./fb-agent-cli');

    await pairDevice();

    const logged = [...loggerMock.info.mock.calls, ...loggerMock.error.mock.calls].flat().join(' ');
    expect(logged).not.toContain(PROMPT_TOKEN);
  });
});

describe('fb-agent-cli main, unpaired with no terminal', () => {
  const ORIGINAL_IS_TTY = process.stdin.isTTY;
  let exitSpy: any;

  beforeEach(() => {
    getDeviceDataMock.mockReturnValue({ userId: 'u', deviceId: 'd' });
    // process.exit would end the worker, so it throws here and the test asserts on that.
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as never);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: ORIGINAL_IS_TTY, configurable: true });
    exitSpy.mockRestore();
    jest.clearAllMocks();
  });

  const setTty = (value: boolean | undefined) =>
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });

  it('exits rather than hanging on a prompt that can never be answered', async () => {
    isPairedMock.mockReturnValue(false);
    setTty(undefined);
    const { main } = require('./fb-agent-cli');

    await expect(main({} as any)).rejects.toThrow('process.exit:1');

    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('FB_DEVICE_DATA'));
    expect(passwordMock).not.toHaveBeenCalled();
  });

  it('does not exit when already paired', async () => {
    isPairedMock.mockReturnValue(true);
    setTty(undefined);
    const { main } = require('./fb-agent-cli');

    await main({} as any);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(runAgentMainLoopMock).toHaveBeenCalled();
  });

  it('does not exit when a terminal is available', async () => {
    // Twice: once for the TTY guard, once for the loop's first check. Then paired.
    isPairedMock.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    setTty(true);
    const { main } = require('./fb-agent-cli');

    await main({} as any);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(passwordMock).toHaveBeenCalled();
  });
});

describe('fb-agent-cli start, credentials file cannot be read', () => {
  let exitSpy: any;

  beforeEach(() => {
    isPairedMock.mockReturnValue(true);
    // Unlike the block above, exit does not throw: it is called from a .catch, so a throw there
    // would only turn into another unhandled rejection.
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    getDeviceDataMock.mockReset();
    jest.clearAllMocks();
  });

  // start() does not await main(), so let its rejection handler run before asserting.
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('exits with 1 and names the file it could not read', async () => {
    const message = "EACCES: permission denied, open '/app/data/.fireblocks-refresh-token'";
    getDeviceDataMock.mockImplementation(() => {
      throw Object.assign(new Error(message), { code: 'EACCES' });
    });
    const { start } = require('./fb-agent-cli');

    await start({} as any);
    await flush();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(runAgentMainLoopMock).not.toHaveBeenCalled();
  });

  it('logs only the type of a corrupt file error, never its content', async () => {
    getDeviceDataMock.mockImplementation(() => {
      throw new SyntaxError('Unexpected token \'s\', "secret-refresh-token" is not valid JSON');
    });
    const { start } = require('./fb-agent-cli');

    await start({} as any);
    await flush();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const logged = loggerMock.error.mock.calls.flat().join(' ');
    expect(logged).toContain('SyntaxError');
    expect(logged).not.toContain('secret-refresh-token');
  });

  it('does not exit on a normal start', async () => {
    getDeviceDataMock.mockReturnValue({ userId: 'u', deviceId: 'd' });
    const { start } = require('./fb-agent-cli');

    await start({} as any);
    await flush();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(runAgentMainLoopMock).toHaveBeenCalled();
  });
});
