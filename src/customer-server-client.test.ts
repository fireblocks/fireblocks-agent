import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import service from './customer-server-client';
import customerServerApi from './services/customer-server.api';
import { messageBuilder } from './services/fb-server.api.test';
import messagesService from './services/messages.service';
import { MessageStatus } from './types';
const c = new Chance();

describe('Customer server client', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should fetch tx status when msgIds is empty', async () => {
    jest.spyOn(messagesService, 'getPendingMessages').mockReturnValue([]);
    jest.spyOn(customerServerApi, 'messagesStatus');

    await service.pullMessagesStatus();

    expect(customerServerApi.messagesStatus).toHaveBeenCalledTimes(1);
  });

  it('should fetch tx status every 30 sec', async () => {
    const requestId = c.guid();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE'
    const aTxToSignMessage = messageBuilder.aMessagePayload(requestType, { requestId });
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const msgEnvelop = messageBuilder.aMessageEnvelope(requestId, requestType, fbMessage.payload);
    const messageStatus: MessageStatus = {
      type: responseType,
      status: 'PENDING_SIGN',
      requestId,
      response: {},
    };
    jest.spyOn(messagesService, 'getPendingMessages').mockReturnValue([{ messageStatus, msgId: c.natural(), request: msgEnvelop }]);
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
