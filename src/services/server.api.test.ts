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
  GUID,
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
    const aMessage = messageBuilder.fbMsgEnvelope({ msgId: c.guid() });
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

    serverApiDriver.mock.broadcast(accessToken, signedMessageStatus, 'ok');

    const res = await serverApi.broadcast(signedMessageStatus);

    expect(res).toEqual('ok');
  });
});

function aSignedMessageStatus(): MessageStatus {
  return {
    msgId: c.guid(),
    requestId: c.guid(),
    status: 'SIGNED',
    payload: c.string(),
  };
}
export const messageBuilder = {
  fbMsgEnvelope: (
    fbMsgEnvelope?: Partial<FBMessageEnvlope>,
    fbMsg?: Partial<FBMessage>,
    shouldEncode: boolean = true,
  ): FBMessageEnvlope => {
    const msg = shouldEncode ? jwt.sign(JSON.stringify(fbMsg || c.string()), 'shhhhh') : fbMsg || {};
    return {
      msg,
      msgId: c.guid(),
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
  anMessageEnvelope: (msgId: string, type: TxType, message: Message): MessageEnvelop => {
    return {
      msgId,
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
      externalKeyId: c.guid(),
      algorithm: 'ECDSA',
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
    ackMessage: (accessToken: AccessToken, msgId: GUID, response: string) => {
      serverApiDriver.axiosMock().onPut(`${MOBILE_GATEWAY_URL}/msg`, { msgId, nack: false }).reply(200, response);
    },
    broadcast: (accessToken: AccessToken, status: MessageStatus, response: string) => {
      serverApiDriver
        .axiosMock()
        .onPost(`${MOBILE_GATEWAY_URL}/broadcast_zservice_msg`, {
          requestId: status.requestId,
          payload: status.payload,
        })
        .reply(200, response);
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
