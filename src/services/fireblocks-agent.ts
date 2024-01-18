import jwt from 'jsonwebtoken';
import { GUID, JWT, PairingToken } from 'types';
import deviceService, { DeviceData } from './device.service';
import fbServerApi from './fb-server.api';
import logger from './logger';
import messageService from './messages.service';
export interface HsmAgent {
  pairDevice(pairingToken: JWT, deviceId: GUID): void;
  runAgentMainLoop(): Promise<void>;
  isValidPairingToken(pairingToken: JWT): boolean;
}

class HsmAgentImpl implements HsmAgent {
  async pairDevice(pairingToken: string, deviceId: GUID) {
    const { userId } = jwt.decode(pairingToken) as PairingToken;
    const { refreshToken } = await fbServerApi.pairDevice({
      userId,
      pairingToken,
      deviceId,
    });
    deviceService.saveDeviceData({ userId, deviceId, refreshToken });
  }

  runAgentMainLoop = async () => {
    try {
      await this._runLoopStep();
    } catch (e) {
      logger.error(`Error in agent main loop ${e}`);
    }
    setTimeout(this.runAgentMainLoop);
  };

  isValidPairingToken(pairingToken: JWT): boolean {
    try {
      const { userId } = jwt.decode(pairingToken) as DeviceData;
      return userId.length > 0;
    } catch (e) {
      return false;
    }
  }

  _runLoopStep = async () => {
    const start = Date.now();
    logger.info(`Waiting for a message`);
    const messages = await fbServerApi.getMessages();
    logger.info(`Got ${messages.length} messages after ${Date.now() - start}ms`);
    await messageService.handleMessages(messages);
  };
}

export default new HsmAgentImpl();
