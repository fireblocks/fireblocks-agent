import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import { ExtendedMessageStatusCache, MessageStatus, RequestType } from '../types';
import * as messagesUtils from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import fbServerWsApi from './fb-server-ws.api';
import {
  aProofOfOwnershipFailedMessageStatus,
  aProofOfOwnershipRequest,
  aProofOfOwnershipSignedMessageStatus,
  aTxSignRequest,
  aTxSignSignedMessageStatus,
  messageBuilder,
} from './fb-server.api.test';
import service from './messages.service';
import https from 'https';

const c = new Chance();
const httpsAgent = new https.Agent();

describe('messages service', () => {
  beforeEach(() => {
    service._clearCache();
    jest.spyOn(fbServerApi, 'getCertificates').mockResolvedValue({});
  });
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const types: RequestType[] = ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'KEY_LINK_TX_SIGN_REQUEST'];
  it.each(types)('should send the customer server the messages to sign', async (type: RequestType) => {
    const requestId = c.guid();
    const aTxToSignMessage = messageBuilder.aMessagePayload(type);
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbMsgEnvelope(type, {}, fbMessage);
    const msgEnvelop = messageBuilder.aMessageEnvelope(requestId, type, fbMessage.payload);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([]);
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ request: msgEnvelop, msgId: c.natural() });

    await service.handleMessages([fbMessageEnvelope], httpsAgent);

    expect(customerServerApi.messagesToSign).toHaveBeenCalledWith([msgEnvelop], httpsAgent);
  });

  it('should ack non whitelist messages', async () => {
    const requestId = c.guid();
    const msgId = c.natural();
    const type = 'UNKNOWN_TYPE';
    //@ts-ignore
    const aTxToSignMessage = messageBuilder.aMessagePayload(type);
    //@ts-ignore
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMsgEnvelop = messageBuilder.fbProofOfOwnershipMsgEnvelope({}, fbMessage);
    //@ts-ignore
    const msgEnvelop = messageBuilder.aMessageEnvelope(requestId, type, aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign');
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ request: msgEnvelop, msgId });
    await service.handleMessages([fbMsgEnvelop], httpsAgent);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
  });

  it('should ack non/badly encoded messages', async () => {
    const aNonEncodedMessage = messageBuilder.fbMessage(
      messageBuilder.aMessagePayload('KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'),
    );
    const messageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({}, aNonEncodedMessage, false);
    jest.spyOn(customerServerApi, 'messagesToSign');
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.handleMessages([messageEnvelope], httpsAgent);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(messageEnvelope.msgId);
  });

  it('should get pending messages from cache', async () => {
    const requestId = c.guid();
    const msgId = c.natural();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE';
    const aTxToSignMessage = messageBuilder.aMessagePayload(requestType, { requestId });
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({}, fbMessage);
    const msgEnvelop = messageBuilder.aMessageEnvelope(requestId, requestType, fbMessage.payload);
    const messageStatus: MessageStatus = {
      type: responseType,
      status: 'PENDING_SIGN',
      requestId,
      response: {},
    };

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ request: msgEnvelop, msgId });
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([messageStatus]);

    await service.handleMessages([fbMessageEnvelope], httpsAgent);

    const pendingMessages: ExtendedMessageStatusCache[] = service.getPendingMessages();
    expect(pendingMessages).toEqual([{ messageStatus, msgId, request: msgEnvelop }]);
  });

  it('should report ack on signed tx status update', async () => {
    const msgId = c.natural();
    const request = aProofOfOwnershipRequest();
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    const extendedMessageStatusCache: ExtendedMessageStatusCache = {
      messageStatus: signedMessageStatus,
      msgId,
      request,
    };

    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.updateStatus([extendedMessageStatusCache]);
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(signedMessageStatus, request);
  });

  it('should report ack on failed tx status update', async () => {
    const msgId = c.natural();
    const request = aProofOfOwnershipRequest();
    const failedMessageStatus = aProofOfOwnershipFailedMessageStatus();
    const extendedMessageStatusCache: ExtendedMessageStatusCache = {
      messageStatus: failedMessageStatus,
      msgId,
      request,
    };

    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.updateStatus([extendedMessageStatusCache]);
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(failedMessageStatus, request);
  });

  it('routes a SIGNED tx-sign response over the WebSocket when connected (broadcast AND ack both on WS)', async () => {
    const msgId = c.natural();
    const request = aTxSignRequest();
    const signedMessageStatus = aTxSignSignedMessageStatus();
    const extendedMessageStatusCache: ExtendedMessageStatusCache = {
      messageStatus: signedMessageStatus,
      msgId,
      request,
    };

    jest.spyOn(fbServerWsApi, 'isConnected').mockReturnValue(true);
    jest.spyOn(fbServerWsApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerWsApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([extendedMessageStatusCache]);

    // tx-sign broadcast rides the socket, not HTTP ...
    expect(fbServerWsApi.broadcastResponse).toHaveBeenCalledWith(signedMessageStatus, request);
    expect(fbServerApi.broadcastResponse).not.toHaveBeenCalled();
    // ... and both a broadcast AND an ack are issued for a SIGNED status (behaviour unchanged; ack on WS too)
    expect(fbServerWsApi.ackMessage).toHaveBeenCalledWith(msgId);
    expect(fbServerApi.ackMessage).not.toHaveBeenCalled();
  });

  it('falls back to HTTP for a SIGNED tx-sign response when the WebSocket is not connected', async () => {
    const msgId = c.natural();
    const request = aTxSignRequest();
    const signedMessageStatus = aTxSignSignedMessageStatus();
    const extendedMessageStatusCache: ExtendedMessageStatusCache = {
      messageStatus: signedMessageStatus,
      msgId,
      request,
    };

    jest.spyOn(fbServerWsApi, 'isConnected').mockReturnValue(false);
    jest.spyOn(fbServerWsApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([extendedMessageStatusCache]);

    // broadcast AND ack both fall back to HTTP when the socket is down
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(signedMessageStatus, request);
    expect(fbServerWsApi.broadcastResponse).not.toHaveBeenCalled();
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
  });

  it('always broadcasts a proof-of-ownership response over HTTP even when the WebSocket is connected', async () => {
    const msgId = c.natural();
    const request = aProofOfOwnershipRequest();
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    const extendedMessageStatusCache: ExtendedMessageStatusCache = {
      messageStatus: signedMessageStatus,
      msgId,
      request,
    };

    jest.spyOn(fbServerWsApi, 'isConnected').mockReturnValue(true);
    jest.spyOn(fbServerWsApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerWsApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([extendedMessageStatusCache]);

    // proof-of-ownership MUST stay on HTTP: MAG's broadcastMsg-only WS branch can't reach its
    // downstream (zServiceMessageSender), so it is never sent over the socket.
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(signedMessageStatus, request);
    expect(fbServerWsApi.broadcastResponse).not.toHaveBeenCalled();
  });

  it('should remove acked messages from the cache', async () => {
    const requestId = c.guid();
    const msgId = c.natural();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE';
    const aTxToSignMessage = messageBuilder.aMessagePayload(requestType, { requestId });
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({}, fbMessage);
    const msgEnvelop = messageBuilder.aMessageEnvelope(requestId, requestType, fbMessage.payload);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ request: msgEnvelop, msgId });

    const msgStatus: MessageStatus = {
      type: responseType,
      status: 'PENDING_SIGN',
      requestId,
      response: {},
    };

    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([msgStatus]);

    await service.handleMessages([fbMessageEnvelope], httpsAgent);
    let pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([{ msgId, messageStatus: msgStatus, request: msgEnvelop }]);

    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    msgStatus.status = 'SIGNED';
    await service.updateStatus([{ request: msgEnvelop, msgId, messageStatus: msgStatus }]);

    pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([]);
  });

  it('handling msgId changes', async () => {
    const requestId = c.guid();
    const msgId = c.natural();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE';
    const aTxToSignMessage = messageBuilder.aMessagePayload(requestType, { requestId });
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({}, fbMessage);
    const msgEnvelop = messageBuilder.aMessageEnvelope(requestId, requestType, fbMessage.payload);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ request: msgEnvelop, msgId });

    const msgStatus: MessageStatus = {
      type: responseType,
      status: 'PENDING_SIGN',
      requestId,
      response: {},
    };

    // Message for the first time
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([msgStatus]);
    await service.handleMessages([fbMessageEnvelope], httpsAgent);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(1);
    let pendingMessages = service.getPendingMessages();
    const extendedMessagesStatus: ExtendedMessageStatusCache = { msgId, messageStatus: msgStatus, request: msgEnvelop };
    expect(pendingMessages).toEqual([extendedMessagesStatus]);

    // Same requestId but different msgId
    const msgId2 = c.natural();
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ request: msgEnvelop, msgId: msgId2 });

    await service.handleMessages([fbMessageEnvelope], httpsAgent);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(1);
    pendingMessages = service.getPendingMessages();
    const extendedMessagesStatus2: ExtendedMessageStatusCache = {
      msgId: msgId2,
      messageStatus: msgStatus,
      request: msgEnvelop,
    };
    expect(pendingMessages).toEqual([extendedMessagesStatus2]);

    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    // Update status to signed message
    extendedMessagesStatus2.messageStatus.status = 'SIGNED';
    await service.updateStatus([extendedMessagesStatus2]);
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId2);

    pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([]);

    // Same requestId but different msgId after signed
    const msgId3 = c.natural();
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ msgId: msgId3, request: msgEnvelop });
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.handleMessages([fbMessageEnvelope], httpsAgent);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(2); // called again since message was deleted from cache after ack
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId3);
  });

  it('got same unexpected status from customer server in response to messagesToSign', async () => {
    const requestId = c.guid();
    const msgId = c.natural();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE';
    const aTxToSignMessage = messageBuilder.aMessagePayload(requestType, { requestId });
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({}, fbMessage);
    const msgEnvelop = messageBuilder.aMessageEnvelope(requestId, requestType, fbMessage.payload);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ request: msgEnvelop, msgId });

    const msgStatus: MessageStatus = {
      type: responseType,
      status: 'SIGNED',
      requestId,
      response: {},
    };

    const msgStatus2: MessageStatus = {
      type: responseType,
      status: 'SIGNED',
      requestId: c.guid(),
      response: {},
    };

    const msgStatus3: MessageStatus = {
      type: responseType,
      status: 'INVALID' as any,
      requestId: c.guid(),
      response: {},
    };

    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([msgStatus2, msgStatus3, msgStatus]);
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.handleMessages([fbMessageEnvelope], httpsAgent);

    // Verify the agent ignores a message it didn't asked for
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(msgStatus, msgEnvelop);
  });

  it('bounds the request cache via LRU eviction (msgCacheOrder no longer leaks)', async () => {
    const ORIGINAL = process.env.AGENT_REQUESTS_CACHE_SIZE;
    try {
      // Fresh module graph with a tiny cache so the bound is observable.
      jest.resetModules();
      process.env.AGENT_REQUESTS_CACHE_SIZE = '3';
      const freshService = require('./messages.service').default;

      const makeEntry = (requestId: string): ExtendedMessageStatusCache => ({
        msgId: c.natural(),
        request: aProofOfOwnershipRequest(),
        messageStatus: {
          type: 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE',
          status: 'PENDING_SIGN',
          requestId,
          response: {},
        },
      });

      for (let i = 0; i < 10; i++) {
        await freshService.addMessageToCache(makeEntry(`req-${i}`));
      }

      const pending = freshService.getPendingMessages();
      // Bounded to the configured size; the old delete-by-uuid no-op would have grown unbounded.
      expect(pending.length).toBe(3);
      // LRU keeps the most-recent entries and evicts the oldest.
      expect(pending.map((p) => p.messageStatus.requestId).sort()).toEqual(['req-7', 'req-8', 'req-9']);
    } finally {
      if (ORIGINAL === undefined) {
        delete process.env.AGENT_REQUESTS_CACHE_SIZE;
      } else {
        process.env.AGENT_REQUESTS_CACHE_SIZE = ORIGINAL;
      }
      jest.resetModules();
    }
  });
});
