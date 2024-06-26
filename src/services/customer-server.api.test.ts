import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import { CUSTOMER_SERVER_AUTHORIZATION, CUSTOMER_SERVER_URL } from '../constants';
import { Message, MessageEnvelop, MessageStatus } from '../types';
import service, { MessagesResponse, MessagesStatusRequest, MessagesStatusResponse } from './customer-server.api';
import { messageBuilder } from './fb-server.api.test';
const c = new Chance();

describe('Customer Server API', () => {
  it('should send tx to sign', async () => {
    const msgId = c.natural();
    const aMessage = messageBuilder.aMessage();
    const messagesToSign = customerServerApiDriver.given.aMessageRequest(msgId, aMessage);
    const expectedRes: MessageStatus[] = [
      {
        msgId,
        requestId: aMessage.requestId,
        status: 'PENDING_SIGN',
        payload: messagesToSign[0].payload,
        type: messagesToSign[0].type,
      },
    ];
    customerServerApiDriver.mock.messagesToSign(messagesToSign, { statuses: expectedRes });

    const res = await service.messagesToSign(messagesToSign);

    expect(res).toEqual(expectedRes);
  });
});

export const customerServerApiDriver = {
  given: {
    aMessageRequest: (msgId: number, message: Message): MessageEnvelop[] => {
      return [{ msgId, requestId: message.requestId, message, type: 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', payload: JSON.stringify(message) }];
    },
    aTxStatusRequest: (msgIds: number[] = []): MessagesStatusRequest => {
      return {
        msgIds,
      };
    },
  },
  mock: {
    messagesToSign: (messages: MessageEnvelop[], result?: MessagesResponse) => {
      const axiosMock = new MockAdapter(axios);
      axiosMock
        .onPost(
          `${CUSTOMER_SERVER_URL}/messagesToSign`,
          { messages },
          {
            Authorization: CUSTOMER_SERVER_AUTHORIZATION as string,
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
        )
        .reply(200, result);
    },
    messagesStatus: (txStatusReq: MessagesStatusRequest, result?: MessagesStatusResponse) => {
      const axiosMock = new MockAdapter(axios);
      axiosMock
        .onPost(`${CUSTOMER_SERVER_URL}/messagesStatus`, txStatusReq, {
          Authorization: CUSTOMER_SERVER_AUTHORIZATION as string,
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
        })
        .reply(200, result);
    },
  },
};
