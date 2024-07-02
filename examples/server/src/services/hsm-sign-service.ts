import { SignedMessage } from 'types';
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
      msg.response.errorMessage = `Unsupported algorithm: ${algorithm}`;
      return;
    }

    setTimeout(async () => {
      const previousStatus = msg.status;
      const { requestId } = msg;
      msg.status = Math.round(Math.random()) ? 'FAILED' : 'SIGNED';
      if (msg.status === 'FAILED') {
        msg.response.errorMessage = `Simulate error while signing this message ${requestId}`;
      }
      else {
        const { signingDeviceKeyId, messagesToSign } = msg.message;
        const signedMessages = await Promise.all(messagesToSign.map(async (msg): Promise<SignedMessage> => {
          const signature = await hsmFacade.sign(signingDeviceKeyId, msg.message, algorithm);
          return {
            index: msg.index,
            signature,
            message: msg.message
          };
        }));
        msg.response = { signedMessages };
      }

      await messagesDao.updateMessageStatus(msg);
      logger.info(`Set ${requestId} from status ${previousStatus} to ${msg.status}`);
    }, oneToFiveSeconds);
  });
}

export async function signMessages(requestsIds: string[]) {
  logger.info(`enter signing messages ${requestsIds}`);
  const messages = await getMessages(requestsIds);
  for (const msg of messages) {
    const algorithm = msg.message.algorithm;
    if (typeof algorithm !== 'string' || !SUPPORTED_ALGORITHMS.includes(algorithm)) {
      logger.error(`Unsupported algorithm: ${algorithm}`);
      msg.status = 'FAILED';
      msg.response.errorMessage = `Unsupported algorithm: ${algorithm}`;
      return;
    }

    const { requestId } = msg;
    const { signingDeviceKeyId, messagesToSign } = msg.message;

    try {
      const signedMessages = await Promise.all(messagesToSign.map(async (msg): Promise<SignedMessage> => {
        const signature = await hsmFacade.sign(signingDeviceKeyId, msg.message, algorithm);
        return {
          index: msg.index,
          signature,
          message: msg.message
        };
      }));

      msg.response = { signedMessages };
      msg.status = 'SIGNED';
      logger.info(`signed ${messagesToSign.length} payloads in message ${requestId}`);
    } catch (e) {
      logger.error(e);
      msg.status = 'FAILED';
      msg.response = { errorMessage: e?.toString() || 'Unknown error' };
    }

    await messagesDao.updateMessageStatus(msg);
    logger.info(`Set ${requestId} to ${msg.status}`);
  }
}
