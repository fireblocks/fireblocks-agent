import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import CustomerClient from './customer-server-client';
import { customerServerApiDriver } from './services/customerServer.api.test';
import { messageBuilder } from './services/server.api.test';

describe('Customer server client', () => {
  let service;
  beforeEach(() => {
    const req = customerServerApiDriver.given.aTxStatusRequest();
    //set a reponse for an empty request
    customerServerApiDriver.mock.txStatus(req);
    service = new CustomerClient();
    jest.spyOn(service, 'startPullMessagesLoop');
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should fetch tx status every 30 sec', async () => {
    //advance 29 seconds
    await jest.advanceTimersByTimeAsync(29 * 1000);
    expect(service.startPullMessagesLoop).toHaveBeenCalledTimes(0);

    //pass 30 secondss
    await jest.advanceTimersByTimeAsync(2000);
    expect(service.startPullMessagesLoop).toHaveBeenCalledTimes(1);
  });

  it('should fetch pending tx', async () => {
    const tx1 = messageBuilder.aMessage();
    const tx2 = messageBuilder.aMessage();
    service.addTxToSign([tx1, tx2]);
    //set validator that a call will be issued w/ the following body
    customerServerApiDriver.mock.txStatus({ txIds: [tx1.txId, tx2.txId] });

    //advance 30 seconds to ensure a call to txStatus
    expect(service.startPullMessagesLoop).toHaveBeenCalledTimes(0);
    await jest.advanceTimersByTimeAsync(31 * 1000);
    expect(service.startPullMessagesLoop).toHaveBeenCalledTimes(1);
  });
});
