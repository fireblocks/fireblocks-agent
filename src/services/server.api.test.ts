import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import { MOBILE_GATEWAY_URL } from '../constants';
import { PairDeviceRequest } from '../types';
import serverApi from './server.api';

const chance = new Chance();
describe('Server API', () => {
  it('should pair device', async () => {
    const pairDeviceReq = {
      userId: chance.guid(),
      deviceId: chance.guid(),
      pairingToken: 'some-valid-jw',
    };

    const refreshToken = `some-valid-refresh-token`;

    serverApiDriver.givenPairDevice(pairDeviceReq, refreshToken);

    const pairDeviceRes = await serverApi.pairDevice(pairDeviceReq);

    expect(pairDeviceRes.refreshToken).toBe(refreshToken);
  });
});

export const serverApiDriver = {
  givenPairDevice: (
    pairDeviceReq?: Partial<PairDeviceRequest>,
    resultRefreshToken: string = chance.string(),
  ) => {
    const pairRequest: PairDeviceRequest = {
      userId: chance.guid(),
      deviceId: chance.guid(),
      pairingToken: chance.string(),
      ...pairDeviceReq,
    };
    const axiosMock = new MockAdapter(axios);
    axiosMock
      .onPost(`${MOBILE_GATEWAY_URL}/pair_device`, pairRequest)
      .reply(200, { refreshToken: resultRefreshToken });
  },
};
