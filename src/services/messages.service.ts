import { FBMessageEnvelope, MessageEnvelop, MessageStatus, RequestType, ResponseType } from '../types';
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
  private knownMessageTypes: RequestType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_TX_SIGN_REQUEST'];
  private deprecatedMessageTypes: RequestType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST'];
  private requestTypeToResponseType = new Map<RequestType, ResponseType>([
    ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_RESPONSE'],
    ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE'],
    ['KEY_LINK_TX_SIGN_REQUEST', 'KEY_LINK_TX_SIGN_RESPONSE'],
  ]);

  getPendingMessages(): string[] {
    return Object.keys(this.msgCache);
  }

  async handleMessages(messages: FBMessageEnvelope[]) {
    const certificates = await fbServerApi.getCertificates();
    const decodedMessages: MessageEnvelop[] = messages
      .map((messageEnvelope: FBMessageEnvelope) => {
        const { message, transportMetadata } = decodeAndVerifyMessage(messageEnvelope, certificates);
        logger.info(`Got message id ${transportMetadata.msgId} with type ${transportMetadata.type}`);
        return { message, transportMetadata };
      })
      .filter((_) => this.knownMessageTypes.includes(_.transportMetadata.type));

    const deprecatedMessages: MessageEnvelop[] = [];
    const messagesToHandle: MessageEnvelop[] = [];
    decodedMessages.forEach((decodedMessage) => {
      if (this.deprecatedMessageTypes.includes(decodedMessage.transportMetadata.type)) {
        deprecatedMessages.push(decodedMessage);
      } else {
        messagesToHandle.push(decodedMessage);
      }
    });

    if (!!messagesToHandle.length) {
      const msgStatuses = await customerServerApi.messagesToSign(messagesToHandle);
      await this.updateStatus(msgStatuses);
    }

    if (!!deprecatedMessages.length) {
      const errorStatuses = deprecatedMessages.map((msg): MessageStatus => ({
        type: this.requestTypeToResponseType.get(msg.transportMetadata.type),
        status: 'FAILED',
        request: msg,
        response: {
          errorMessage: 'Deprecated message type',
        },
      }));
      await this.updateStatus(errorStatuses);
    }
  }

  async updateStatus(messagesStatus: MessageStatus[]) {
    try {
      for (const msgStatus of messagesStatus) {
        const { msgId, internalMessageId } = msgStatus.request.transportMetadata;
        const isInCache = this.msgCache[internalMessageId];
        if (!isInCache) {
          this.msgCache[internalMessageId] = msgStatus;
        }
        if (msgStatus.status === 'SIGNED' || msgStatus.status === 'FAILED') {
          logger.info(`Got signed message id ${msgId}, cacheId: ${internalMessageId}`);
          await fbServerApi.broadcastResponse(msgStatus);
          await fbServerApi.ackMessage(msgId);
          delete this.msgCache[internalMessageId];
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
