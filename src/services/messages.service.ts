import { FBMessageEnvlope, MessageEnvelop, MessageStatus, TxType } from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import logger from './logger';

interface IMessageService {
  getPendingMessages(): number[];
  handleMessages(messages: FBMessageEnvlope[]): Promise<void>;
  updateStatus(messagesStatus: MessageStatus[]): Promise<void>;
}

class MessageService implements IMessageService {
  private msgCache: { [msgId: number]: MessageStatus } = {};
  private knownMessageTypes: TxType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP', 'EXTERNAL_KEY_SIGNING_REQUEST'];

  getPendingMessages(): number[] {
    return Object.keys(this.msgCache).map((key) => Number(key));
  }

  async handleMessages(messages: FBMessageEnvlope[]) {
    const certificates = await fbServerApi.getCertificates();
    const decodedMessages: MessageEnvelop[] = messages
      .map((messageEnvelope: FBMessageEnvlope) => {
        const { message, msgId, type, payload } = decodeAndVerifyMessage(messageEnvelope, certificates);
        logger.info(`Got message id ${msgId} with type ${type}`);
        return { message, msgId, type, payload };
      })
      .filter((_) => this.knownMessageTypes.includes(_.type));

    if (!!decodedMessages.length) {
      const msgStatuses = await customerServerApi.messagesToSign(decodedMessages);
      await this.updateStatus(msgStatuses);
    }
  }

  async updateStatus(messagesStatus: MessageStatus[]) {
    try {
      for (const msgStatus of messagesStatus) {
        const isInCache = this.msgCache[msgStatus.msgId];
        if (!isInCache) {
          this.msgCache[msgStatus.msgId] = msgStatus;
        }
        if (msgStatus.status === 'SIGNED' || msgStatus.status === 'FAILED') {
          logger.info(`Got signed message id ${msgStatus.msgId}`);
          await fbServerApi.broadcastResponse(msgStatus);
          await fbServerApi.ackMessage(msgStatus.msgId);
          delete this.msgCache[msgStatus.msgId];
        }
      }
    } catch (e) {
      throw new Error(`Error updating status to fireblocks ${e.message}`);
    }
  }

  _clearCache() {
    this.msgCache = {};
  }
}

export default new MessageService();
