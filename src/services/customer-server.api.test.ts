import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import { CUSTOMER_SERVER_AUTHORIZATION, CUSTOMER_SERVER_URL } from '../constants';
import { FBMessagePayload, MessageEnvelop, MessageStatus } from '../types';
import service, { MessagesResponse, MessagesStatusRequest, MessagesStatusResponse } from './customer-server.api';
import { messageBuilder } from './fb-server.api.test';
const c = new Chance();

describe('Customer Server API', () => {
  it('should send message to sign', async () => {
    const msgId = c.natural();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE';
    const aMessage = messageBuilder.fbMessage(messageBuilder.aMessagePayload(requestType));
    const messagesToSign = customerServerApiDriver.given.aMessageRequest(msgId, aMessage.payload);
    const expectedRes: MessageStatus[] = [
      {
        type: responseType,
        status: 'PENDING_SIGN',
        request: messagesToSign[0],
        response: {},
      },
    ];
    customerServerApiDriver.mock.messagesToSign(messagesToSign, { statuses: expectedRes });

    const res = await service.messagesToSign(messagesToSign);

    expect(res).toEqual(expectedRes);
  });
});

export const customerServerApiDriver = {
  given: {
    aMessageRequest: (msgId: number, message: FBMessagePayload): MessageEnvelop[] => {
      return [{
        message,
        transportMetadata: {
          type: 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST',
          msgId,
          requestId: c.guid(),
        }
      }];
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
