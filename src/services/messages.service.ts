import { ExtendedMessageStatus, FBMessageEnvelope, MessageEnvelop, TxType } from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import logger from './logger';

interface IMessageService {
  getPendingMessages(): ExtendedMessageStatus[];
  handleMessages(messages: FBMessageEnvelope[]): Promise<void>;
  updateStatus(messagesStatus: ExtendedMessageStatus[]): Promise<void>;
}

class MessageService implements IMessageService {
  private MAX_CACHE_SIZE = 1024;
  private msgCache: { [requestId: string]: ExtendedMessageStatus } = {};
  private msgCacheOrder: string[] = [];
  private knownMessageTypes: TxType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', 'EXTERNAL_KEY_SIGNING_REQUEST'];

  getPendingMessages(): ExtendedMessageStatus[] {
    return Object.values(this.msgCache).filter((msg) => msg.messageStatus.status === 'PENDING_SIGN');
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
    const cachedMessages: MessageEnvelop[] = [];
    decodedMessages.forEach((decodedMessage) => {
      if (this.msgCache[decodedMessage.requestId]) {
        cachedMessages.push(decodedMessage);
      } else if (this.knownMessageTypes.includes(decodedMessage.type)) {
        messagesToHandle.push(decodedMessage);
      } else {
        unknownMessages.push(decodedMessage);
      }
    });

    if (!!cachedMessages.length) {
      cachedMessages.forEach((msg) => logger.info(`Got cached message id ${msg.msgId} request id ${msg.requestId}`));
      const cachedMsgsStatus = cachedMessages.map((msg) => this.msgCache[msg.requestId]);
      await this.updateStatus(cachedMsgsStatus);
    }

    if (!!messagesToHandle.length) {
      const msgStatuses = await customerServerApi.messagesToSign(messagesToHandle);
      await this.updateStatus(msgStatuses.map((messageStatus): ExtendedMessageStatus => ({
        msgId: messagesToHandle.find((msg) => msg.requestId === messageStatus.requestId).msgId,
        messageStatus,
      })));
    }

    if (!!unknownMessages.length) {
      unknownMessages.forEach((msg) => logger.error(`Got unknown message type ${msg.type} and id ${msg.msgId}`));
      await this.ackMessages(unknownMessages.map((msg) => msg.msgId));
    }
  }

  async addMessageToCache(messageStatus: ExtendedMessageStatus) {
    if (Object.keys(this.msgCache).length >= this.MAX_CACHE_SIZE) {
      delete this.msgCache[this.msgCacheOrder.shift()];
    }

    this.msgCache[messageStatus.messageStatus.requestId] = messageStatus;
    this.msgCacheOrder.push(messageStatus.messageStatus.requestId);
  }

  async updateStatus(messagesStatus: ExtendedMessageStatus[]) {
    try {
      for (const { msgId, messageStatus } of messagesStatus) {
        const isInCache = this.msgCache[messageStatus.requestId];
        if (!isInCache) {
          await this.addMessageToCache({ msgId, messageStatus });
        } else {
          this.msgCache[messageStatus.requestId].msgId = msgId;
        }

        if (messageStatus.status === 'SIGNED' || messageStatus.status === 'FAILED') {
          logger.info(`Got signed message id ${messageStatus.requestId}`);
          this.msgCache[messageStatus.requestId].messageStatus = messageStatus;

          await fbServerApi.broadcastResponse(messageStatus);
          await fbServerApi.ackMessage(msgId);
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
