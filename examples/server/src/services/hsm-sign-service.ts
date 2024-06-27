import * as messagesDao from '../dao/messages.dao';
import { getMessages } from '../dao/messages.dao';
import { SUPPORTED_ALGORITHMS } from './algorithm-info';
import hsmFacade from './hsm-facade';
import logger from './logger';

export async function randomlySignOrFailMessagesAsync(requestsIds: string[]) {
  const messages = await getMessages(requestsIds);
  messages.forEach((msg) => {
    const oneToFiveSeconds = Math.ceil(Math.random() * 5) * 1000;
    const algorithm = msg.message.algorithm;
    if (typeof algorithm !== 'string' || !SUPPORTED_ALGORITHMS.includes(algorithm)) {
      logger.info(`Unsupported algorithm: ${algorithm}`);
      msg.errorMessage = `Unsupported algorithm: ${algorithm}`;
      return;
    }

    setTimeout(async () => {
      const previousStatus = msg.status;
      msg.status = Math.round(Math.random()) ? 'FAILED' : 'SIGNED';
      if (msg.status === 'FAILED') {
        msg.errorMessage = `Simulate error while signing this message ${msg.requestId}`;
      }

      const { signingDeviceKeyId, data } = msg.message;
      if (msg.status === 'SIGNED') {
        msg.signedPayload = await hsmFacade.sign(signingDeviceKeyId, data, algorithm);
      }
      await messagesDao.updateMessageStatus(msg);
      logger.info(`Set ${msg.requestId} from status ${previousStatus} to ${msg.status}`);
    }, oneToFiveSeconds);
  });
}

export async function signMessages(requestIds: string[]) {
  logger.info(`enter signing messages ${requestIds}`);
  const messages = await getMessages(requestIds);
  for (const msg of messages) {
    const algorithm = msg.message.algorithm;
    if (typeof algorithm !== 'string' || !SUPPORTED_ALGORITHMS.includes(algorithm)) {
      logger.error(`Unsupported algorithm: ${algorithm}`);
      msg.status = 'FAILED';
      msg.errorMessage = `Unsupported algorithm: ${algorithm}`;
      return;
    }

    try {
      const { signingDeviceKeyId, data } = msg.message;
      msg.signedPayload = await hsmFacade.sign(signingDeviceKeyId, data, algorithm);
      msg.status = 'SIGNED';
      logger.info(`signed message ${msg.requestId}. signature: ${msg.signedPayload}`);
    } catch (e) {
      logger.error(e);
      msg.status = 'FAILED';
      msg.errorMessage = e.toString();
    }

    await messagesDao.updateMessageStatus(msg);
    logger.info(`Set ${msg.requestId} to ${msg.status}`);
  }
}
