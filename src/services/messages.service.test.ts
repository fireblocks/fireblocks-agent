import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import { MessageStatus, TxType } from '../types';
import * as messagesUtils from '../utils/messages-utils';
import customerServerApi from './customerServer.api';
import service from './messages.service';
import serverApi from './server.api';
import { messageBuilder } from './server.api.test';
const c = new Chance();
describe('messages service', () => {
  beforeEach(() => {
    service._clearCache();
    jest.spyOn(serverApi, 'getCertificates').mockResolvedValue({});
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  const types: TxType[] = ['EXTERNAL_KEY_PROOF_OF_OWNERSHIP', 'TX'];
  it.each(types)('should send the customer server the messages to sign', async (type: TxType) => {
    const msgId = c.guid();
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('TX', aTxToSignMessage);
    const fbMessageEnvlope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, type, aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([]);
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);

    await service.handleMessages([fbMessageEnvlope]);

    expect(customerServerApi.messagesToSign).toHaveBeenCalledWith([
      { message: aTxToSignMessage, msgId: fbMessageEnvlope.msgId, type },
    ]);
  });

  it('should ignore non whitelist messages', async () => {
    const msgId = c.guid();
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
    const aNonEncodedMessage = {};
    const messageEnvlope = messageBuilder.fbMsgEnvelope({}, aNonEncodedMessage, false);
    jest.spyOn(customerServerApi, 'messagesToSign');
    await service.handleMessages([messageEnvlope]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
  });

  it('should get pending messages', async () => {
    const msgId = c.guid();
    const aTxToSignMessage = messageBuilder.aMessage();
    const fbMessage = messageBuilder.fbMessage('TX', aTxToSignMessage);
    const fbMessageEnvlope = messageBuilder.fbMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, 'TX', aTxToSignMessage);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([
      {
        msgId,
        requestId: aTxToSignMessage.requestId,
        status: 'PENDING_SIGN',
      },
    ]);

    await service.handleMessages([fbMessageEnvlope]);

    const pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([msgId]);
  });

  it('should report ack on signed tx status update', () => {
    const signedMessageStatus: MessageStatus = {
      msgId: c.guid(),
      requestId: c.guid(),
      status: 'SIGNED',
    };

    // @ts-ignore
    jest.spyOn(serverApi, 'ackMessage').mockImplementation(jest.fn);
    // @ts-ignore
    jest.spyOn(serverApi, 'broadcast').mockImplementation(jest.fn);

    service.updateStatus([signedMessageStatus]);

    expect(serverApi.ackMessage).toHaveBeenCalledWith(signedMessageStatus.msgId);
  });

  it('should broadcast result to mobile api gw', async () => {
    const signedMessageStatus: MessageStatus = {
      msgId: c.guid(),
      requestId: c.guid(),
      status: 'SIGNED',
    };

    jest.spyOn(serverApi, 'broadcast').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(serverApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.updateStatus([signedMessageStatus]);

    expect(serverApi.broadcast).toHaveBeenCalledWith(signedMessageStatus);
  });
});
