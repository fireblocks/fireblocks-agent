import { SignedMessage } from 'types';
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
      console.log(`Unsupported algorithm: ${algorithm}`);
      msg.response.errorMessage = `Unsupported algorithm: ${algorithm}`;
      return;
    }

    setTimeout(async () => {
      const previousStatus = msg.status;
      const { msgId } = msg.request.transportMetadata;
      msg.status = Math.round(Math.random()) ? 'FAILED' : 'SIGNED';
      if (msg.status === 'FAILED') {
        msg.response.errorMessage = `Simulate error while signing this message ${msgId}`;
      }
      else {
        const { signingDeviceKeyId, messagesToSign } = msg.message;
        for (const { message, index } of messagesToSign) {
          const signature = await hsmFacade.sign(signingDeviceKeyId, message, algorithm);
          msg.response.signedMessages.push({ index, signature, message });
        }
      }

      await messagesDao.updateMessageStatus(msg);
      console.log(`Set ${msg.request.transportMetadata.msgId} from status ${previousStatus} to ${msg.status}`);
    }, oneToFiveSeconds);
  });
}

export async function signMessages(msgIds: number[]) {
  logger.info(`enter signing messages ${msgIds}`);
  const messages = await getMessages(msgIds);
  for (const msg of messages) {
    const algorithm = msg.message.algorithm;
    if (typeof algorithm !== 'string' || !SUPPORTED_ALGORITHMS.includes(algorithm)) {
      console.log(`Unsupported algorithm: ${algorithm}`);
      msg.status = 'FAILED';
      msg.response.errorMessage = `Unsupported algorithm: ${algorithm}`;
      return;
    }

    const { msgId } = msg.request.transportMetadata;
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
      logger.info(`signed ${messagesToSign.length} payloads in message ${msgId}`);
    } catch (e) {
      logger.error(e);
      msg.status = 'FAILED';
      msg.response = { errorMessage: e?.toString() || 'Unknown error' };
    }

    await messagesDao.updateMessageStatus(msg);
    logger.info(`Set ${msgId} to ${msg.status}`);
  }
}
