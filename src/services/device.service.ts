import fs from 'fs';
import { validate as isUuid } from 'uuid';
import { FB_DEVICE_DATA, TOKEN_PATH } from '../constants';
import { GUID, RefreshToken } from '../types';
import logger from './logger';

export interface DeviceData {
  userId: GUID;
  deviceId: GUID;
  refreshToken: RefreshToken;
}

const REQUIRED_FIELDS = ['userId', 'deviceId', 'refreshToken'] as const;

// Parsed once at load. Validated up front so a malformed value falls back to the token file
// instead of surfacing later as an opaque 401 from the gateway.
const parseInjectedDeviceData = (): DeviceData | undefined => {
  if (!FB_DEVICE_DATA) {
    return undefined;
  }
  let parsed: Partial<Record<(typeof REQUIRED_FIELDS)[number], unknown>>;
  try {
    parsed = JSON.parse(FB_DEVICE_DATA);
  } catch (e) {
    // Bearer credential: report the failure, never the value.
    logger.error('FB_DEVICE_DATA is set but is not valid JSON, ignoring it');
    return undefined;
  }
  const missing = REQUIRED_FIELDS.filter(
    (field) => typeof parsed?.[field] !== 'string' || (parsed[field] as string).trim() === '',
  );
  if (missing.length > 0) {
    // Field names only, no values. The usual mistake is pasting the refresh token alone.
    logger.error(`FB_DEVICE_DATA is set but has no ${missing.join(', ')}, ignoring it`);
    return undefined;
  }
  // userId and deviceId are GUIDs, but `GUID` is only a string alias, so any non-empty value
  // would otherwise mark the agent paired and fail later as a gateway auth error instead.
  const malformed = (['userId', 'deviceId'] as const).filter((field) => !isUuid((parsed[field] as string).trim()));
  if (malformed.length > 0) {
    logger.error(`FB_DEVICE_DATA has a ${malformed.join(', ')} that is not a GUID, ignoring it`);
    return undefined;
  }
  logger.info('Using the device data from the FB_DEVICE_DATA environment variable');
  return {
    userId: parsed.userId as GUID,
    deviceId: parsed.deviceId as GUID,
    refreshToken: parsed.refreshToken as RefreshToken,
  };
};

const injectedDeviceData = parseInjectedDeviceData();

let deviceDataCache;
const deviceService = {
  isPaired: (): boolean => {
    // Injected data means paired, so main() never enters its pairing loop.
    return !!injectedDeviceData || !!deviceDataCache || fs.existsSync(TOKEN_PATH);
  },

  saveDeviceData: (deviceData: DeviceData) => {
    try {
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(deviceData));
      deviceDataCache = deviceData;
    } catch (e) {
      logger.error(`Error saving refresh token`, e);
    }
  },

  getDeviceData: (): DeviceData => {
    if (injectedDeviceData) {
      return injectedDeviceData;
    }
    if (deviceDataCache) {
      return deviceDataCache;
    }
    return deviceService.isPaired() ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) : undefined;
  },
};

export default deviceService;
