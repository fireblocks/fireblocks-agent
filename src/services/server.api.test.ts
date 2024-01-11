import { describe, expect, it } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Chance from 'chance';
import jwt from 'jsonwebtoken';
import { MOBILE_GATEWAY_URL } from '../constants';
import {
  AccessToken,
  AccessTokenReuest,
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
import serverApi from './server.api';

const c = new Chance();

describe('Server API', () => {
  beforeEach(() => {
    serverApiDriver.reset();
  });

  it('should pair device', async () => {
    const pairDeviceReq = serverApiDriver.given.pairDeviceRequst();
    const refreshToken = `some-valid-refresh-token`;
    serverApiDriver.mock.pairDevice(pairDeviceReq, refreshToken);

    const pairDeviceRes = await serverApi.pairDevice(pairDeviceReq);

    expect(pairDeviceRes.refreshToken).toBe(refreshToken);
  });

  it('should get access token', async () => {
    const accessTokenReq = serverApiDriver.given.accessTokenRequst();
    const accessToken = 'my-access-token';
    serverApiDriver.mock.accessToken(accessTokenReq, accessToken);

    const accessTokenRes = await serverApi.getAccessToken(accessTokenReq);

    expect(accessTokenRes).toBe(accessToken);
  });

  it('should pull messages', async () => {
    const accessToken = serverApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const someMessages = [messageBuilder.fbMsgEnvelope()];
    serverApiDriver.mock.accessToken(deviceData, accessToken);
    serverApiDriver.mock.messages(accessToken, someMessages);

    const messages = await serverApi.getMessages();

    expect(messages).toStrictEqual(someMessages);
  });

  it('should handle messages in non batch mode as well', async () => {
    const accessToken = serverApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const someMessage = messageBuilder.fbMsgEnvelope();
    serverApiDriver.mock.accessToken(deviceData, accessToken);
    serverApiDriver.mock.messages(accessToken, someMessage);

    const messages = await serverApi.getMessages();

    expect(messages).toStrictEqual([someMessage]);
  });

  it('should get certificates', async () => {
    const accessToken = serverApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const certificatesMap = { zs: 'certificate for zService', vs: 'certificate for vault service' };
    serverApiDriver.mock.accessToken(deviceData, accessToken);

    serverApiDriver.mock.certificates(accessToken, certificatesMap);

    const certificates = await serverApi.getCertificates();

    expect(certificates).toStrictEqual(certificatesMap);
  });

  it('should cache certificates map', async () => {
    const accessToken = serverApiDriver.given.accessToken();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    const certificatesMap = { zs: 'certificate for zService', vs: 'certificate for vault service' };
    serverApiDriver.mock.accessToken(deviceData, accessToken);
    serverApiDriver.mock.certificates(accessToken, certificatesMap);

    const certificates = await serverApi.getCertificates();

    const someOtherCertificatesMap = { zs: 'other certificate' };
    serverApiDriver.reset();
    serverApiDriver.mock.certificates(accessToken, someOtherCertificatesMap);

    const certificates2 = await serverApi.getCertificates();

    expect(certificates).toStrictEqual(certificates2);
  });

  it('shuold ack message', async () => {
    const accessToken = serverApiDriver.given.accessToken();
    const aMessage = messageBuilder.fbMsgEnvelope({ msgId: c.natural() });
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    serverApiDriver.mock.accessToken(deviceData, accessToken);

    serverApiDriver.mock.ackMessage(accessToken, aMessage.msgId, 'ok');

    const res = await serverApi.ackMessage(aMessage.msgId);

    expect(res).toEqual('ok');
  });

  it('shuold broadcast message', async () => {
    const accessToken = serverApiDriver.given.accessToken();
    const signedMessageStatus = aSignedMessageStatus();
    const deviceData = deviceDriver.given.deviceData();
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue(deviceData);
    serverApiDriver.mock.accessToken(deviceData, accessToken);

    const expectedRequestObject = {
      type: `${signedMessageStatus.type}_RESPONSE`,
      payload: {
        payload: JSON.parse(signedMessageStatus.payload),
        signedPayload: signedMessageStatus.signedPayload,
      },
    };

    serverApiDriver.mock.broadcast(accessToken, expectedRequestObject, 'ok');

    const res = await serverApi.broadcastResponse(signedMessageStatus);

    expect(res).toEqual('ok');
  });
});

export function aSignedMessageStatus(): MessageStatus {
  return {
    msgId: c.natural(),
    requestId: c.guid(),
    status: 'SIGNED',
    payload: JSON.stringify(messageBuilder.aMessage()),
    signedPayload: 'signed payload',
    type: 'TX',
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
      : fbMsg || messageBuilder.fbMessage('TX', messageBuilder.aMessage());
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
export const serverApiDriver = {
  axiosMock: () => {
    if (instance) {
      return instance;
    }
    instance = new MockAdapter(axios);
    return instance;
  },
  reset: () => serverApiDriver.axiosMock().reset(),
  given: {
    pairDeviceRequst: (): PairDeviceRequest => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        pairingToken: 'some-valid-jwt',
      };
    },
    accessToken: (): AccessToken => c.string(),
    accessTokenRequst: (): AccessTokenReuest => {
      return {
        userId: c.guid(),
        deviceId: c.guid(),
        refreshToken: 'some-valid-refresh-token',
      };
    },
  },
  mock: {
    pairDevice: (pairDeviceReq?: Partial<PairDeviceRequest>, resultRefreshToken: string = c.string()) => {
      const generatedReq = serverApiDriver.given.pairDeviceRequst();
      const pairRequest = {
        ...generatedReq,
        ...pairDeviceReq,
      };
      serverApiDriver
        .axiosMock()
        .onPost(`${MOBILE_GATEWAY_URL}/pair_device`, pairRequest)
        .reply(200, { refreshToken: resultRefreshToken });
    },
    messages: (accessToken: AccessToken, message: FBMessageEnvlope[] | FBMessageEnvlope) => {
      serverApiDriver
        .axiosMock()
        .onGet(`${MOBILE_GATEWAY_URL}/msg?useBatch=true`, {
          headers: { 'x-access-token': accessToken },
        })
        .reply(200, message);
    },
    certificates: (accessToken: AccessToken, certificates: CertificatesMap) => {
      serverApiDriver
        .axiosMock()
        .onGet(`${MOBILE_GATEWAY_URL}/get_service_certificates`, {
          headers: { 'x-access-token': accessToken },
        })
        .reply(200, certificates);
    },
    ackMessage: (accessToken: AccessToken, msgId: number, response: string) => {
      serverApiDriver.axiosMock().onPut(`${MOBILE_GATEWAY_URL}/msg`, { msgId, nack: false }).reply(200, response);
    },
    broadcast: (accessToken: AccessToken, status: any, response: string) => {
      serverApiDriver.axiosMock().onPost(`${MOBILE_GATEWAY_URL}/broadcast_zservice_msg`, status).reply(200, response);
    },
    accessToken: (accessTokenReq?: Partial<AccessTokenReuest>, resultAccessToken: string = c.string()) => {
      const generatedReq = serverApiDriver.given.accessTokenRequst();
      const accessTokenRequest: AccessTokenReuest = {
        ...generatedReq,
        ...accessTokenReq,
      };
      serverApiDriver
        .axiosMock()
        .onPost(`${MOBILE_GATEWAY_URL}/access_token`, accessTokenRequest)
        .reply(200, { accessToken: resultAccessToken });
    },
  },
};
