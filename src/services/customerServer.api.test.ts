import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import {
  CUSTOMER_SERVER_AUTHORIZATION,
  CUSTOMER_SERVER_URL,
} from '../constants';
import { GUID, Message } from '../types';
import service, { TxRequest } from './customerServer.api';
import { messageBuilder } from './server.api.test';
const c = new Chance();

describe('Customer Server API', () => {
  it('should send tx to sign', async () => {
    const aMessage = messageBuilder.aMessage();
    const txToSign = customerServerApiDriver.given.aTxRequest(aMessage);
    customerServerApiDriver.mock.txToSign(txToSign, { txId: txToSign.txId });

    const res = await service.txToSign(txToSign);

    expect(res).toEqual({ txId: txToSign.txId });
  });

  it('should send Authorization header from env variable', async () => {
    const aMessage = messageBuilder.aMessage();
    const txToSign = customerServerApiDriver.given.aTxRequest(aMessage);
    customerServerApiDriver.mock.txToSign(txToSign, { txId: txToSign.txId });

    const res = await service.txToSign(txToSign);

    expect(res).toEqual({ txId: txToSign.txId });
  });
});

export const customerServerApiDriver = {
  given: {
    aTxRequest: ({ txId, keyId, algorithm, payload }: Message): TxRequest => {
      return {
        txId,
        keyId,
        algorithm,
        payload,
      };
    },
  },
  mock: {
    txToSign: (txRequest: TxRequest, result?: { txId: GUID }) => {
      const axiosMock = new MockAdapter(axios);
      axiosMock
        .onPost(`${CUSTOMER_SERVER_URL}/txToSign`, txRequest, {
          Authorization: CUSTOMER_SERVER_AUTHORIZATION as string,
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
        })
        .reply(200, result);
    },
  },
};
