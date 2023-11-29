import { describe, expect, it } from '@jest/globals';
import Chance from 'chance';
import jwt from 'jsonwebtoken';
import { GUID, JWT } from '../types';
import deviceService from './device.service';
import agent from './hsm-agent';
import { serverApiDriver } from './server.api.test';
const chance = new Chance();

describe('HSM Agent', () => {
  it('should pair device and save token', async () => {
    const userId = chance.guid();
    const pairingToken = hsmAgentDriver.given.jwtToken({ userId });
    const deviceId = chance.guid();

    serverApiDriver.givenPairDevice({ userId, pairingToken, deviceId });
    await agent.pairDevice(pairingToken, deviceId);

    expect(deviceService.isPaired()).toBe(true);
  });
});

interface TokenData {
  userId: GUID;
  tenantId: GUID;
  tenantName: string;
  type: string;
}

const hsmAgentDriver = {
  given: {
    jwtToken: (tokenData?: Partial<TokenData>): JWT => {
      const token: TokenData = {
        userId: chance.guid(),
        tenantId: chance.guid(),
        tenantName: chance.name(),
        type: 'devicePairing',
        ...tokenData,
      };
      const jwtToken = jwt.sign(token, 'shhhhh');
      return jwtToken;
    },
  },
};
