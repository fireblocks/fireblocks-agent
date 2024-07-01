import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import { ExtendedMessageStatus, MessageStatus, RequestType } from '../types';
import * as messagesUtils from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import { aProofOfOwnershipFailedMessageStatus, aProofOfOwnershipRequest, aProofOfOwnershipSignedMessageStatus, messageBuilder } from './fb-server.api.test';
import service from './messages.service';

const c = new Chance();

describe('messages service', () => {
  beforeEach(() => {
    service._clearCache();
    jest.spyOn(fbServerApi, 'getCertificates').mockResolvedValue({});
  });
  afterEach(() => {
    jest.clearAllMocks();
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

    await service.handleMessages([fbMessageEnvelope]);

    expect(customerServerApi.messagesToSign).toHaveBeenCalledWith([msgEnvelop]);
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
    await service.handleMessages([fbMsgEnvelop]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
  });

  it('should ignore non encoded messages', async () => {
    const aNonEncodedMessage = messageBuilder.fbMessage(messageBuilder.aMessagePayload('KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'));
    const messageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({}, aNonEncodedMessage, false);
    jest.spyOn(customerServerApi, 'messagesToSign');
    await service.handleMessages([messageEnvelope]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
  });

  it('should get pending messages from cache', async () => {
    const requestId = c.guid();
    const msgId = c.natural();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE'
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

    await service.handleMessages([fbMessageEnvelope]);

    const pendingMessages: ExtendedMessageStatus[] = service.getPendingMessages();
    expect(pendingMessages).toEqual([{ messageStatus, msgId, request: msgEnvelop }]);
  });

  it('should report ack on signed tx status update', async () => {
    const msgId = c.natural();
    const request = aProofOfOwnershipRequest();
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    const extendedMessageStatus: ExtendedMessageStatus = {
      messageStatus: signedMessageStatus,
      msgId,
      request,
    };

    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.updateStatus([extendedMessageStatus]);
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(signedMessageStatus, request);
  });

  it('should report ack on failed tx status update', async () => {
    const msgId = c.natural();
    const request = aProofOfOwnershipRequest();
    const failedMessageStatus = aProofOfOwnershipFailedMessageStatus();
    const extendedMessageStatus: ExtendedMessageStatus = {
      messageStatus: failedMessageStatus,
      msgId,
      request,
    };

    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.updateStatus([extendedMessageStatus]);
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(failedMessageStatus, request);
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

    await service.handleMessages([fbMessageEnvelope]);
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
    await service.handleMessages([fbMessageEnvelope]);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(1);
    let pendingMessages = service.getPendingMessages();
    const extendedMessagesStatus: ExtendedMessageStatus = { msgId, messageStatus: msgStatus, request: msgEnvelop };
    expect(pendingMessages).toEqual([extendedMessagesStatus]);

    // Same requestId but different msgId
    const msgId2 = c.natural();
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue({ request: msgEnvelop, msgId: msgId2 });

    await service.handleMessages([fbMessageEnvelope]);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(1);
    pendingMessages = service.getPendingMessages();
    const extendedMessagesStatus2: ExtendedMessageStatus = { msgId: msgId2, messageStatus: msgStatus, request: msgEnvelop };
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

    await service.handleMessages([fbMessageEnvelope]);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(1);
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId3);
  });
});
