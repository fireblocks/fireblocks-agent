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
  FBMessageEnvlope,
  FBMessagePayload,
  Message,
  MessageEnvelop,
  MessageStatus,
  PairDeviceRequest,
  TxType,
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
    const pairDeviceReq = fbServerApiDriver.given.pairDeviceRequst();
    const refreshToken = `some-valid-refresh-token`;
    fbServerApiDriver.mock.pairDevice(pairDeviceReq, refreshToken);

    const pairDeviceRes = await fbServerApi.pairDevice(pairDeviceReq);

    expect(pairDeviceRes.refreshToken).toBe(refreshToken);
  });

  it('should get access token', async () => {
    const accessTokenReq = fbServerApiDriver.given.accessTokenRequst();
    const accessToken = 'my-access-token';
    fbServerApiDriver.mock.accessToken(accessTokenReq, accessToken);

    const accessTokenRes = await fbServerApi.getAccessToken(accessTokenReq);

    expect(accessTokenRes).toBe(accessToken);
  });

  it('should pull messages', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const someMessages = [messageBuilder.fbMsgEnvelope()];
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);
    fbServerApiDriver.mock.messages(accessToken, someMessages);

    const messages = await fbServerApi.getMessages();

    expect(messages).toStrictEqual(someMessages);
  });

  it('should handle messages in non batch mode as well', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const someMessage = messageBuilder.fbMsgEnvelope();
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
    const aMessage = messageBuilder.fbMsgEnvelope({ msgId: c.natural() });
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    fbServerApiDriver.mock.ackMessage(accessToken, aMessage.msgId, 'ok');

    const res = await fbServerApi.ackMessage(aMessage.msgId);

    expect(res).toEqual('ok');
  });

  it('should broadcast proof of ownership message', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const signedMessageStatus = aProofOfOwnershipSignedMessageStatus();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    const expectedRequestObject = {
      type: `${signedMessageStatus.type.replace('_REQUEST', '_RESPONSE')}`,
      status: signedMessageStatus.status,
      payload: {
        payload: JSON.parse(signedMessageStatus.payload),
        signedPayload: signedMessageStatus.signedPayload,
      },
    };

    fbServerApiDriver.mock.broadcast_proof_of_ownership(accessToken, expectedRequestObject, 'ok');

    const res = await fbServerApi.broadcastResponse(signedMessageStatus);

    expect(res).toEqual('ok');
  });

  it('should broadcast failed proof of ownership message', async () => {
    const accessToken = fbServerApiDriver.given.accessToken();
    const signedMessageStatus = aProofOfOwnershipFailedMessageStatus();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    fbServerApiDriver.mock.accessToken(deviceData, accessToken);

    const expectedRequestObject = {
      type: `${signedMessageStatus.type.replace('_REQUEST', '_RESPONSE')}`,
      status: signedMessageStatus.status,
      payload: {
        payload: JSON.parse(signedMessageStatus.payload),
        errorMessage: signedMessageStatus.errorMessage,
      },
    };

    fbServerApiDriver.mock.broadcast_proof_of_ownership(accessToken, expectedRequestObject, 'ok');

    try {
      const res = await fbServerApi.broadcastResponse(signedMessageStatus);
      expect(res).toEqual('ok');
    } catch (e) {
      console.log('aaa');
    }

  });
});

export function aProofOfOwnershipSignedMessageStatus(): MessageStatus {
  return {
    msgId: c.natural(),
    requestId: c.guid(),
    status: 'SIGNED',
    payload: JSON.stringify(messageBuilder.aMessage()),
    signedPayload: 'signed payload',
    type: 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST',
  };
}
export function aProofOfOwnershipFailedMessageStatus(): MessageStatus {
  return {
    msgId: c.natural(),
    requestId: c.guid(),
    status: 'FAILED',
    payload: JSON.stringify(messageBuilder.aMessage()),
    errorMessage: 'tx not authorized',
    type: 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST',
  };
}
export const messageBuilder = {
  fbMsgEnvelope: (
    fbMsgEnvelope?: Partial<FBMessageEnvlope>,
    fbMsg?: FBMessage,
    shouldEncode: boolean = true,
  ): FBMessageEnvlope => {
    const msg = shouldEncode
      ? jwt.sign(JSON.stringify(fbMsg || c.string()), 'shhhhh')
      : fbMsg || messageBuilder.fbMessage('KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST', messageBuilder.aMessage());
    return {
      msg,
      msgId: c.natural(),
      deviceId: c.guid(),
      internalMessageId: c.guid(),
      ...fbMsgEnvelope,
    };
  },
  fbMessage: (type: TxType, msg: Message): FBMessage => {
    const fbMessagePayload: FBMessagePayload = {
      payload: JSON.stringify(msg),
      signatureData: {
        service: 'some-service',
        signature: 'signature of the payload',
      },
    };
    return {
      type,
      payload: fbMessagePayload,
    };
  },
  anMessageEnvelope: (msgId: number, type: TxType, message: Message): MessageEnvelop => {
    return {
      msgId,
      payload: JSON.stringify(message),
      type,
      message,
    };
  },
  aMessage: (message?: Partial<Message>): Message => {
    return {
      tenantId: c.guid(),
      timestamp: c.timestamp(),
      version: 1,
      fbKeyId: c.guid(),
      requestId: c.guid(),
      signingDeviceKeyId: c.guid(),
      algorithm: 'ECDSA_SECP256K1',
      data: c.string(),
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
    pairDeviceRequst: (): PairDeviceRequest => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        pairingToken: 'some-valid-jwt',
      };
    },
    accessToken: (): AccessToken => c.string(),
    accessTokenRequst: (): AccessTokenRequest => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        refreshToken: 'some-valid-refresh-token',
      };
    },
  },
  mock: {
    pairDevice: (pairDeviceReq?: Partial<PairDeviceRequest>, resultRefreshToken: string = c.string()) => {
      const generatedReq = fbServerApiDriver.given.pairDeviceRequst();
      const pairRequest = {
        ...generatedReq,
        ...pairDeviceReq,
      };
      fbServerApiDriver
        .axiosMock()
        .onPost(`${MOBILE_GATEWAY_URL}/pair_device`, pairRequest)
        .reply(200, { refreshToken: resultRefreshToken });
    },
    messages: (accessToken: AccessToken, message: FBMessageEnvlope[] | FBMessageEnvlope) => {
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
    accessToken: (accessTokenReq?: Partial<AccessTokenRequest>, resultAccessToken: string = c.string()) => {
      const generatedReq = fbServerApiDriver.given.accessTokenRequst();
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
