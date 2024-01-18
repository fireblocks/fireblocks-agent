import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import service from './customer-server-client';
import customerServerApi from './services/customer-server.api';

describe('Customer server client', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should fetch tx status every 30 sec', async () => {
    //@ts-ignore
    jest.spyOn(customerServerApi, 'messagesStatus').mockImplementation(() => {
      return {
        messages: [],
      };
    });

    //set a reponse for an empty request
    await service.pullMessagesStatus();
    expect(customerServerApi.messagesStatus).toHaveBeenCalledTimes(1);

    //advance 29 seconds
    await jest.advanceTimersByTimeAsync(29 * 1000);
    expect(customerServerApi.messagesStatus).toHaveBeenCalledTimes(1);

    //pass 30 secondss
    await jest.advanceTimersByTimeAsync(2000);
    expect(customerServerApi.messagesStatus).toHaveBeenCalledTimes(2);
  });

});
