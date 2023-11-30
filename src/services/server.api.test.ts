import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import { MOBILE_GATEWAY_URL } from '../constants';
import {
  AccessToken,
  AccessTokenReuest,
  Message,
  PairDeviceRequest,
} from '../types';
import serverApi from './server.api';

const chance = new Chance();
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
    const someMessage = serverApiDriver.given.aMessage();
    serverApiDriver.mock.messages(accessToken, someMessage);

    const message = await serverApi.getMessages(accessToken);

    expect(message).toStrictEqual(someMessage);
  });
});

export const serverApiDriver = {
  given: {
    pairDeviceRequst: (): PairDeviceRequest => {
      return {
        userId: chance.guid(),
        deviceId: chance.guid(),
        pairingToken: 'some-valid-jwt',
      };
    },
    aMessage: (): Message => {
      return {
        msg: { someMessageProp: 'propValue' },
        msgId: chance.guid(),
        deviceId: chance.guid(),
        internalMessageId: chance.guid(),
      };
    },
    accessToken: (): AccessToken => chance.string(),
    accessTokenRequst: (): AccessTokenReuest => {
      return {
        userId: chance.guid(),
        deviceId: chance.guid(),
        refreshToken: 'some-valid-refresh-token',
      };
    },
  },
  mock: {
    pairDevice: (
      pairDeviceReq?: Partial<PairDeviceRequest>,
      resultRefreshToken: string = chance.string(),
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
    accessToken: (
      accessTokenReq?: Partial<AccessTokenReuest>,
      resultAccessToken: string = chance.string(),
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
