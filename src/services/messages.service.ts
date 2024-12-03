import https from 'https';
import { AGENT_REQUESTS_CACHE_SIZE, BROADCAST_BATCH_SIZE } from '../constants';
import { DecodedMessage, ExtendedMessageStatusCache, FBMessageEnvelope, RequestType, InvalidMessage } from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import logger from './logger';
interface IMessageService {
  getPendingMessages(): ExtendedMessageStatusCache[];
  handleMessages(messages: FBMessageEnvelope[], httpsAgent: https.Agent): Promise<void>;
  updateStatus(messagesStatus: ExtendedMessageStatusCache[]): Promise<void>;
}

class MessageService implements IMessageService {
  private msgCache: { [requestId: string]: ExtendedMessageStatusCache } = {};
  private msgCacheOrder: string[] = [];
  private knownMessageTypes: RequestType[] = ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_TX_SIGN_REQUEST'];

  getPendingMessages(): ExtendedMessageStatusCache[] {
    return Object.values(this.msgCache).filter((msg) => msg.messageStatus.status === 'PENDING_SIGN');
  }

  async handleMessages(messages: FBMessageEnvelope[], httpsAgent: https.Agent) {
    const certificates = await fbServerApi.getCertificates();
    const invalidMessages: InvalidMessage[] = [];
    const decodedMessages: DecodedMessage[] = messages
      .map((messageEnvelope: FBMessageEnvelope): DecodedMessage => {
        try {
          const { msgId, request } = decodeAndVerifyMessage(messageEnvelope, certificates);
          const { transportMetadata } = request;
          logger.info(
            `Got from Fireblocks msgId ${msgId} with type ${transportMetadata.type} and requestId ${transportMetadata.requestId}`,
          );
          return { msgId, request };
        } catch (e) {
          logger.error(`Error decoding message ${e.message}`);
          invalidMessages.push({ msgId: messageEnvelope.msgId });
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
      logger.info(`Found ${cachedMessages.length} cached messages`);
      cachedMessages.forEach((msg) =>
        logger.info(
          `Found cached message. requestId: ${msg.request.transportMetadata.requestId}, msgId: ${
            msg.msgId
          }, cached msgId: ${this.msgCache[msg.request.transportMetadata.requestId].msgId}`,
        ),
      );
      const cachedMsgsStatus = cachedMessages.map((msg): ExtendedMessageStatusCache => {
        return {
          msgId: msg.msgId,
          request: msg.request,
          messageStatus: this.msgCache[msg.request.transportMetadata.requestId].messageStatus,
        };
      });

      // We're calling updateStatus here to handle the case where the message was signed and we got it again from Fireblocks
      await this.updateStatus(cachedMsgsStatus);
    }

    if (!!messagesToHandle.length) {
      logger.info(`sending ${messagesToHandle.length} messages to customer server to sign`);
      const msgStatuses = await customerServerApi.messagesToSign(
        messagesToHandle.map((msg) => msg.request),
        httpsAgent,
      );
      logger.info(
        `Got from customer server messages status for ${JSON.stringify(
          msgStatuses.map((status) => {
            return { requestId: status.requestId, status: status.status };
          }),
        )}`,
      );
      await this.updateStatus(
        msgStatuses
          .map((messageStatus): ExtendedMessageStatusCache => {
            const decodedMessage = messagesToHandle.find(
              (msg) => msg.request.transportMetadata.requestId === messageStatus.requestId,
            );
            if (!decodedMessage) {
              logger.error(`Message with requestId ${messageStatus.requestId} wasn't expected`);
              return null;
            }

            return {
              msgId: decodedMessage.msgId,
              request: decodedMessage.request,
              messageStatus,
            };
          })
          .filter((msg) => msg !== null),
      );
    }

    if (!!unknownMessages.length) {
      unknownMessages.forEach((msg) =>
        logger.error(
          `Got from Fireblocks unknown message type ${msg.request.transportMetadata.type} and id ${msg.msgId}`,
        ),
      );
      await this.ackMessages(unknownMessages.map((msg) => msg.msgId));
    }

    if (!!invalidMessages.length) {
      invalidMessages.forEach((msg) =>
        logger.error(`Got from Fireblocks invalid message with msgIs: ${msg.msgId} - discarding`),
      );
      await this.ackMessages(invalidMessages.map((msg) => msg.msgId));
    }
  }

  async addMessageToCache(messageStatus: ExtendedMessageStatusCache) {
    if (Object.keys(this.msgCache).length >= AGENT_REQUESTS_CACHE_SIZE) {
      delete this.msgCache[this.msgCacheOrder.shift()];
    }

    this.msgCache[messageStatus.messageStatus.requestId] = messageStatus;
    this.msgCacheOrder.push(messageStatus.messageStatus.requestId);
    logger.info(
      `Added message to cache. msgId: ${messageStatus.msgId}, requestId: ${messageStatus.messageStatus.requestId} `,
    );
  }

  async deleteMessageFromCache(requestId: string): Promise<void> {
    delete this.msgCache[requestId];
    delete this.msgCacheOrder[requestId];
    logger.info(`Removed message from cache. requestId: ${requestId}`);
  }

  async updateStatus(messagesStatus: ExtendedMessageStatusCache[]) {
    let broadcastPromises = [];
    let ackPromises = [];
    logger.info(
      `Number of messages to update: ${Object.keys(messagesStatus).length}, Number of massages in cache: ${
        Object.keys(this.msgCache).length
      }`,
    );
    for (const msgStatus of messagesStatus) {
      try {
        const { msgId, request, messageStatus } = msgStatus;
        const { requestId, status } = messageStatus;
        const isInCache = this.msgCache[requestId];
        if (!isInCache) {
          await this.addMessageToCache(msgStatus);
        } else if (msgId) {
          const cachedMsgId = this.msgCache[requestId].msgId;
          if (cachedMsgId && cachedMsgId != msgId) {
            logger.info(`cachedMsgId: ${cachedMsgId} and msgId: ${msgId} for requestId: ${requestId} are different`);
            const msgIdPrefix = Math.floor(msgId / 1000000);
            const cachedMsgIdPrefix = Math.floor(this.msgCache[messageStatus.requestId].msgId / 1000000);
            if (msgIdPrefix != cachedMsgIdPrefix) {
              // There was a change in the prefix of msgId, invalidating cached msgIds with different prefix
              logger.info(`MsgIdPrefix changed from ${cachedMsgIdPrefix} to ${msgIdPrefix}`);
              for (const key in this.msgCache) {
                if (this.msgCache[key].msgId && Math.floor(this.msgCache[key].msgId / 1000000) != msgIdPrefix) {
                  logger.info(`Invalidating cachedMsgId ${this.msgCache[key].msgId} for requestId: ${key}`);
                  this.msgCache[key].msgId = null;
                }
              }
            }
          }
          logger.info(`Updating cachedMsgId from ${cachedMsgId} to ${msgId} for requestId: ${requestId}`);
          this.msgCache[messageStatus.requestId].msgId = msgId;
        }

        const finalMsgId = this.msgCache[messageStatus.requestId].msgId;
        if (status === 'SIGNED' || status === 'FAILED') {
          logger.info(
            `Got from ${
              msgId === null ? 'customer server' : 'Fireblocks'
            } message with final status: ${status}, latestMsgId ${finalMsgId}, requestId: ${requestId}`,
          );
          // broadcast always and ack only if we have a valid msgId
          broadcastPromises.push(
            fbServerApi.broadcastResponse(messageStatus, request).then(() => {
              if (this.msgCache[messageStatus.requestId]) {
                this.msgCache[messageStatus.requestId].messageStatus = messageStatus;
              }
            }),
          );
          if (finalMsgId) {
            ackPromises.push(
              fbServerApi.ackMessage(finalMsgId).then(() => this.deleteMessageFromCache(messageStatus.requestId)),
            );
          }
        }
      } catch (e) {
        logger.error(
          `Error updating status for message ${msgStatus.msgId} and status ${JSON.stringify(
            msgStatus.messageStatus,
          )}. Error: ${e.message}`,
        );
      }
      if (broadcastPromises.length >= BROADCAST_BATCH_SIZE) {
        logger.info(`Awaiting ack for broadcasting ${broadcastPromises.length} messages`);
        await Promise.all([...broadcastPromises, ...ackPromises]);
        broadcastPromises = ackPromises = [];
      }
    }
    await Promise.all([...broadcastPromises, ...ackPromises]);
  }

  async ackMessages(messagesIds: number[]) {
    try {
      const promises = messagesIds.map((msgId) => fbServerApi.ackMessage(msgId));
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
