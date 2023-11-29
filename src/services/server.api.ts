import axios from 'axios';
import { AccessTokenReuest, PairDeviceRequest } from 'types';
import { MOBILE_GATEWAY_URL } from '../constants';
import logger from './logger';

export default {
  pairDevice: async (pairDevice: PairDeviceRequest) => {
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
  getAccessToken: async (accessTokenReq: AccessTokenReuest) => {
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
};
