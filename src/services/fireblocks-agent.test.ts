import { afterEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import jwt from 'jsonwebtoken';
import { GUID, JWT } from '../types';
import deviceService from './device.service';
import { setupTokenBeforeAndAfter } from './device.service.test';
import fbServerApi from './fb-server.api';
import { fbServerApiDriver, messageBuilder } from './fb-server.api.test';
import agent from './fireblocks-agent';
import messagesService from './messages.service';
import https from 'https';
const c = new Chance();

describe('HSM Agent', () => {
  setupTokenBeforeAndAfter();

  it('should pair device and save token', async () => {
    const userId = c.guid();
    const pairingToken = hsmAgentDriver.given.jwtToken({ userId });
    const deviceId = c.guid();

    fbServerApiDriver.mock.pairDevice({ userId, pairingToken }, undefined, deviceId);
    await agent.pairDevice(pairingToken);

    expect(deviceService.isPaired()).toBe(true);
  });

  it('should fetch and handle messages', async () => {
    jest.useFakeTimers();
    const someMessages = [messageBuilder.fbProofOfOwnershipMsgEnvelope()];
    jest.spyOn(fbServerApi, 'getMessages').mockImplementation(jest.fn(() => Promise.resolve(someMessages)));
    jest.spyOn(messagesService, 'handleMessages').mockImplementation(jest.fn(() => Promise.resolve()));

    await agent._runLoopStep(new https.Agent());

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

describe('message delivery transport selection', () => {
  const ORIGINAL_WEBSOCKET_ENABLED = process.env.WEBSOCKET_ENABLED;

  afterEach(() => {
    if (ORIGINAL_WEBSOCKET_ENABLED === undefined) {
      delete process.env.WEBSOCKET_ENABLED;
    } else {
      process.env.WEBSOCKET_ENABLED = ORIGINAL_WEBSOCKET_ENABLED;
    }
    jest.restoreAllMocks();
    jest.resetModules();
  });

  // Re-import the agent (and its co-wired ws client) with a fresh module graph so the
  // module-level WEBSOCKET_ENABLED constant is re-evaluated against the desired env value.
  const loadAgent = (websocketEnabled?: string) => {
    jest.resetModules();
    if (websocketEnabled === undefined) {
      delete process.env.WEBSOCKET_ENABLED;
    } else {
      process.env.WEBSOCKET_ENABLED = websocketEnabled;
    }
    const wsApi = require('./fb-server-ws.api').default;
    const freshAgent = require('./fireblocks-agent').default;
    return { wsApi, freshAgent };
  };

  it('defaults to WebSocket push mode when WEBSOCKET_ENABLED is unset', async () => {
    const { wsApi, freshAgent } = loadAgent(undefined);
    const startSpy = jest.spyOn(wsApi, 'start').mockImplementation(() => undefined);

    await freshAgent.runAgentMainLoop(new https.Agent());

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('uses HTTP long-poll (not WebSocket) when WEBSOCKET_ENABLED=false', async () => {
    const { wsApi, freshAgent } = loadAgent('false');
    const startSpy = jest.spyOn(wsApi, 'start').mockImplementation(() => undefined);
    // runAgentMainLoop's poll path is while(true); park it on a never-resolving step so
    // the test observes exactly one iteration without hanging.
    const stepSpy = jest.spyOn(freshAgent, '_runLoopStep').mockImplementation(() => new Promise<void>(() => undefined));

    void freshAgent.runAgentMainLoop(new https.Agent());
    await Promise.resolve();

    expect(startSpy).not.toHaveBeenCalled();
    expect(stepSpy).toHaveBeenCalledTimes(1);
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
