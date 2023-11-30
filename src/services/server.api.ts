import axios from 'axios';
import {
  AccessToken,
  AccessTokenReuest,
  Message as MessageResponse,
  PairDeviceRequest,
  PairDeviceResponse,
} from 'types';
import { MOBILE_GATEWAY_URL } from '../constants';
import logger from './logger';

const serverApi = {
  pairDevice: async (
    pairDevice: PairDeviceRequest,
  ): Promise<PairDeviceResponse> => {
    try {
      const res = await axios.post(
        `${MOBILE_GATEWAY_URL}/pair_device`,
        pairDevice,
      );
      return res.data;
    } catch (e) {
      logger.error(`Error on pairDevice request`, e);
      throw e;
    }
  },

  getAccessToken: async (
    accessTokenReq: AccessTokenReuest,
  ): Promise<AccessToken> => {
    try {
      const res = await axios.post(
        `${MOBILE_GATEWAY_URL}/access_token`,
        accessTokenReq,
      );
      return res.data.accessToken;
    } catch (e) {
      logger.error(`Error on getAccessToken request`, e);
      throw e;
    }
  },

  getMessages: async (accessToken: AccessToken): Promise<MessageResponse> => {
    try {
      const res = await axios.get(`${MOBILE_GATEWAY_URL}/msg`, {
        headers: { 'x-access-token': accessToken },
      });
      return res.data;
    } catch (e) {
      logger.error(`Error on getMessages request`, e);
      throw e;
    }
  },
};

export default serverApi;
