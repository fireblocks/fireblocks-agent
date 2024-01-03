import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import { CUSTOMER_SERVER_AUTHORIZATION, CUSTOMER_SERVER_URL } from '../constants';
import { GUID, Message, MessageEnvelop, MessageStatus } from '../types';
import service, { MessagesResponse, MessagesStatusRequest, MessagesStatusResponse } from './customerServer.api';
import { messageBuilder } from './server.api.test';
const c = new Chance();

describe('Customer Server API', () => {
  it('should send tx to sign', async () => {
    const msgId = c.guid();
    const aMessage = messageBuilder.aMessage();
    const messageToSign = customerServerApiDriver.given.aMessageRequest(msgId, aMessage);
    const expectedRes: MessageStatus[] = [{ msgId, requestId: aMessage.requestId, status: 'PENDING_SIGN' }];
    customerServerApiDriver.mock.messagesToSign(messageToSign, { messages: expectedRes });

    const res = await service.messagesToSign(messageToSign);

    expect(res).toEqual(expectedRes);
  });

  it('should send Authorization header from env variable', async () => {
    const msgId = c.guid();
    const aMessage = messageBuilder.aMessage();
    const messageToSign = customerServerApiDriver.given.aMessageRequest(msgId, aMessage);
    const expectedRes: MessageStatus[] = [{ msgId, requestId: aMessage.requestId, status: 'PENDING_SIGN' }];
    customerServerApiDriver.mock.messagesToSign(messageToSign, { messages: expectedRes });

    const res = await service.messagesToSign(messageToSign);

    expect(res).toEqual(expectedRes);
  });
});

export const customerServerApiDriver = {
  given: {
    aMessageRequest: (msgId: string, message: Message): MessageEnvelop[] => {
      return [{ msgId, message, type: 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP' }];
    },
    aTxStatusRequest: (msgIds: GUID[] = []): MessagesStatusRequest => {
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
