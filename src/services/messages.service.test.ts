import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import { MessageStatus, TxType } from '../types';
import customerServerApi from './customerServer.api';
import service from './messages.service';
import serverApi from './server.api';
import { messageBuilder } from './server.api.test';
const c = new Chance();

describe('messages service', () => {
  beforeEach(() => {
    service._clearCache();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should send the customer server server the messages to sign ', async () => {
    const msgId = c.guid();
    const aTxToSignMessage = messageBuilder.aMessage({
      type: TxType.MPC_START_SIGNING,
      msgId,
    });
    const messageEnvlope = messageBuilder.messageEnvlope({ msgId }, aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([]);

    await service.handleMessages([messageEnvlope]);

    expect(customerServerApi.messagesToSign).toHaveBeenCalledWith([
      { message: aTxToSignMessage, msgId: messageEnvlope.msgId },
    ]);
  });

  it('should ignore non `MPC_START_SIGNING` messages ', async () => {
    const aNonMpcStartSignMessage = messageBuilder.aMessage({
      type: TxType.MPC_STOP_SIGNING,
    });
    const messageEnvlope = messageBuilder.messageEnvlope({}, aNonMpcStartSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign');
    await service.handleMessages([messageEnvlope]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
  });

  it('should get pending messages', async () => {
    const msgId = c.guid();
    const aTxToSignMessage = messageBuilder.aMessage({
      type: TxType.MPC_START_SIGNING,
      msgId,
    });

    const messageEnvlope = messageBuilder.messageEnvlope({ msgId }, aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([
      {
        msgId: aTxToSignMessage.msgId,
        txId: aTxToSignMessage.txId,
        status: 'PENDING_SIGN',
      },
    ]);

    await service.handleMessages([messageEnvlope]);

    const pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([aTxToSignMessage.msgId]);
  });

  it('should report ack on signed tx status update', () => {
    const signedMessageStatus: MessageStatus = {
      msgId: c.guid(),
      txId: c.guid(),
      status: 'SIGNED',
    };

    // @ts-ignore
    jest.spyOn(serverApi, 'ackMessage').mockImplementation(jest.fn);
    service.updateStatus([signedMessageStatus]);

    expect(serverApi.ackMessage).toHaveBeenCalledWith(signedMessageStatus.msgId);
  });
});
