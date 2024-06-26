import * as messagesDao from '../dao/messages.dao';
import { getMessages } from '../dao/messages.dao';
import { SUPPORTED_ALGORITHMS } from './algorithm-info';
import hsmFacade from './hsm-facade';
import logger from './logger';

export async function randomlySignOrFailMessagesAsync(msgIds: number[]) {
  const messages = await getMessages(msgIds);
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
        msg.errorMessage = `Simulate error while signing this message ${msg.msgId}`;
      }

      const { signingDeviceKeyId, data } = msg.message;
      if (msg.status === 'SIGNED') {
        msg.signedPayload = await hsmFacade.sign(signingDeviceKeyId, data, algorithm);
      }
      await messagesDao.updateMessageStatus(msg);
      logger.info(`Set ${msg.msgId} from status ${previousStatus} to ${msg.status}`);
    }, oneToFiveSeconds);
  });
}

export async function signMessages(msgIds: number[]) {
  logger.info(`enter signing messages ${msgIds}`);
  const messages = await getMessages(msgIds);
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
      logger.info(`signed message ${msg.msgId}. signature: ${msg.signedPayload}`);
    } catch (e) {
      logger.error(e);
      msg.status = 'FAILED';
      msg.errorMessage = e.toString();
    }

    await messagesDao.updateMessageStatus(msg);
    logger.info(`Set ${msg.msgId} to ${msg.status}`);
  }
}
