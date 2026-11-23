import { describe, expect, it } from '@jest/globals';
import { logToFile } from './logger';

describe('logToFile', () => {
  it('keeps writing log files by default', () => {
    expect(logToFile(undefined)).toBe(true);
    expect(logToFile('')).toBe(true);
    expect(logToFile('true')).toBe(true);
  });

  it('turns log files off for false, 0, no and off in any case', () => {
    for (const value of ['false', '0', 'no', 'off', 'FALSE', ' Off ']) {
      expect(logToFile(value)).toBe(false);
    }
  });
});
