import axios from 'axios';
import {
  AccessToken,
  AccessTokenReuest,
  FBMessageEnvlope,
  GUID,
  PairDeviceRequest,
  PairDeviceResponse,
} from 'types';
import { MOBILE_GATEWAY_URL } from '../constants';
import deviceService from './device.service';
import logger from './logger';

const serverApi = {
  pairDevice: async (pairDevice: PairDeviceRequest): Promise<PairDeviceResponse> => {
    try {
      const res = await axios.post(`${MOBILE_GATEWAY_URL}/pair_device`, pairDevice);
      return res.data;
    } catch (e) {
      logger.error(`Error on pairDevice request`, e);
      throw e;
    }
  },

  getAccessToken: async (accessTokenReq: AccessTokenReuest): Promise<AccessToken> => {
    try {
      const res = await axios.post(`${MOBILE_GATEWAY_URL}/access_token`, accessTokenReq);
      return res.data.accessToken;
    } catch (e) {
      logger.error(`Error on getAccessToken request`, e);
      throw e;
    }
  },

  getMessages: async (): Promise<FBMessageEnvlope> => {
    try {
      const accessToken = await serverApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.get(`${MOBILE_GATEWAY_URL}/msg`, buildHeaders(accessToken));
      return res.data;
    } catch (e) {
      logger.error(`Error on getMessages request`, e);
      throw e;
    }
  },

  ackMessage: async (msgId: GUID) => {
    try {
      const accessToken = await serverApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.put(
        `${MOBILE_GATEWAY_URL}/msg`,
        { msgId },
        buildHeaders(accessToken),
      );
      return res.data;
    } catch (e) {
      logger.error(`Error on ackMessage request`, e);
      throw e;
    }
  },
};

function buildHeaders(accessToken: AccessToken) {
  const headers = {
    'x-access-token': accessToken,
  };
  return { headers };
}

export default serverApi;
