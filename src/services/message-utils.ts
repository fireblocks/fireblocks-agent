import axios from 'axios';
import jwt from 'jsonwebtoken';
import { FBMessageEnvlope, Message } from 'types';
import { MOBILE_GATEWAY_URL } from '../constants';
import deviceService from './device.service';
import logger from './logger';
import serverApi from './server.api';

class MessagesUtils {
  public async verifyMessage(messageEnvelope: FBMessageEnvlope): Promise<Message> {
    // Throws if not found
    const zsCertificate = await this.getServiceCertificate('zs');
    const jwtPayload = await jwt.verify(messageEnvelope.msg, zsCertificate);
    // if message signature is invalid, we'll throw an error and stop processing the message
    // await this._verifyMpcMessage(mpcMessage, jwtInfo);
    console.log(`----------------------------------`);
    console.log(jwtPayload);
    console.log(`----------------------------------`);
    return null;
  }

  private async getServiceCertificate(serviceName: string): Promise<string> {
    try {
      const accessToken = await serverApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.get(`${MOBILE_GATEWAY_URL}/get_service_certificates`, {
        headers: {
          'x-access-token': accessToken,
        },
      });
      return res.data[serviceName];
    } catch (e) {
      logger.error(`Error on get_service_certificates request`, e);
      throw e;
    }
  }
}
const mu = new MessagesUtils();

// mu.verifyMessage()
