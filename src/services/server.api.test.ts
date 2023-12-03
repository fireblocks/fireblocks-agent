import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import { MOBILE_GATEWAY_URL } from '../constants';
import {
  AccessToken,
  AccessTokenReuest,
  GUID,
  Message,
  PairDeviceRequest,
} from '../types';
import serverApi from './server.api';

const c = new Chance();
describe('Server API', () => {
  it('should pair device', async () => {
    const pairDeviceReq = serverApiDriver.given.pairDeviceRequst();
    const refreshToken = `some-valid-refresh-token`;
    serverApiDriver.mock.pairDevice(pairDeviceReq, refreshToken);

    const pairDeviceRes = await serverApi.pairDevice(pairDeviceReq);

    expect(pairDeviceRes.refreshToken).toBe(refreshToken);
  });

  it('should get access token', async () => {
    const accessTokenReq = serverApiDriver.given.accessTokenRequst();
    const accessToken = 'my-access-token';
    serverApiDriver.mock.accessToken(accessTokenReq, accessToken);

    const accessTokenRes = await serverApi.getAccessToken(accessTokenReq);

    expect(accessTokenRes).toBe(accessToken);
  });

  it('should pull messages', async () => {
    const accessToken = serverApiDriver.given.accessToken();
    const someMessage = messageBuilder.aMessage();
    serverApiDriver.mock.messages(accessToken, someMessage);

    const message = await serverApi.getMessages(accessToken);

    expect(message).toStrictEqual(someMessage);
  });

  it('shuold ack message', async () => {
    const accessToken = serverApiDriver.given.accessToken();
    const aMessage = messageBuilder.aMessage({ msgId: c.guid() });
    serverApiDriver.mock.ackMessage(accessToken, aMessage.msgId, 'ok');

    const res = await serverApi.ackMessage(accessToken, aMessage.msgId);

    expect(res).toEqual('ok');
  });
});

export const messageBuilder = {
  aMessage: (message?: Partial<Message>): Message => {
    return {
      msg: c.string(),
      msgId: c.guid(),
      deviceId: c.guid(),
      internalMessageId: c.guid(),
      ...message,
    };
  },
};

export const serverApiDriver = {
  given: {
    pairDeviceRequst: (): PairDeviceRequest => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        pairingToken: 'some-valid-jwt',
      };
    },
    accessToken: (): AccessToken => c.string(),
    accessTokenRequst: (): AccessTokenReuest => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        refreshToken: 'some-valid-refresh-token',
      };
    },
  },
  mock: {
    pairDevice: (
      pairDeviceReq?: Partial<PairDeviceRequest>,
      resultRefreshToken: string = c.string(),
    ) => {
      const generatedReq = serverApiDriver.given.pairDeviceRequst();
      const pairRequest = {
        ...generatedReq,
        ...pairDeviceReq,
      };
      const axiosMock = new MockAdapter(axios);
      axiosMock
        .onPost(`${MOBILE_GATEWAY_URL}/pair_device`, pairRequest)
        .reply(200, { refreshToken: resultRefreshToken });
    },
    messages: (accessToken: AccessToken, message: Message) => {
      const axiosMock = new MockAdapter(axios);
      axiosMock
        .onGet(`${MOBILE_GATEWAY_URL}/msg`, {
          headers: { 'x-access-token': accessToken },
        })
        .reply(200, message);
    },
    ackMessage: (accessToken: AccessToken, msgId: GUID, response: string) => {
      const axiosMock = new MockAdapter(axios);
      axiosMock
        .onPut(`${MOBILE_GATEWAY_URL}/msg`, { msgId })
        .reply(200, response);
    },
    accessToken: (
      accessTokenReq?: Partial<AccessTokenReuest>,
      resultAccessToken: string = c.string(),
    ) => {
      const generatedReq = serverApiDriver.given.accessTokenRequst();
      const accessTokenRequest: AccessTokenReuest = {
        ...generatedReq,
        ...accessTokenReq,
      };
      const axiosMock = new MockAdapter(axios);
      axiosMock
        .onPost(`${MOBILE_GATEWAY_URL}/access_token`, accessTokenRequest)
        .reply(200, { accessToken: resultAccessToken });
    },
  },
};
