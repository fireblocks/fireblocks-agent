import jwt from 'jsonwebtoken';
import { GUID, JWT, PairingToken } from 'types';
import deviceService, { DeviceData } from './device.service';
import fbServerApi from './fb-server.api';
import logger from './logger';
import messageService from './messages.service';
import https from 'https';
export interface FireblocksAgent {
  pairDevice(pairingToken: JWT, deviceId: GUID): void;
  runAgentMainLoop(httpsAgent: https.Agent): Promise<void>;
  isValidPairingToken(pairingToken: JWT): boolean;
}

class FireblocksAgentImpl implements FireblocksAgent {
  async pairDevice(pairingToken: string, deviceId: GUID) {
    const { userId } = jwt.decode(pairingToken) as PairingToken;
    const { refreshToken } = await fbServerApi.pairDevice({
      userId,
      pairingToken,
      deviceId,
    });
    deviceService.saveDeviceData({ userId, deviceId, refreshToken });
  }

  runAgentMainLoop = async (httpsAgent: https.Agent) => {
    while (true) {
      try {
        await this._runLoopStep(httpsAgent);
      } catch (e) {
        logger.error(`Error in agent main loop ${e}`);
      }
    }
  };

  isValidPairingToken(pairingToken: JWT): boolean {
    try {
      const { userId } = jwt.decode(pairingToken) as DeviceData;
      return userId.length > 0;
    } catch (e) {
      return false;
    }
  }

  _runLoopStep = async (httpsAgent) => {
    const start = Date.now();
    logger.info(`Waiting for messages from Fireblocks...`);
    const messages = await fbServerApi.getMessages();
    logger.info(`Got ${messages.length} messages from Fireblocks after ${Date.now() - start}ms`);
    await messageService.handleMessages(messages, httpsAgent);
  };
}

export default new FireblocksAgentImpl();
