import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import Chance from 'chance';
import fs from 'fs';
import { LEGACY_TOKEN_PATH, TOKEN_PATH } from '../constants';
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

describe('device service credentials file location', () => {
  // A fresh module per case: the service caches the device data it saved.
  const freshService = (): typeof service => {
    let fresh: typeof service;
    jest.isolateModules(() => {
      fresh = require('./device.service').default;
    });
    return fresh;
  };

  const removeFiles = () => {
    for (const file of [TOKEN_PATH, LEGACY_TOKEN_PATH]) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  };

  setupTokenBeforeAndAfter();
  beforeEach(removeFiles);
  afterEach(removeFiles);

  it('reads the credentials from the file next to the code when the configured file is missing', () => {
    const deviceData = deviceDriver.given.deviceData();
    fs.writeFileSync(LEGACY_TOKEN_PATH, JSON.stringify(deviceData));
    const fresh = freshService();

    expect(fresh.isPaired()).toBe(true);
    expect(fresh.getDeviceData()).toStrictEqual(deviceData);
  });

  it('prefers the configured file over the file next to the code', () => {
    const current = deviceDriver.given.deviceData();
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(current));
    fs.writeFileSync(LEGACY_TOKEN_PATH, JSON.stringify(deviceDriver.given.deviceData()));

    expect(freshService().getDeviceData()).toStrictEqual(current);
  });

  it('writes new credentials to the configured file only', () => {
    const deviceData = deviceDriver.given.deviceData();
    freshService().saveDeviceData(deviceData);

    expect(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))).toStrictEqual(deviceData);
    expect(fs.existsSync(LEGACY_TOKEN_PATH)).toBe(false);
  });

  it('is not paired when neither file exists', () => {
    const fresh = freshService();
    expect(fresh.isPaired()).toBe(false);
    expect(fresh.getDeviceData()).toBeUndefined();
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
