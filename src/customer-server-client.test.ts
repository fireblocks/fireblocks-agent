import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import service from './customer-server-client';
import customerServerApi from './services/customerServer.api';
import { messageBuilder } from './services/server.api.test';

jest.mock('./services/customerServer.api');
describe('Customer server client', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(service, 'start');
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should fetch tx status every 30 sec', async () => {
    //set a reponse for an empty request
    await service.start();
    expect(service.start).toHaveBeenCalledTimes(1);

    //advance 29 seconds
    await jest.advanceTimersByTimeAsync(29 * 1000);
    expect(service.start).toHaveBeenCalledTimes(1);

    //pass 30 secondss
    await jest.advanceTimersByTimeAsync(2000);
    expect(service.start).toHaveBeenCalledTimes(2);
  });

  it('should fetch pending tx', async () => {
    const tx1 = messageBuilder.aMessage();
    const tx2 = messageBuilder.aMessage();
    await service.addTxToSign([tx1, tx2]);

    await service.start();
    expect(customerServerApi.txStatus).toHaveBeenCalledWith({
      txIds: [tx1.txId, tx2.txId],
    });
  });

  it('should send tx to sign on add', () => {
    const tx1 = messageBuilder.aMessage();
    jest.spyOn(customerServerApi, 'txToSign');

    service.addTxToSign([tx1]);

    expect(customerServerApi.txToSign).toHaveBeenCalledWith(tx1);
  });
});
