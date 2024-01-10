import * as messagesDao from '../dao/messages.dao';
import { getMessages } from '../dao/messages.dao';
import hsmFacade from './hsm-facade';
import logger from './logger';

export async function randomlySignOrFailMessagesAsync(msgIds: number[]) {
  const messages = await getMessages(msgIds);
  messages.forEach((msg) => {
    const oneToFiveSeconds = Math.ceil(Math.random() * 5) * 1000;
    setTimeout(async () => {
      const previousStatus = msg.status;
      msg.status = Math.round(Math.random()) ? 'FAILED' : 'SIGNED';
      if (msg.status === 'FAILED') {
        msg.errorMessage = `Simulate error while signing this message`;
      }
      const algorithm = msg.message.algorithm === 'EDDSA_ED25519' ? 'EDDSA' : 'ECDSA';
      const { externalKeyId, data } = msg.message;
      if (msg.status === 'SIGNED') {
        msg.signedPayload = await hsmFacade.sign(externalKeyId, data, algorithm);
      }
      await messagesDao.updateMessageStatus(msg);
      console.log(`Set ${msg.msgId} from status ${previousStatus} to ${msg.status}`);
    }, oneToFiveSeconds);
  });
}

export async function signMessages(msgIds: number[]) {
  logger.info(`enter signing messages ${msgIds}`);
  const messages = await getMessages(msgIds);
  messages.forEach(async (msg) => {
    const algorithm = msg.message.algorithm === 'EDDSA_ED25519' ? 'EDDSA' : 'ECDSA';
    const { externalKeyId, data } = msg.message;
    msg.signedPayload = await hsmFacade.sign(externalKeyId, data, algorithm);
    msg.status = 'SIGNED';
    logger.info(`signed message ${msg.msgId}. signature: ${msg.signedPayload}`);
    await messagesDao.updateMessageStatus(msg);
    logger.info(`Set ${msg.msgId} to ${msg.status}`);
  });
}
