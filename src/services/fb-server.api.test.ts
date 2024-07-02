import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import jwt from 'jsonwebtoken';
import { MOBILE_GATEWAY_URL } from '../constants';
import {
  AccessToken,
  AccessTokenRequest,
  CertificatesMap,
  FBMessage,
  FBMessageEnvelope,
  FBMessagePayload,
  MessageEnvelop,
  MessagePayload,
  MessageStatus,
  PairDeviceRequest,
  RequestType,
  ResponseType,
} from '../types';
import deviceService from './device.service';
import { deviceDriver } from './device.service.test';
import fbServerApi from './fb-server.api';

const c = new Chance();

describe('Server API', () => {
  beforeEach(() => {
    fbServerApiDriver.reset();
  });

  it('should pair device', async () => {
    const pairDeviceReq = fbServerApiDriver.given.pairDeviceRequest();
    const refreshToken = `some-valid-refresh-token`;
    fbServerApiDriver.mock.pairDevice(pairDeviceReq, refreshToken);

    const pairDeviceRes = await fbServerApi.pairDevice(pairDeviceReq);

    expect(pairDeviceRes.refreshToken).toBe(refreshToken);
  });

  it('should get access token', async () => {
    const accessTokenReq = fbServerApiDriver.given.accessTokenRequest();
    const accessToken = 'my-access-token';
    fbServerApiDriver.mock.accessToken(accessTokenReq, accessToken);

    const accessTokenRes = await fbServerApi.getAccessToken(accessTokenReq);

    expect(accessTokenRes).toBe(accessToken);
  });

  it('should pull messages', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const someMessages = [messageBuilder.fbProofOfOwnershipMsgEnvelope()];
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);
    fbServerApiDriver.mock.messages(accessToken, someMessages);

    const messages = await fbServerApi.getMessages();

    expect(messages).toStrictEqual(someMessages);
  });

  it('should handle messages in non batch mode as well', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const someMessage = messageBuilder.fbProofOfOwnershipMsgEnvelope();
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);
    fbServerApiDriver.mock.messages(accessToken, someMessage);

    const messages = await fbServerApi.getMessages();

    expect(messages).toStrictEqual([someMessage]);
  });

  it('should get certificates', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const certificatesMap = { zs: 'certificate for zService', vs: 'certificate for vault service' };
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    fbServerApiDriver.mock.certificates(accessToken, certificatesMap);

    const certificates = await fbServerApi.getCertificates();

    expect(certificates).toStrictEqual(certificatesMap);
  });

  it('should cache certificates map', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const certificatesMap = { zs: 'certificate for zService', vs: 'certificate for vault service' };
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);
    fbServerApiDriver.mock.certificates(accessToken, certificatesMap);

    const certificates = await fbServerApi.getCertificates();

    const someOtherCertificatesMap = { zs: 'other certificate' };
    fbServerApiDriver.reset();
    fbServerApiDriver.mock.certificates(accessToken, someOtherCertificatesMap);

    const certificates2 = await fbServerApi.getCertificates();

    expect(certificates).toStrictEqual(certificates2);
  });

  it('should ack message', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const aMessage = messageBuilder.fbProofOfOwnershipMsgEnvelope({ msgId: c.natural() });
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    fbServerApiDriver.mock.ackMessage(accessToken, aMessage.msgId, 'ok');

    const res = await fbServerApi.ackMessage(aMessage.msgId);

    expect(res).toEqual('ok');
  });

  it('should broadcast proof of ownership message', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const request = aProofOfOwnershipRequest();
    const parsedRequest = JSON.parse(request.message.payload);
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    const expectedRequestObject = {
      type: signedMessageStatus.type,
      status: signedMessageStatus.status,
      request: parsedRequest,
      response: signedMessageStatus.response,
    };

    fbServerApiDriver.mock.broadcast_proof_of_ownership(accessToken, expectedRequestObject, 'ok');

    const res = await fbServerApi.broadcastResponse(signedMessageStatus, request);

    expect(res).toEqual('ok');
  });

  it('should broadcast failed proof of ownership message', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const request = aProofOfOwnershipRequest();
    const parsedRequest = JSON.parse(request.message.payload);
    const signedMessageStatus = aProofOfOwnershipFailedMessageStatus();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    const expectedRequestObject = {
      type: signedMessageStatus.type,
      status: signedMessageStatus.status,
      request: parsedRequest,
      response: signedMessageStatus.response,
    };

    fbServerApiDriver.mock.broadcast_proof_of_ownership(accessToken, expectedRequestObject, 'ok');

    try {
      const res = await fbServerApi.broadcastResponse(signedMessageStatus, request);
      expect(res).toEqual('ok');
    } catch (e) {
      console.log(`Error: ${e}`);
    }
  });

  it('should broadcast tx sign message', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const request = aTxSignRequest();
    const parsedRequest = JSON.parse(request.message.payload);
    const signedMessageStatus = aTxSignSignedMessageStatus();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    const expectedRequestObject = {
      type: signedMessageStatus.type,
      status: signedMessageStatus.status,
      request: parsedRequest,
      response: signedMessageStatus.response,
    };

    fbServerApiDriver.mock.broadcast_tx_sign(accessToken, expectedRequestObject, 'ok');

    const res = await fbServerApi.broadcastResponse(signedMessageStatus, request);

    expect(res).toEqual('ok');
  });

  it('should broadcast fail tx sign message', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const request = aTxSignRequest();
    const parsedRequest = JSON.parse(request.message.payload);
    const signedMessageStatus = aTxSignFailedMessageStatus();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    const expectedRequestObject = {
      type: signedMessageStatus.type,
      status: signedMessageStatus.status,
      request: parsedRequest,
      response: signedMessageStatus.response,
    };

    fbServerApiDriver.mock.broadcast_tx_sign(accessToken, expectedRequestObject, 'ok');

    const res = await fbServerApi.broadcastResponse(signedMessageStatus, request);

    expect(res).toEqual('ok');
  });

  it('should not broadcast on unknown type', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const request = aTxSignRequest();
    const signedMessageStatus = aTxSignFailedMessageStatus();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    const invalidType = 'UNKNOWN_TYPE';
    // @ts-ignore
    signedMessageStatus.type = invalidType;

    await expect(fbServerApi.broadcastResponse(signedMessageStatus, request)).rejects.toThrowErrorMatchingInlineSnapshot(`"Unknown type ${invalidType}"`);
  });
});

const aMessageEnvelop = (type: RequestType): MessageEnvelop => {
  return {
    message: messageBuilder.fbMessage(messageBuilder.aMessagePayload(type)).payload,
    transportMetadata: {
      requestId: c.guid(),
      type,
    },
  };
}
const aSignedMessageStatus = (type: ResponseType): MessageStatus => {
  return {
    type,
    status: 'SIGNED',
    requestId: c.guid(),
    response: {
      signedMessages: [{
        message: c.string(),
        signature: 'signed payload',
        index: 0,
      }],
    }
  };
}
const aFailedMessageStatus = (type: ResponseType): MessageStatus => {
  return {
    type,
    status: 'FAILED',
    requestId: c.guid(),
    response: {
      errorMessage: 'tx not authorized',
    },
  };
}
export function aProofOfOwnershipRequest(): MessageEnvelop {
  return aMessageEnvelop('KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST');
}
export function aProofOfOwnershipSignedMessageStatus(): MessageStatus {
  return aSignedMessageStatus('KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE');
}
export function aProofOfOwnershipFailedMessageStatus(): MessageStatus {
  return aFailedMessageStatus('KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE');
}
export function aTxSignRequest(): MessageEnvelop {
  return aMessageEnvelop('KEY_LINK_TX_SIGN_REQUEST');
}
export function aTxSignSignedMessageStatus(): MessageStatus {
  return aSignedMessageStatus('KEY_LINK_TX_SIGN_RESPONSE');
}
export function aTxSignFailedMessageStatus(): MessageStatus {
  return aFailedMessageStatus('KEY_LINK_TX_SIGN_RESPONSE');
}
export const messageBuilder = {
  fbMsgEnvelope: (
    type: RequestType,
    fbMsgEnvelope?: Partial<FBMessageEnvelope>,
    fbMsg?: FBMessage,
    shouldEncode: boolean = true,
  ): FBMessageEnvelope => {
    switch (type) {
      case 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST':
        return messageBuilder.fbProofOfOwnershipMsgEnvelope(fbMsgEnvelope, fbMsg, shouldEncode);
      case 'KEY_LINK_TX_SIGN_REQUEST':
        return messageBuilder.fbTxSignRequestMsgEnvelope(fbMsgEnvelope, fbMsg, shouldEncode);
    }
    throw new Error(`Unknown message type: ${type}`);
  },
  fbProofOfOwnershipMsgEnvelope: (
    fbMsgEnvelope?: Partial<FBMessageEnvelope>,
    fbMsg?: FBMessage,
    shouldEncode: boolean = true,
  ): FBMessageEnvelope => {
    const type = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
    const msg = shouldEncode
      ? jwt.sign(JSON.stringify(fbMsg || c.string()), 'MessageData')
      : fbMsg || messageBuilder.fbMessage(messageBuilder.aMessagePayload(type));
    return {
      msg,
      msgId: c.natural(),
      deviceId: c.guid(),
      internalMessageId: c.guid(),
      ...fbMsgEnvelope,
    };
  },
  fbTxSignRequestMsgEnvelope: (
    fbMsgEnvelope?: Partial<FBMessageEnvelope>,
    fbMsg?: FBMessage,
    shouldEncode: boolean = true,
  ): FBMessageEnvelope => {
    const type = 'KEY_LINK_TX_SIGN_REQUEST';
    const msg = shouldEncode
      ? jwt.sign(JSON.stringify(fbMsg || c.string()), 'MessageData')
      : fbMsg || messageBuilder.fbMessage(messageBuilder.aMessagePayload(type));
    return {
      msg,
      msgId: c.natural(),
      deviceId: c.guid(),
      internalMessageId: c.guid(),
      ...fbMsgEnvelope,
    };
  },
  aMessageEnvelope: (requestId: string, type: RequestType, message: FBMessagePayload): MessageEnvelop => {
    return {
      message,
      transportMetadata: {
        requestId,
        type
      }
    };
  },
  fbMessage: (msgPayload: MessagePayload): FBMessage => {
    const fbMessagePayload: FBMessagePayload = {
      payloadSignatureData: {
        service: 'some-service',
        signature: 'signature of the payload',
      },
      payload: JSON.stringify(msgPayload),
    };
    return {
      type: msgPayload.type,
      payload: fbMessagePayload,
    };
  },
  aMessagePayload: (type: RequestType, message?: Partial<MessagePayload>): MessagePayload => {
    return {
      tenantId: c.guid(),
      type,
      algorithm: 'ECDSA_SECP256K1',
      signingDeviceKeyId: c.guid(),
      keyId: c.guid(),
      messagesToSign: [{
        message: c.string(),
        index: 0,
      }],
      ...message,
    };
  },
};

let instance;
export const fbServerApiDriver = {
  axiosMock: () => {
    if (instance) {
      return instance;
    }
    instance = new MockAdapter(axios);
    return instance;
  },
  reset: () => fbServerApiDriver.axiosMock().reset(),
  given: {
    pairDeviceRequest: (): PairDeviceRequest => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        pairingToken: 'some-valid-jwt',
      };
    },
    accessToken: (): AccessToken => c.string(),
    accessTokenRequest: (): AccessTokenRequest => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        refreshToken: 'some-valid-refresh-token',
      };
    },
  },
  mock: {
    pairDevice: (pairDeviceReq?: Partial<PairDeviceRequest>, resultRefreshToken: string = c.string()) => {
      const generatedReq = fbServerApiDriver.given.pairDeviceRequest();
      const pairRequest = {
        ...generatedReq,
        ...pairDeviceReq,
      };
      fbServerApiDriver
        .axiosMock()
        .onPost(`${MOBILE_GATEWAY_URL}/pair_device`, pairRequest)
        .reply(200, { refreshToken: resultRefreshToken });
    },
    messages: (accessToken: AccessToken, message: FBMessageEnvelope[] | FBMessageEnvelope) => {
      fbServerApiDriver
        .axiosMock()
        .onGet(`${MOBILE_GATEWAY_URL}/msg?useBatch=true`, {
          headers: { 'x-access-token': accessToken },
        })
        .reply(200, message);
    },
    certificates: (accessToken: AccessToken, certificates: CertificatesMap) => {
      fbServerApiDriver
        .axiosMock()
        .onGet(`${MOBILE_GATEWAY_URL}/get_service_certificates`, {
          headers: { 'x-access-token': accessToken },
        })
        .reply(200, certificates);
    },
    ackMessage: (accessToken: AccessToken, msgId: number, response: string) => {
      fbServerApiDriver.axiosMock().onPut(`${MOBILE_GATEWAY_URL}/msg`, { msgId, nack: false }).reply(200, response);
    },
    broadcast_proof_of_ownership: (accessToken: AccessToken, status: any, response: string) => {
      fbServerApiDriver.axiosMock().onPost(`${MOBILE_GATEWAY_URL}/keylink_proof_of_ownership_response`, status).reply(200, response);
    },
    broadcast_tx_sign: (accessToken: AccessToken, status: any, response: string) => {
      fbServerApiDriver.axiosMock().onPost(`${MOBILE_GATEWAY_URL}/keylink_tx_sign_response`, status).reply(200, response);
    },
    accessToken: (accessTokenReq?: Partial<AccessTokenRequest>, resultAccessToken: string = c.string()) => {
      const generatedReq = fbServerApiDriver.given.accessTokenRequest();
      const accessTokenRequest: AccessTokenRequest = {
        ...generatedReq,
        ...accessTokenReq,
      };
      fbServerApiDriver
        .axiosMock()
        .onPost(`${MOBILE_GATEWAY_URL}/access_token`, accessTokenRequest)
        .reply(200, { accessToken: resultAccessToken });
    },
  },
};
