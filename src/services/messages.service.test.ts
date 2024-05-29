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

  const types: TxType[] = ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', 'EXTERNAL_KEY_SIGNING_REQUEST'];
  it.each(types)('should send the customer server the messages to sign', async (type: TxType) => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    const fbMessageEnvlope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, type, aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([]);
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);

    await service.handleMessages([fbMessageEnvlope]);

    expect(customerServerApi.messagesToSign).toHaveBeenCalledWith([
      { message: aTxToSignMessage, msgId: fbMessageEnvlope.msgId, type, payload: fbMessage.payload.payload },
    ]);
  });

  it('should ignore non whitelist messages', async () => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessage();
    //@ts-ignore
    const fbMessage = messageBuilder.fbMessage('UNKNOWN_TYPE', aTxToSignMessage);
    const fbMsgEnvelop = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    //@ts-ignore
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, 'UNKNOWN_TYPE', aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign');
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);
    await service.handleMessages([fbMsgEnvelop]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
  });

  it('should ignore non encoded messages', async () => {
    const aNonEncodedMessage = messageBuilder.fbMessage('KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', messageBuilder.aMessage());
    const messageEnvlope = messageBuilder.fbMsgEnvelope({}, aNonEncodedMessage, false);
    jest.spyOn(customerServerApi, 'messagesToSign');
    await service.handleMessages([messageEnvlope]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
  });

  it('should get pending messages from cache', async () => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    const fbMessageEnvlope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, 'EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([
      {
        msgId,
        requestId: aTxToSignMessage.requestId,
        status: 'PENDING_SIGN',
        payload: fbMessage.payload.payload,
        type: fbMessage.type,
      },
    ]);

    await service.handleMessages([fbMessageEnvlope]);

    const pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([msgId]);
  });

  it('should report ack on signed tx status update', async () => {
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([signedMessageStatus]);

    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(signedMessageStatus.msgId);
  });

  it('should report ack on failed tx status update', async () => {
    const failedMessageStatus = aProofOfOwnershipFailedMessageStatus();
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([failedMessageStatus]);

    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(failedMessageStatus.msgId);
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(failedMessageStatus);
  });

  it('should broadcast result to mobile api gw', async () => {
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.updateStatus([signedMessageStatus]);

    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(signedMessageStatus);
  });

  it('shuold remove acked messages from the cache', async () => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);
    const fbMessageEnvlope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, 'EXTERNAL_KEY_SIGNING_REQUEST', aTxToSignMessage);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);

    const msgStatus: MessageStatus = {
      msgId,
      requestId: aTxToSignMessage.requestId,
      status: 'PENDING_SIGN',
      payload: fbMessage.payload.payload,
      type: fbMessage.type,
    };

    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([msgStatus]);

    await service.handleMessages([fbMessageEnvlope]);
    let pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([msgId]);

    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    msgStatus.status = 'SIGNED';
    await service.updateStatus([msgStatus]);

    pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([]);
  });
});
