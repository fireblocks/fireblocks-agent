import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Heartbeat, HEARTBEAT_MIN_INTERVAL_MS } from './heartbeat';
import logger from './logger';

describe('Heartbeat', () => {
  let dir: string;
  let file: string;
  let nowMs: number;
  const clock = () => nowMs;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fireblocks-agent-heartbeat-'));
    file = path.join(dir, 'heartbeat');
    nowMs = 1_800_000_000_000;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('writes nothing when no file is set', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync');
    new Heartbeat(undefined, clock).beat();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes the time in whole seconds since the epoch, and leaves no staging file', () => {
    nowMs = 1_800_000_000_999;
    new Heartbeat(file, clock).beat();
    expect(fs.readFileSync(file, 'utf8')).toBe('1800000000\n');
    expect(fs.readdirSync(dir)).toEqual(['heartbeat']);
  });

  it('writes at most once per interval', () => {
    const heartbeat = new Heartbeat(file, clock);
    heartbeat.beat();
    nowMs += HEARTBEAT_MIN_INTERVAL_MS - 1;
    heartbeat.beat();
    expect(fs.readFileSync(file, 'utf8')).toBe('1800000000\n');

    nowMs += 1;
    heartbeat.beat();
    expect(fs.readFileSync(file, 'utf8')).toBe('1800000005\n');
  });

  it('never throws when the file cannot be written, warns once, and recovers', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const missing = path.join(dir, 'no-such-directory', 'heartbeat');
    const heartbeat = new Heartbeat(missing, clock);

    expect(() => heartbeat.beat()).not.toThrow();
    nowMs += HEARTBEAT_MIN_INTERVAL_MS;
    heartbeat.beat();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('ENOENT');

    fs.mkdirSync(path.dirname(missing));
    heartbeat.beat();
    expect(fs.readFileSync(missing, 'utf8')).toBe('1800000005\n');
  });

  it('retries a failed write on the next beat, without waiting for the interval', () => {
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const heartbeat = new Heartbeat(file, clock);
    const write = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    });
    heartbeat.beat();
    heartbeat.beat();
    expect(write).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(file, 'utf8')).toBe('1800000000\n');
  });
});
