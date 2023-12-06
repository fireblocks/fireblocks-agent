import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import { TxType } from '../types';
import customerServerApi from './customerServer.api';
import service from './messages.service';
import { messageBuilder } from './server.api.test';
const c = new Chance();
describe('messages service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send the customer server the tx to sign ', async () => {
    jest.spyOn(customerServerApi, 'txToSign').mockResolvedValue('');
    const aTxToSignMessage = messageBuilder.aMessage({
      type: TxType.MPC_START_SIGNING,
    });
    const messageEnvlope = messageBuilder.messageEnvlope({}, aTxToSignMessage);

    await service.handleMessage(messageEnvlope);

    expect(customerServerApi.txToSign).toHaveBeenCalledWith(aTxToSignMessage);
  });

  it('should ignore non `MPC_START_SIGNING` messages ', async () => {
    jest.spyOn(customerServerApi, 'txToSign').mockResolvedValue('');
    const aNonMpcStartSignMessage = messageBuilder.aMessage({
      type: TxType.MPC_STOP_SIGNING,
    });
    const messageEnvlope = messageBuilder.messageEnvlope(
      {},
      aNonMpcStartSignMessage,
    );

    await service.handleMessage(messageEnvlope);

    expect(customerServerApi.txToSign).not.toBeCalled();
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
