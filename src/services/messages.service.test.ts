import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import { MessageStatus, TxType } from '../types';
import * as messagesUtils from '../utils/messages-utils';
import customerServerApi from './customer-server.api';
import fbServerApi from './fb-server.api';
import { aProofOfOwnershipFailedMessageStatus, aProofOfOwnershipSignedMessageStatus, messageBuilder } from './fb-server.api.test';
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

  const types: TxType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', 'EXTERNAL_KEY_SIGNING_REQUEST'];
  it.each(types)('should send the customer server the messages to sign', async (type: TxType) => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, aTxToSignMessage.requestId, type, aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([]);
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);

    await service.handleMessages([fbMessageEnvelope]);

    expect(customerServerApi.messagesToSign).toHaveBeenCalledWith([
      { message: aTxToSignMessage, msgId: fbMessageEnvelope.msgId, requestId: aTxToSignMessage.requestId, type, payload: fbMessage.payload.payload },
    ]);
  });

  it('should ack non whitelist messages', async () => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessage();
    //@ts-ignore
    const fbMessage = messageBuilder.fbMessage('UNKNOWN_TYPE', aTxToSignMessage);
    const fbMsgEnvelop = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    //@ts-ignore
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, "", 'UNKNOWN_TYPE', aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign');
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.handleMessages([fbMsgEnvelop]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
  });

  it('should ignore non encoded messages', async () => {
    const msgId = c.natural();
    const aNonEncodedMessage = messageBuilder.fbMessage('EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST', messageBuilder.aMessage());
    const messageEnvelope = messageBuilder.fbMsgEnvelope({ msgId }, aNonEncodedMessage, false);
    jest.spyOn(customerServerApi, 'messagesToSign');

    await service.handleMessages([messageEnvelope]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
  });

  it('should get pending messages from cache', async () => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, aTxToSignMessage.requestId, 'EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);

    const msgStatus: MessageStatus = {
      requestId: aTxToSignMessage.requestId,
      status: 'PENDING_SIGN',
      payload: fbMessage.payload.payload,
      type: fbMessage.type,
    };

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([msgStatus]);

    await service.handleMessages([fbMessageEnvelope]);

    const pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([{ msgId, messageStatus: msgStatus }]);
  });

  it('should report ack on signed tx status update', async () => {
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    const extendedMessagesStatus = { msgId: c.natural(), messageStatus: signedMessageStatus };
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([extendedMessagesStatus]);

    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(extendedMessagesStatus.msgId);
  });

  it('should report ack on failed tx status update', async () => {
    const failedMessageStatus = aProofOfOwnershipFailedMessageStatus();
    const extendedMessagesStatus = { msgId: c.natural(), messageStatus: failedMessageStatus };
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([extendedMessagesStatus]);

    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(extendedMessagesStatus.msgId);
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(failedMessageStatus);
  });

  it('should broadcast result to mobile api gw', async () => {
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    const extendedMessagesStatus = { msgId: c.natural(), messageStatus: signedMessageStatus };
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.updateStatus([extendedMessagesStatus]);

    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(signedMessageStatus);
  });

  it('should not return acked messages', async () => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, aTxToSignMessage.requestId, 'EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);

    const msgStatus: MessageStatus = {
      requestId: aTxToSignMessage.requestId,
      status: 'PENDING_SIGN',
      payload: fbMessage.payload.payload,
      type: fbMessage.type,
    };

    const extendedMessagesStatus = { msgId, messageStatus: msgStatus };

    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([msgStatus]);

    await service.handleMessages([fbMessageEnvelope]);
    let pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([extendedMessagesStatus]);

    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    extendedMessagesStatus.messageStatus.status = 'SIGNED';
    await service.updateStatus([extendedMessagesStatus]);

    pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([]);
  });

  it('handling msgId changes', async () => {
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);

    const msgId = c.natural();
    const fbMessageEnvelope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, aTxToSignMessage.requestId, 'EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);

    const msgStatus: MessageStatus = {
      requestId: aTxToSignMessage.requestId,
      status: 'PENDING_SIGN',
      payload: fbMessage.payload.payload,
      type: fbMessage.type,
    };

    // Message for the first time
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([msgStatus]);
    await service.handleMessages([fbMessageEnvelope]);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(1);
    let pendingMessages = service.getPendingMessages();
    const extendedMessagesStatus = { msgId, messageStatus: msgStatus };
    expect(pendingMessages).toEqual([extendedMessagesStatus]);

    // Same requestId but different msgId
    const msgId2 = c.natural();
    const fbMessageEnvelope2 = messageBuilder.fbMsgEnvelope({ msgId: msgId2 }, fbMessage);
    const msgEnvelop2 = messageBuilder.anMessageEnvelope(msgId2, aTxToSignMessage.requestId, 'EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop2);

    await service.handleMessages([fbMessageEnvelope2]);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(1);
    pendingMessages = service.getPendingMessages();
    const extendedMessagesStatus2 = { msgId: msgId2, messageStatus: msgStatus };
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
    const fbMessageEnvelope3 = messageBuilder.fbMsgEnvelope({ msgId: msgId3 }, fbMessage);
    const msgEnvelop3 = messageBuilder.anMessageEnvelope(msgId3, aTxToSignMessage.requestId, 'EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop3);
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.handleMessages([fbMessageEnvelope3]);
    expect(customerServerApi.messagesToSign).toHaveBeenCalledTimes(1);
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId3);
  });
});
