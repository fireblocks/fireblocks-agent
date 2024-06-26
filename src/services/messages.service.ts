import { FBMessageEnvelope, MessageEnvelop, MessageStatus, TxType } from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import logger from './logger';

interface IMessageService {
  getPendingMessages(): string[];
  handleMessages(messages: FBMessageEnvelope[]): Promise<void>;
  updateStatus(messagesStatus: MessageStatus[]): Promise<void>;
}

class MessageService implements IMessageService {
  private msgCache: { [requestId: string]: MessageStatus } = {};
  private knownMessageTypes: TxType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', 'EXTERNAL_KEY_SIGNING_REQUEST'];

  getPendingMessages(): string[] {
    return Object.keys(this.msgCache);
  }

  async handleMessages(messages: FBMessageEnvelope[]) {
    const certificates = await fbServerApi.getCertificates();
    const decodedMessages: MessageEnvelop[] = messages
      .map((messageEnvelope: FBMessageEnvelope) => {
        try {
          const { message, msgId, requestId, type, payload } = decodeAndVerifyMessage(messageEnvelope, certificates);
          logger.info(`Got message id ${msgId} with type ${type} and request id ${requestId}`);
          return { message, msgId, requestId, type, payload };
        }
        catch (e) {
          logger.error(`Error decoding message ${e.message}`);
          return null;
        }
      })
      .filter((_) => _ !== null);

    const unknownMessages: MessageEnvelop[] = [];
    const messagesToHandle: MessageEnvelop[] = [];
    decodedMessages.forEach((decodedMessage) => {
      if (this.knownMessageTypes.includes(decodedMessage.type)) {
        messagesToHandle.push(decodedMessage);
      } else {
        unknownMessages.push(decodedMessage);
      }
    });

    if (!!messagesToHandle.length) {
      const msgStatuses = await customerServerApi.messagesToSign(messagesToHandle);
      await this.updateStatus(msgStatuses);
    }

    if (!!unknownMessages.length) {
      unknownMessages.forEach((msg) => logger.error(`Got unknown message type ${msg.type} and id ${msg.msgId}`));
      await this.ackMessages(unknownMessages.map((msg) => msg.msgId));
    }
  }

  async updateStatus(messagesStatus: MessageStatus[]) {
    try {
      for (const msgStatus of messagesStatus) {
        const isInCache = this.msgCache[msgStatus.requestId];
        if (!isInCache) {
          this.msgCache[msgStatus.requestId] = msgStatus;
        }
        if (msgStatus.status === 'SIGNED' || msgStatus.status === 'FAILED') {
          logger.info(`Got signed message id ${msgStatus.requestId}`);
          await fbServerApi.broadcastResponse(msgStatus);
          await fbServerApi.ackMessage(msgStatus.msgId);
          delete this.msgCache[msgStatus.requestId];
        }
      }
    } catch (e) {
      throw new Error(`Error updating status to fireblocks ${e.message}`);
    }
  }

  async ackMessages(messagesIds: number[]) {
    try {
      const promises = messagesIds.map(msgId => fbServerApi.ackMessage(msgId));
      await Promise.all(promises);
    } catch (e) {
      throw new Error(`Error acknowledging messages ${e.message}`);
    }
  }

  _clearCache() {
    this.msgCache = {};
  }
}

export default new MessageService();
