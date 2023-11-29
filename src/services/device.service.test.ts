import { beforeEach, describe, expect, it } from '@jest/globals';
import Chance from 'chance';
import fs from 'fs';
import { TOKEN_PATH } from '../constants';
import service from './device.service';

describe('device service', () => {
  const chance = new Chance();

  beforeEach(() => {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  });

  it('should return false in case refresh token is missing', () => {
    const res = service.isPaired();
    expect(res).toBe(false);
  });

  it('should return true in case refresh token is missing', () => {
    fs.writeFileSync(TOKEN_PATH, 'test');
    const res = service.isPaired();
    expect(res).toBe(true);
  });

  it('should save rehresh token', () => {
    let token = service.getRefreshToken();
    expect(token).not.toBeDefined();

    service.saveRefreshToken('my-token');

    token = service.getRefreshToken();
    expect(token).toBe('my-token');
  });
});
