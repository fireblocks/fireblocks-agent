import axios from 'axios';
import fs from 'fs';
import https from 'https';
import { components, paths } from '../../api/customer-server';
import { CUSTOMER_SERVER_AUTHORIZATION, CUSTOMER_SERVER_URL } from '../constants';
import logger from './logger';
const customerServerApi = {
  messagesToSign: async (messages: MessageEnvelope[], httpsAgent: https.Agent): Promise<MessageStatus[]> => {
    fs.writeFileSync(`messages_to_sign.json`, JSON.stringify({ messages })); //TODO: delete
    try {
      const res = await axios.post(
        `${CUSTOMER_SERVER_URL}/messagesToSign`,
        { messages },
        {
          headers: { Authorization: CUSTOMER_SERVER_AUTHORIZATION },
          httpsAgent,
        },
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
      const res = await axios.post(`${CUSTOMER_SERVER_URL}/messagesStatus`, pendingMessages, {
        headers: { Authorization: CUSTOMER_SERVER_AUTHORIZATION },
        httpsAgent,
      });
      return res.data;
    } catch (e) {
      logger.info(`messagesStatus: Failed - e=${e}`);
      logger.error(`Error on customer server api request /messagesStatus`);
      throw e;
    }
  },
};

export type MessagesRequest = paths['/messagesToSign']['post']['requestBody']['content']['application/json'];
export type MessagesResponse = paths['/messagesToSign']['post']['responses'][200]['content']['application/json'];

export type MessagesStatusRequest = paths['/messagesStatus']['post']['requestBody']['content']['application/json'];
export type MessagesStatusResponse = paths['/messagesStatus']['post']['responses'][200]['content']['application/json'];

export type MessageStatus = components['schemas']['MessageStatus'];
type MessageEnvelope = components['schemas']['MessageEnvelope'];

export default customerServerApi;
