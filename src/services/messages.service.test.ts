import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import client from '../customer-server-client';
import { TxType } from '../types';
import service from './messages.service';
import { messageBuilder } from './server.api.test';
jest.mock('../customer-server-client');
const c = new Chance();

describe('messages service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send the customer server client the tx to sign ', async () => {
    const aTxToSignMessage = messageBuilder.aMessage({
      type: TxType.MPC_START_SIGNING,
    });
    const messageEnvlope = messageBuilder.messageEnvlope({}, aTxToSignMessage);

    await service.handleMessage(messageEnvlope);

    expect(client.addTxToSign).toHaveBeenCalledWith([aTxToSignMessage]);
  });

  it('should ignore non `MPC_START_SIGNING` messages ', async () => {
    const aNonMpcStartSignMessage = messageBuilder.aMessage({
      type: TxType.MPC_STOP_SIGNING,
    });
    const messageEnvlope = messageBuilder.messageEnvlope(
      {},
      aNonMpcStartSignMessage,
    );

    await service.handleMessage(messageEnvlope);

    expect(client.addTxToSign).not.toBeCalled();
  });

  //   it('should ack message upon receving ', async () => {
  //     jest.spyOn(serverApi, 'ackMessage').mockResolvedValue('');
  //     const aMessage = messageBuilder.aMessage({ msgId: c.guid() });
  //     const accessToken = serverApiDriver.given.accessToken();

  //     await service.handleMessage(aMessage, accessToken);

  //     expect(serverApi.ackMessage).toHaveBeenCalledWith(
  //       aMessage.msgId,
  //       accessToken,
  //     );
  //   });
});
