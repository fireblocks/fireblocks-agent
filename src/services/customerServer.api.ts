import axios from 'axios';
import fs from 'fs';
import { components, paths } from '../../api/customer-server';
import { CUSTOMER_SERVER_AUTHORIZATION, CUSTOMER_SERVER_URL } from '../constants';
import logger from './logger';
const customerServerApi = {
  messagesToSign: async (messages: MessageEnvlope[]): Promise<MessageStatus[]> => {
    fs.writeFileSync(`messages_to_sign.json`, JSON.stringify(messages));
    try {
      const res = await axios.post(
        `${CUSTOMER_SERVER_URL}/messagesToSign`,
        { messages },
        {
          headers: { Authorization: CUSTOMER_SERVER_AUTHORIZATION },
        },
      );
      return res.data.messages;
    } catch (e) {
      logger.error(`Error on customer server api {txToSign} request`, e);
      throw e;
    }
  },

  messagesStatus: async (txStatus: MessagesStatusRequest): Promise<MessagesStatusResponse> => {
    try {
      const res = await axios.post(`${CUSTOMER_SERVER_URL}/messagesStatus`, txStatus, {
        headers: { Authorization: CUSTOMER_SERVER_AUTHORIZATION },
      });
      return res.data;
    } catch (e) {
      logger.error(`Error on customer server api {messagesStatus} request`, e);
      throw e;
    }
  },
};

export type MessagesRequest = paths['/messagesToSign']['post']['requestBody']['content']['application/json'];
export type MessagesResponse = paths['/messagesToSign']['post']['responses'][200]['content']['application/json'];

export type MessagesStatusRequest = paths['/messagesStatus']['post']['requestBody']['content']['application/json'];
export type MessagesStatusResponse = paths['/messagesStatus']['post']['responses'][200]['content']['application/json'];

export type MessageStatus = components['schemas']['MessageStatus'];
type MessageEnvlope = components['schemas']['MessageEnvelope'];

export default customerServerApi;
