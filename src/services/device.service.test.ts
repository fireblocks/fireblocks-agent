import { beforeEach, describe, expect, it } from '@jest/globals';
import Chance from 'chance';
import fs from 'fs';
import { TOKEN_PATH } from '../constants';
import service, { DeviceData } from './device.service';

const chance = new Chance();
describe('device service', () => {
  beforeEach(() => {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  });

  it('should return false in case refresh token is missing', () => {
    const res = service.isPaired();
    expect(res).toBe(false);
  });

  it('should return true in case of existing data', () => {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(driver.given.deviceData()));
    const res = service.isPaired();
    expect(res).toBe(true);
  });

  it('should save device data', () => {
    let token = service.getDeviceData();
    expect(token).not.toBeDefined();

    const deviceData = driver.given.deviceData();
    service.saveDeviceData(deviceData);

    const fetchedData = service.getDeviceData();
    expect(fetchedData).toStrictEqual(deviceData);
  });
});

const driver = {
  given: {
    deviceData: (): DeviceData => {
      return {
        userId: chance.guid(),
        deviceId: chance.guid(),
        refreshToken: chance.string(),
      };
    },
  },
};
