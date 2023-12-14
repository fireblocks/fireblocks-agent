import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import { CUSTOMER_SERVER_AUTHORIZATION, CUSTOMER_SERVER_URL } from '../constants';
import { GUID, Message, MessageEnvelop, MessageStatus } from '../types';
import service, {
  MessagesResponse,
  MessagesStatusRequest,
  MessagesStatusResponse,
} from './customerServer.api';
import { messageBuilder } from './server.api.test';
const c = new Chance();

describe('Customer Server API', () => {
  it('should send tx to sign', async () => {
    const aMessage = messageBuilder.aMessage();
    const messageToSign = customerServerApiDriver.given.aMessageRequest(aMessage);
    const expectedRes: MessageStatus[] = [
      { msgId: aMessage.msgId, txId: aMessage.txId, status: 'PENDING_SIGN' },
    ];
    customerServerApiDriver.mock.messagesToSign(messageToSign, { messages: expectedRes });

    const res = await service.messagesToSign(messageToSign);

    expect(res).toEqual(expectedRes);
  });

  it('should send Authorization header from env variable', async () => {
    const aMessage = messageBuilder.aMessage();
    const messageToSign = customerServerApiDriver.given.aMessageRequest(aMessage);
    const expectedRes: MessageStatus[] = [
      { msgId: aMessage.msgId, txId: aMessage.txId, status: 'PENDING_SIGN' },
    ];
    customerServerApiDriver.mock.messagesToSign(messageToSign, { messages: expectedRes });

    const res = await service.messagesToSign(messageToSign);

    expect(res).toEqual(expectedRes);
  });
});

export const customerServerApiDriver = {
  given: {
    aMessageRequest: ({ msgId, txId, keyId, algorithm, payload }: Message): MessageEnvelop[] => {
      const message = {
        txId,
        keyId,
        algorithm,
        payload,
      };
      return [{ msgId, message }];
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
