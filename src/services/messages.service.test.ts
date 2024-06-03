import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Chance from 'chance';
import { MessageStatus, RequestType } from '../types';
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

  const types: RequestType[] = ['KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'];
  it.each(types)('should send the customer server the messages to sign', async (type: RequestType) => {
    const msgId = c.natural();
    const aTxToSignMessage = messageBuilder.aMessagePayload(type);
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbMsgEnvelope(type, { msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, type, fbMessage.payload);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([]);
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);

    await service.handleMessages([fbMessageEnvelope]);

    expect(customerServerApi.messagesToSign).toHaveBeenCalledWith([msgEnvelop]);
  });

  it('should ignore non whitelist messages', async () => {
    const msgId = c.natural();
    const type = 'UNKNOWN_TYPE';
    //@ts-ignore
    const aTxToSignMessage = messageBuilder.aMessagePayload(type);
    //@ts-ignore
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMsgEnvelop = messageBuilder.fbProofOfOwnershipMsgEnvelope({ msgId }, fbMessage);
    //@ts-ignore
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, type, aTxToSignMessage);
    jest.spyOn(customerServerApi, 'messagesToSign');
    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);
    await service.handleMessages([fbMsgEnvelop]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
  });

  it('should ignore non encoded messages', async () => {
    const aNonEncodedMessage = messageBuilder.fbMessage(messageBuilder.aMessagePayload('KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'));
    const messageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({}, aNonEncodedMessage, false);
    jest.spyOn(customerServerApi, 'messagesToSign');
    await service.handleMessages([messageEnvelope]);

    expect(customerServerApi.messagesToSign).not.toBeCalled();
  });

  it('should get pending messages from cache', async () => {
    const msgId = c.natural();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE'
    const aTxToSignMessage = messageBuilder.aMessagePayload(requestType);
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, requestType, fbMessage.payload);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);
    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([
      {
        type: responseType,
        status: 'PENDING_SIGN',
        request: {
          message: fbMessage.payload,
          transportMetadata: {
            type: requestType,
            msgId: fbMessageEnvelope.msgId,
            deviceId: fbMessageEnvelope.deviceId,
            internalMessageId: fbMessageEnvelope.internalMessageId,
          },
        },
        response: {},
      },
    ]);

    await service.handleMessages([fbMessageEnvelope]);

    const pendingMessages = service.getPendingMessages();
    expect(pendingMessages).toEqual([msgId]);
  });

  it('should report ack on signed tx status update', async () => {
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([signedMessageStatus]);

    const { msgId } = signedMessageStatus.request.transportMetadata;
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
  });

  it('should report ack on failed tx status update', async () => {
    const failedMessageStatus = aProofOfOwnershipFailedMessageStatus();
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));

    await service.updateStatus([failedMessageStatus]);

    const { msgId } = failedMessageStatus.request.transportMetadata;
    expect(fbServerApi.ackMessage).toHaveBeenCalledWith(msgId);
    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(failedMessageStatus);
  });

  it('should broadcast result to mobile api gw', async () => {
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    jest.spyOn(fbServerApi, 'broadcastResponse').mockImplementation(jest.fn(() => Promise.resolve()));
    jest.spyOn(fbServerApi, 'ackMessage').mockImplementation(jest.fn(() => Promise.resolve()));
    await service.updateStatus([signedMessageStatus]);

    expect(fbServerApi.broadcastResponse).toHaveBeenCalledWith(signedMessageStatus);
  });

  it('should remove acked messages from the cache', async () => {
    const msgId = c.natural();
    const requestType = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
    const responseType = 'KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE';
    const aTxToSignMessage = messageBuilder.aMessagePayload(requestType);
    const fbMessage = messageBuilder.fbMessage(aTxToSignMessage);
    const fbMessageEnvelope = messageBuilder.fbProofOfOwnershipMsgEnvelope({ msgId }, fbMessage);
    const msgEnvelop = messageBuilder.anMessageEnvelope(msgId, requestType, fbMessage.payload);

    jest.spyOn(messagesUtils, 'decodeAndVerifyMessage').mockReturnValue(msgEnvelop);

    const msgStatus: MessageStatus = {
      type: responseType,
      status: 'PENDING_SIGN',
      request: {
        message: fbMessage.payload,
        transportMetadata: {
          type: requestType,
          msgId: fbMessageEnvelope.msgId,
          deviceId: fbMessageEnvelope.deviceId,
          internalMessageId: fbMessageEnvelope.internalMessageId,
        },
      },
      response: {},
    };

    jest.spyOn(customerServerApi, 'messagesToSign').mockResolvedValue([msgStatus]);

    await service.handleMessages([fbMessageEnvelope]);
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
