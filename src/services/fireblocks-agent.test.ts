import { describe, expect, it } from '@jest/globals';
import Chance from 'chance';
import jwt from 'jsonwebtoken';
import { GUID, JWT } from '../types';
import deviceService from './device.service';
import fbServerApi from './fb-server.api';
import { fbServerApiDriver, messageBuilder } from './fb-server.api.test';
import agent from './fireblocks-agent';
import messagesService from './messages.service';
const c = new Chance();

describe('HSM Agent', () => {
  it('should pair device and save token', async () => {
    const userId = c.guid();
    const pairingToken = hsmAgentDriver.given.jwtToken({ userId });
    const deviceId = c.guid();

    fbServerApiDriver.mock.pairDevice({ userId, pairingToken, deviceId });
    await agent.pairDevice(pairingToken, deviceId);

    expect(deviceService.isPaired()).toBe(true);
  });

  it('should fetch and handle messages', async () => {
    jest.useFakeTimers();
    const someMessages = [messageBuilder.fbMsgEnvelope()];
    jest.spyOn(fbServerApi, 'getMessages').mockImplementation(jest.fn(() => Promise.resolve(someMessages)));
    jest.spyOn(messagesService, 'handleMessages').mockImplementation(jest.fn(() => Promise.resolve()));

    await agent._runLoopStep();

    expect(fbServerApi.getMessages).toHaveBeenCalledTimes(1);
    expect(messagesService.handleMessages).toHaveBeenCalledTimes(1);
  });

  it('should validate a valid pairing token', () => {
    const aValidPairingToken = jwt.sign({ userId: c.guid() }, 'PairingToken');
    expect(agent.isValidPairingToken(aValidPairingToken)).toBe(true);

    const nonValidToken = 'InvalidPairingToken';
    expect(agent.isValidPairingToken(nonValidToken)).toBe(false);
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
        userId: c.guid(),
        tenantId: c.guid(),
        tenantName: c.name(),
        type: 'devicePairing',
        ...tokenData,
      };
      const jwtToken = jwt.sign(token, 'HsmAgentJWTToken');
      return jwtToken;
    },
  },
};
