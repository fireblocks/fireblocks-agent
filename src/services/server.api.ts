import axios from 'axios';
import { MOBILE_GATEWAY_URL } from '../constants';
import * as logger from './logger';
import { PairDeviceRequest } from 'types';

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
};
