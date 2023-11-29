import jwt from 'jsonwebtoken';
import { GUID, JWT } from 'types';
import deviceService from './device.service';
import serverApi from './server.api';

interface HsmAgent {
  pairDevice(pairingToken: JWT, deviceId: GUID): void;
}

class HsmAgentImpl implements HsmAgent {
  async pairDevice(pairingToken: string, deviceId: GUID) {
    const { userId } = jwt.decode(pairingToken);
    const { refreshToken } = await serverApi.pairDevice({
      userId,
      pairingToken,
      deviceId,
    });
    deviceService.saveRefreshToken(refreshToken);
  }
}

export default new HsmAgentImpl();
