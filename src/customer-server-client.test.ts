import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import service from './customer-server-client';
import customerServerApi from './services/customer-server.api';
import { aProofOfOwnershipSignedMessageStatus } from './services/fb-server.api.test';
import messagesService from './services/messages.service';
const c = new Chance();

describe('Customer server client', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should not fetch tx status when msgIds is empty', async () => {
    jest.spyOn(messagesService, 'getPendingMessages').mockReturnValue([]);
    jest.spyOn(customerServerApi, 'messagesStatus');

    await service.pullMessagesStatus();

    expect(customerServerApi.messagesStatus).not.toHaveBeenCalled();
  });

  it('should fetch tx status every 30 sec', async () => {
    jest.spyOn(messagesService, 'getPendingMessages').mockReturnValue([{ msgId: c.natural(), messageStatus: aProofOfOwnershipSignedMessageStatus() }]);
    //@ts-ignore
    jest.spyOn(customerServerApi, 'messagesStatus').mockImplementation(() => {
      return {
        messages: [],
      };
    });

    //set a response for an empty request
    await service.pullMessagesStatus();
    expect(customerServerApi.messagesStatus).toHaveBeenCalledTimes(1);

    //advance 29 seconds
    await jest.advanceTimersByTimeAsync(29 * 1000);
    expect(customerServerApi.messagesStatus).toHaveBeenCalledTimes(1);

    //pass 30 seconds
    await jest.advanceTimersByTimeAsync(2000);
    expect(customerServerApi.messagesStatus).toHaveBeenCalledTimes(2);
  });
});
