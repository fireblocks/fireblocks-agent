import https from 'https';
import { AGENT_REQUESTS_CACHE_SIZE, BROADCAST_BATCH_SIZE } from '../constants';
import {
  DecodedMessage,
  ExtendedMessageStatusCache,
  FBMessageEnvelope,
  MessageEnvelop,
  MessageStatus,
  RequestType,
  InvalidMessage,
} from '../types';
import { decodeAndVerifyMessage } from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import fbServerWsApi from './fb-server-ws.api';
import logger from './logger';

// Messages delivered over the WebSocket must be acked over the same socket
// (MAG keeps the msgId->deliveryTag mapping per connection); otherwise HTTP.
//
// AT-LEAST-ONCE BY DESIGN: the ack rides whichever transport is currently connected.
// Because MAG's msgId->deliveryTag mapping is per-connection, if the socket reconnects
// between a message's delivery and its ack, the ack no-ops on the new connection and MAG
// redelivers the message. The agent then re-signs it; signing is idempotent, so the
// redelivery is harmless. This is an intentional at-least-once guarantee (not a bug) and
// is forward-compatible with a future MAG that supports cross-connection acks.
const ackViaTransport = (msgId: number): Promise<void> =>
  fbServerWsApi.isConnected() ? fbServerWsApi.ackMessage(msgId) : fbServerApi.ackMessage(msgId);

// Sign responses ride the WebSocket when it is connected, else HTTP -- a transport swap only; the
// broadcast still runs concurrently with (and decoupled from) the ack, exactly as before.
//
// ONLY tx-sign responses may use the socket. MAG's WS branch routes every framed broadcast to
// broadcastMsg -- the SAME downstream as the HTTP keylink_tx_sign_response route, so tx-sign is
// safe over WS. KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE MUST stay on HTTP: its HTTP route dispatches
// to a DIFFERENT downstream (zServiceMessageSender), which MAG's broadcastMsg-only WS branch cannot
// reach -- sending it over the socket would mis-route it.
const broadcastViaTransport = (messageStatus: MessageStatus, request: MessageEnvelop): Promise<void> =>
  messageStatus.type === 'KEY_LINK_TX_SIGN_RESPONSE' && fbServerWsApi.isConnected()
    ? fbServerWsApi.broadcastResponse(messageStatus, request)
    : fbServerApi.broadcastResponse(messageStatus, request);

interface IMessageService {
  getPendingMessages(): ExtendedMessageStatusCache[];
  handleMessages(messages: FBMessageEnvelope[], httpsAgent: https.Agent): Promise<void>;
  updateStatus(messagesStatus: ExtendedMessageStatusCache[]): Promise<void>;
}

class MessageService implements IMessageService {
  private msgCache: { [requestId: string]: ExtendedMessageStatusCache } = {};
  // Insertion-ordered set of cached requestIds for O(1) LRU eviction. A Set (not an array)
  // so deleteMessageFromCache can actually remove an entry — the old `delete arr[uuid]` was a
  // no-op on an array indexed by string, which let msgCacheOrder grow unbounded (slow leak).
  private msgCacheOrder: Set<string> = new Set();
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
      // Count individual signatures: each request carries a batch of digests in messagesToSign,
      // so the request count (messagesToHandle.length) is NOT the signature count.
      const signatureCount = messagesToHandle.reduce((sum, msg) => {
        try {
          // digests live in the encoded payload: message.payload (JSON string) -> messagesToSign
          const payload = (msg.request as any)?.message?.payload;
          const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
          return sum + (Array.isArray(parsed?.messagesToSign) ? parsed.messagesToSign.length : 0);
        } catch {
          return sum;
        }
      }, 0);
      logger.info(
        `sending ${messagesToHandle.length} messages (${signatureCount} signatures) to customer server to sign`,
      );
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
    if (this.msgCacheOrder.size >= AGENT_REQUESTS_CACHE_SIZE) {
      // Evict the oldest inserted entry (Set iteration order == insertion order).
      const oldest = this.msgCacheOrder.values().next().value;
      if (oldest !== undefined) {
        this.msgCacheOrder.delete(oldest);
        delete this.msgCache[oldest];
      }
    }

    const requestId = messageStatus.messageStatus.requestId;
    this.msgCache[requestId] = messageStatus;
    // delete-then-add refreshes recency and avoids duplicate keys inflating the set.
    this.msgCacheOrder.delete(requestId);
    this.msgCacheOrder.add(requestId);
    logger.info(`Added message to cache. msgId: ${messageStatus.msgId}, requestId: ${requestId} `);
  }

  async deleteMessageFromCache(requestId: string): Promise<void> {
    delete this.msgCache[requestId];
    this.msgCacheOrder.delete(requestId);
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
            broadcastViaTransport(messageStatus, request).then(() => {
              if (this.msgCache[messageStatus.requestId]) {
                this.msgCache[messageStatus.requestId].messageStatus = messageStatus;
              }
            }),
          );
          if (finalMsgId) {
            ackPromises.push(
              ackViaTransport(finalMsgId).then(() => this.deleteMessageFromCache(messageStatus.requestId)),
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
    // allSettled so one failed ack does not abort the rest of the batch. Failures are logged
    // (an unacked message is simply redelivered by MAG -- at-least-once).
    const results = await Promise.allSettled(messagesIds.map((msgId) => ackViaTransport(msgId)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) {
      logger.error(`Failed to ack ${failed}/${messagesIds.length} message(s)`);
    }
  }

  _clearCache() {
    this.msgCache = {};
    this.msgCacheOrder.clear();
  }
}

export default new MessageService();
