import { describe, expect, it, jest } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import https from 'https';
import { CUSTOMER_SERVER_AUTHORIZATION, CUSTOMER_SERVER_URL } from '../constants';
import { FBMessagePayload, MessageEnvelop, MessageStatus } from '../types';
import service, { MessagesResponse, MessagesStatusRequest, MessagesStatusResponse } from './customer-server.api';
import { messageBuilder } from './fb-server.api.test';
const c = new Chance();
const httpsAgent = new https.Agent();

describe('Customer Server API', () => {
  it('should send message to sign', async () => {
    const requestId = c.guid();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE';
    const aMessage = messageBuilder.fbMessage(messageBuilder.aMessagePayload(requestType));
    const messagesToSign = customerServerApiDriver.given.aMessageRequest(requestId, aMessage.payload);
    const expectedRes: MessageStatus[] = [
      {
        type: responseType,
        status: 'PENDING_SIGN',
        requestId,
        response: {},
      },
    ];
    customerServerApiDriver.mock.messagesToSign(messagesToSign, { statuses: expectedRes });

    const res = await service.messagesToSign(messagesToSign, httpsAgent);

    expect(res).toEqual(expectedRes);
  });

  it('never sends Customer Server calls through HTTPS_PROXY or HTTP_PROXY', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { statuses: [] } });
    try {
      await service.messagesToSign([], httpsAgent);
      await service.messagesStatus({ requestsIds: [] }, httpsAgent);
      for (const call of post.mock.calls) {
        expect(call[2]).toMatchObject({ proxy: false, httpsAgent });
      }
      expect(post).toHaveBeenCalledTimes(2);
    } finally {
      post.mockRestore();
    }
  });
});

export const customerServerApiDriver = {
  given: {
    aMessageRequest: (requestId: string, message: FBMessagePayload): MessageEnvelop[] => {
      return [
        {
          message,
          transportMetadata: {
            type: 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST',
            requestId,
          },
        },
      ];
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
