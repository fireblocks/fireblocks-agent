import axios from 'axios';
import https from 'https';
import { components, paths } from '../../api/customer-server';
import {
  CUSTOMER_SERVER_AUTHORIZATION,
  CUSTOMER_SERVER_SIGN_TIMEOUT_MS,
  CUSTOMER_SERVER_TIMEOUT_MS,
  CUSTOMER_SERVER_URL,
} from '../constants';
import logger from './logger';
const customerServerApi = {
  messagesToSign: async (messages: MessageEnvelope[], httpsAgent: https.Agent): Promise<MessageStatus[]> => {
    try {
      const res = await axios.post(
        `${CUSTOMER_SERVER_URL}/messagesToSign`,
        { messages },
        // Signing is the customer's HSM, not a lookup, so it gets the larger of the two budgets.
        buildRequestConfig(httpsAgent, CUSTOMER_SERVER_SIGN_TIMEOUT_MS),
      );
      return res.data.statuses;
    } catch (e) {
      logger.error(`Error on customer server api request /messagesToSign`);
      throw e;
    }
  },

  messagesStatus: async (
    pendingMessages: MessagesStatusRequest,
    httpsAgent: https.Agent,
  ): Promise<MessagesStatusResponse> => {
    try {
      const res = await axios.post(
        `${CUSTOMER_SERVER_URL}/messagesStatus`,
        pendingMessages,
        buildRequestConfig(httpsAgent),
      );
      return res.data;
    } catch (e) {
      logger.info(`messagesStatus: Failed - e=${e}`);
      logger.error(`Error on customer server api request /messagesStatus`);
      throw e;
    }
  },
};

// Every customer-server call goes through here, so the deadline defaults ON: a new endpoint added
// later is bounded unless it deliberately opts out. Mirrors buildHeaders() in fb-server.api.ts.
function buildRequestConfig(httpsAgent: https.Agent, timeout: number = CUSTOMER_SERVER_TIMEOUT_MS) {
  return {
    headers: { Authorization: CUSTOMER_SERVER_AUTHORIZATION },
    httpsAgent,
    timeout,
  };
}

export type MessagesRequest = paths['/messagesToSign']['post']['requestBody']['content']['application/json'];
export type MessagesResponse = paths['/messagesToSign']['post']['responses'][200]['content']['application/json'];

export type MessagesStatusRequest = paths['/messagesStatus']['post']['requestBody']['content']['application/json'];
export type MessagesStatusResponse = paths['/messagesStatus']['post']['responses'][200]['content']['application/json'];

export type MessageStatus = components['schemas']['MessageStatus'];
type MessageEnvelope = components['schemas']['MessageEnvelope'];

export default customerServerApi;
