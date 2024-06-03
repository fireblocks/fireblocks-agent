import { FBMessageEnvelope, MessageEnvelop, MessageStatus, RequestType, ResponseType } from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import logger from './logger';

interface IMessageService {
  getPendingMessages(): number[];
  handleMessages(messages: FBMessageEnvelope[]): Promise<void>;
  updateStatus(messagesStatus: MessageStatus[]): Promise<void>;
}

class MessageService implements IMessageService {
  private msgCache: { [msgId: number]: MessageStatus } = {};
  private knownMessageTypes: RequestType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'];
  private requestTypeToResponseType = new Map<RequestType, ResponseType>([
    ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_RESPONSE'],
    ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE'],
  ]);

  getPendingMessages(): number[] {
    return Object.keys(this.msgCache).map((key) => Number(key));
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

    if (!!decodedMessages.length) {
      const msgStatuses = await customerServerApi.messagesToSign(decodedMessages);
      await this.updateStatus(msgStatuses);
    }
  }

  async updateStatus(messagesStatus: MessageStatus[]) {
    try {
      for (const msgStatus of messagesStatus) {
        const { msgId } = msgStatus.request.transportMetadata;
        const isInCache = this.msgCache[msgId];
        if (!isInCache) {
          this.msgCache[msgId] = msgStatus;
        }
        if (msgStatus.status === 'SIGNED' || msgStatus.status === 'FAILED') {
          logger.info(`Got signed message id ${msgId}`);
          await fbServerApi.broadcastResponse(msgStatus);
          await fbServerApi.ackMessage(msgId);
          delete this.msgCache[msgId];
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
