import fs from 'fs';
import { TOKEN_PATH } from '../constants';
import { GUID, RefreshToken } from '../types';
import logger from './logger';

export interface DeviceData {
  userId: GUID;
  deviceId: GUID;
  refreshToken: RefreshToken;
}

const deviceService = {
  isPaired: (): boolean => {
    return fs.existsSync(TOKEN_PATH);
  },

  saveDeviceData: (deviceData: DeviceData) => {
    try {
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(deviceData));
    } catch (e) {
      logger.error(`Error saving refresh token`, e);
    }
  },

  getDeviceData: (): DeviceData => {
    return deviceService.isPaired()
      ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
      : undefined;
  },
};

export default deviceService;
