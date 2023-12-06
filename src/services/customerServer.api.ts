import axios from 'axios';
import { paths } from '../../api/customer-server';
import {
  CUSTOMER_SERVER_AUTHORIZATION,
  CUSTOMER_SERVER_URL,
} from '../constants';
import logger from './logger';

const customerServerApi = {
  txToSign: async (tx: TxRequest) => {
    try {
      const res = await axios.post(`${CUSTOMER_SERVER_URL}/txToSign`, tx, {
        headers: { Authorization: CUSTOMER_SERVER_AUTHORIZATION },
      });
      return res.data;
    } catch (e) {
      logger.error(`Error on customer server api {txToSign} request`, e);
      throw e;
    }
  },

  txStatus: async (txStatus: TxStatusRequest) => {
    try {
      const res = await axios.post(
        `${CUSTOMER_SERVER_URL}/txStatus`,
        txStatus,
        {
          headers: { Authorization: CUSTOMER_SERVER_AUTHORIZATION },
        },
      );
      return res.data;
    } catch (e) {
      logger.error(`Error on customer server api {txStatus} request`, e);
      throw e;
    }
  },
};

export type TxResponse =
  paths['/txToSign']['post']['responses'][200]['content']['application/json'];
export type TxRequest =
  paths['/txToSign']['post']['requestBody']['content']['application/json'];

export type TxStatusResponse =
  paths['/txStatus']['post']['responses'][200]['content']['application/json'];
export type TxStatusRequest =
  paths['/txStatus']['post']['requestBody']['content']['application/json'];

export default customerServerApi;
