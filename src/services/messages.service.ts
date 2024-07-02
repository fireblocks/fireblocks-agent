import { AGENT_REQUESTS_CACHE_SIZE } from '../constants';
import { DecodedMessage, ExtendedMessageStatusCache, FBMessageEnvelope, RequestType } from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import logger from './logger';

interface IMessageService {
  getPendingMessages(): ExtendedMessageStatusCache[];
  handleMessages(messages: FBMessageEnvelope[]): Promise<void>;
  updateStatus(messagesStatus: ExtendedMessageStatusCache[]): Promise<void>;
}

class MessageService implements IMessageService {
  private msgCache: { [requestId: string]: ExtendedMessageStatusCache } = {};
  private msgCacheOrder: string[] = [];
  private knownMessageTypes: RequestType[] = ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_TX_SIGN_REQUEST'];

  getPendingMessages(): ExtendedMessageStatusCache[] {
    return Object.values(this.msgCache).filter((msg) => msg.messageStatus.status === 'PENDING_SIGN');
  }

  async handleMessages(messages: FBMessageEnvelope[]) {
    const certificates = await fbServerApi.getCertificates();
    const decodedMessages: DecodedMessage[] = messages
      .map((messageEnvelope: FBMessageEnvelope): DecodedMessage => {
        try {
          const { msgId, request } = decodeAndVerifyMessage(messageEnvelope, certificates);
          const { transportMetadata } = request;
          logger.info(`Got message id ${msgId} with type ${transportMetadata.type} and request id ${transportMetadata.requestId}`);
          return { msgId, request };
        } catch (e) {
          logger.error(`Error decoding message ${e.message}`);
          return null;
        }
      })
      .filter((_) => _ !== null);

    const unknownMessages: DecodedMessage[] = [];
    const messagesToHandle: DecodedMessage[] = [];
    const cachedMessages: DecodedMessage[] = [];
    decodedMessages.forEach((decodedMessage) => {
      const { transportMetadata } = decodedMessage.request;
      if (this.msgCache[transportMetadata.requestId]) {
        cachedMessages.push(decodedMessage);
      } else if (this.knownMessageTypes.includes(transportMetadata.type)) {
        messagesToHandle.push(decodedMessage);
      } else {
        unknownMessages.push(decodedMessage);
      }
    });

    if (!!cachedMessages.length) {
      cachedMessages.forEach((msg) => logger.info(`Got cached message id ${msg.msgId} request id ${msg.request.transportMetadata.requestId}`));
      const cachedMsgsStatus = cachedMessages.map((msg): ExtendedMessageStatusCache => {
        return {
          msgId: msg.msgId,
          request: msg.request,
          messageStatus: this.msgCache[msg.request.transportMetadata.requestId].messageStatus,
        }
      });

      // We're calling updateStatus here to handle the case where the message was signed and we got it again from Fireblocks
      await this.updateStatus(cachedMsgsStatus);
    }

    if (!!messagesToHandle.length) {
      const msgStatuses = await customerServerApi.messagesToSign(messagesToHandle.map((msg) => msg.request));
      logger.info(`Got messages status for ${JSON.stringify(msgStatuses.map((status) => { return { requestId: status.requestId, status: status.status } }))}`);
      await this.updateStatus(msgStatuses.map((messageStatus): ExtendedMessageStatusCache => {
        const decodedMessage = messagesToHandle.find((msg) => msg.request.transportMetadata.requestId === messageStatus.requestId);
        return {
          msgId: decodedMessage.msgId,
          request: decodedMessage.request,
          messageStatus,
        };
      }));
    }

    if (!!unknownMessages.length) {
      unknownMessages.forEach((msg) => logger.error(`Got unknown message type ${msg.request.transportMetadata.type} and id ${msg.msgId}`));
      await this.ackMessages(unknownMessages.map((msg) => msg.msgId));
    }
  }

  async addMessageToCache(messageStatus: ExtendedMessageStatusCache) {
    if (Object.keys(this.msgCache).length >= AGENT_REQUESTS_CACHE_SIZE) {
      delete this.msgCache[this.msgCacheOrder.shift()];
    }

    this.msgCache[messageStatus.messageStatus.requestId] = messageStatus;
    this.msgCacheOrder.push(messageStatus.messageStatus.requestId);
  }

  async updateStatus(messagesStatus: ExtendedMessageStatusCache[]) {
    for (const msgStatus of messagesStatus) {
      try {
        const { msgId, request, messageStatus } = msgStatus;
        const { requestId, status } = messageStatus;
        const isInCache = this.msgCache[requestId];
        if (!isInCache) {
          await this.addMessageToCache(msgStatus);
        } else {
          this.msgCache[messageStatus.requestId].msgId = msgId;
        }

        if (status === 'SIGNED' || status === 'FAILED') {
          logger.info(`Got message from customer server with status: ${status}, msgId ${msgId}, cacheId: ${requestId}`);
          this.msgCache[messageStatus.requestId].messageStatus = messageStatus;

          await fbServerApi.broadcastResponse(messageStatus, request);
          await fbServerApi.ackMessage(msgId);
        }
      } catch (e) {
        throw new Error(`Error updating status to fireblocks ${e.message} for message ${msgStatus.msgId} and status ${msgStatus.messageStatus}`);
      }
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
