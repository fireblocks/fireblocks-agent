import * as messagesDao from '../dao/messages.dao';
import { getMessages } from '../dao/messages.dao';
import { GUID } from '../types';
import hsmFacade from './hsm-facade';

export async function randomlySignOrFailMessagesAsync(msgIds: GUID[]) {
  const messages = await getMessages(msgIds);
  messages.forEach((msg) => {
    const oneToFiveSeconds = Math.ceil(Math.random() * 5) * 1000;
    setTimeout(async () => {
      const previousStatus = msg.status;
      msg.status = Math.round(Math.random()) ? 'FAILED' : 'SIGNED';
      if (msg.status === 'FAILED') {
        msg.errorMessage = `Simulate error while signing this message`;
      }
      const algorithm = msg.message.algorithm === 'ECDSA' ? 'ECDSA' : 'EDDSA';
      const { externalKeyId, data } = msg.message;
      if (msg.status === 'SIGNED') {
        msg.payload = await hsmFacade.sign(externalKeyId, data, algorithm);
      }
      await messagesDao.updateMessageStatus(msg);
      console.log(`Set ${msg.msgId} from status ${previousStatus} to ${msg.status}`);
    }, oneToFiveSeconds);
  });
}
