import { FBMessageEnvelope, MessageEnvelop, MessageStatus, RequestType } from '../types';
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
  private msgCache: { [msgId: string]: MessageStatus } = {};
  private supportedMessageTypes: RequestType[] = ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'];

  getPendingMessages(): string[] {
    return Object.keys(this.msgCache);
  }

  async handleMessages(messages: FBMessageEnvelope[]) {
    const certificates = await fbServerApi.getCertificates();
    const decodedMessages: MessageEnvelop[] = messages
      .map((messageEnvelope: FBMessageEnvelope) => {
        try {
          const { message, transportMetadata } = decodeAndVerifyMessage(messageEnvelope, certificates);
          logger.info(`Got message id ${transportMetadata.msgId} with type ${transportMetadata.type}`);
          return { message, transportMetadata };
        } catch (e) {
          logger.error(`Error decoding message ${e.message}`);
          return null;
        }
      })
      .filter((_) => _ !== null);

    const unknownMessages: MessageEnvelop[] = [];
    const messagesToHandle: MessageEnvelop[] = [];
    decodedMessages.forEach((decodedMessage) => {
      if (this.supportedMessageTypes.includes(decodedMessage.transportMetadata.type)) {
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
      unknownMessages.forEach((msg) => {
        logger.warn(`Got unknown message id ${msg.transportMetadata.msgId} and type ${msg.transportMetadata.type}`);
      });

      await this.ackMessages(unknownMessages.map((msg) => msg.transportMetadata.msgId));
    }
    }
  }

  async updateStatus(messagesStatus: MessageStatus[]) {
    try {
      for (const msgStatus of messagesStatus) {
        const { msgId, requestId } = msgStatus.request.transportMetadata;
        const isInCache = this.msgCache[requestId];
        if (!isInCache) {
          this.msgCache[requestId] = msgStatus;
        }
        if (msgStatus.status === 'SIGNED' || msgStatus.status === 'FAILED') {
          logger.info(`Got signed message id ${msgId}, cacheId: ${requestId}`);
          await fbServerApi.broadcastResponse(msgStatus);
          await fbServerApi.ackMessage(msgId);
          delete this.msgCache[requestId];
        }
      }
    } catch (e) {
      throw new Error(`Error updating status to fireblocks ${e.message}`);
    }
  }

  async ackMessages(msgIds: number[]) {
    for (const msgId of msgIds) {
      try {
        await fbServerApi.ackMessage(msgId);
      } catch (e) {
        throw new Error(`Error acking message ${msgId} to fireblocks ${e.message}`);
      }
    }
  }

  _clearCache() {
    this.msgCache = {};
  }
}

export default new MessageService();
