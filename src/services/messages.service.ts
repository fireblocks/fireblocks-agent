import { FBMessageEnvlope, GUID, MessageEnvelop, MessageStatus, TxType } from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customerServer.api';
import logger from './logger';
import serverApi from './server.api';

class MessageService {
  private msgCache: { [msgId: GUID]: MessageStatus } = {};
  private knownMessageTypes: TxType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP', 'TX'];

  getPendingMessages(): GUID[] {
    return Object.keys(this.msgCache);
  }

  async handleMessages(messages: FBMessageEnvlope[]) {
    const certificates = await serverApi.getCertificates();
    const decodedMessages: MessageEnvelop[] = messages
      .map((messageEnvelope: FBMessageEnvlope) => {
        const { message, msgId, type, payload } = decodeAndVerifyMessage(messageEnvelope, certificates);
        logger.debug(`Got message with type ${type}`);
        return { message, msgId, type, payload };
      })
      .filter((_) => this.knownMessageTypes.includes(_.type));

    if (decodedMessages.length > 0) {
      const status = await customerServerApi.messagesToSign(decodedMessages);
      status.forEach((messageStatus) => {
        this.msgCache[messageStatus.msgId] = messageStatus;
      });
    }
  }

  async updateStatus(messagesStatus: MessageStatus[]) {
    try {
      for (const msgStatus of messagesStatus) {
        if (msgStatus.status === 'SIGNED') {
          await serverApi.broadcastResponse(msgStatus);
          await serverApi.ackMessage(msgStatus.msgId);
        }
      }
    } catch (e) {
      throw new Error('Error updating status to firblocks', e);
    }
  }

  _clearCache() {
    this.msgCache = {};
  }
}

export default new MessageService();
