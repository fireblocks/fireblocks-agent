import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import Chance from 'chance';
import fs from 'fs';
import { TOKEN_PATH } from '../constants';
import service, { DeviceData } from './device.service';
const c = new Chance();

export function setupTokenBeforeAndAfter() {
  beforeEach(() => {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.copyFileSync(TOKEN_PATH, `${TOKEN_PATH}.bak`);
      fs.unlinkSync(TOKEN_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(`${TOKEN_PATH}.bak`)) {
      fs.copyFileSync(`${TOKEN_PATH}.bak`, TOKEN_PATH);
      fs.unlinkSync(`${TOKEN_PATH}.bak`);
    }
  });
}

describe('device service', () => {
  setupTokenBeforeAndAfter();

}

describe('device service', () => {
  setupTokenBeforeAndAfter();

  it('should return false in case refresh token is missing', () => {
    const res = service.isPaired();
    expect(res).toBe(false);
  });

  it('should return true in case of existing data', () => {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(deviceDriver.given.deviceData()));
    const res = service.isPaired();
    expect(res).toBe(true);
  });

  it('should save device data', () => {
    let token = service.getDeviceData();
    expect(token).not.toBeDefined();

    const deviceData = deviceDriver.given.deviceData();
    service.saveDeviceData(deviceData);

    const fetchedData = service.getDeviceData();
    expect(fetchedData).toStrictEqual(deviceData);
  });

  it('should save device data in cache', () => {
    const deviceData = deviceDriver.given.deviceData();
    service.saveDeviceData(deviceData);
    jest.spyOn(fs, 'readFileSync');

    service.getDeviceData();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });
});

export const deviceDriver = {
  given: {
    deviceData: (): DeviceData => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        refreshToken: c.string(),
      };
    },
  },
};
