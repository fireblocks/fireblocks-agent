import axios from 'axios';
import fs from 'fs';
import {
  AccessToken,
  AccessTokenReuest,
  CertificatesMap,
  FBMessageEnvlope,
  GUID,
  MessageStatus,
  PairDeviceRequest,
  PairDeviceResponse,
} from 'types';
import { MOBILE_GATEWAY_URL } from '../constants';
import deviceService from './device.service';
import logger from './logger';

let i = 21;
let certificatesMapCache;
const serverApi = {
  pairDevice: async (pairDevice: PairDeviceRequest): Promise<PairDeviceResponse> => {
    try {
      const res = await axios.post(`${MOBILE_GATEWAY_URL}/pair_device`, pairDevice);
      return res.data;
    } catch (e) {
      logger.error(`Error on pairDevice request`, e);
      throw e;
    }
  },

  getAccessToken: async (accessTokenReq: AccessTokenReuest): Promise<AccessToken> => {
    try {
      const res = await axios.post(`${MOBILE_GATEWAY_URL}/access_token`, accessTokenReq);
      return res.data.accessToken;
    } catch (e) {
      logger.error(`Error on getAccessToken request`, e);
      throw e;
    }
  },
  broadcastResponse: async ({ requestId, signedPayload, payload, type }: MessageStatus): Promise<void> => {
    try {
      const accessToken = await serverApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.post(
        `${MOBILE_GATEWAY_URL}/broadcast_zservice_msg`,
        { requestId, signedPayload, payload, type: `${type}_RESPONSE` },
        buildHeaders(accessToken),
      );
      return res.data;
    } catch (e) {
      logger.error(`Error on broadcast request`, e);
      throw e;
    }
  },

  getMessages: async (): Promise<FBMessageEnvlope[]> => {
    try {
      const accessToken = await serverApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.get(`${MOBILE_GATEWAY_URL}/msg?useBatch=true`, buildHeaders(accessToken));
      const messages = res.data;
      if (messages) {
        fs.writeFileSync(`messages${i}.json`, JSON.stringify(messages));
        i++;
      }
      return Array.isArray(messages) ? messages : [messages];
    } catch (e) {
      logger.error(`Error on getMessages request`, e);
      throw e;
    }
  },
  getCertificates: async (): Promise<CertificatesMap> => {
    try {
      if (certificatesMapCache) {
        return certificatesMapCache;
      }
      const accessToken = await serverApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.get(`${MOBILE_GATEWAY_URL}/get_service_certificates`, buildHeaders(accessToken));
      certificatesMapCache = res.data;
      return certificatesMapCache;
    } catch (e) {
      logger.error(`Error on getMessages request`, e);
      throw e;
    }
  },

  ackMessage: async (msgId: GUID) => {
    try {
      const accessToken = await serverApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.put(`${MOBILE_GATEWAY_URL}/msg`, { msgId, nack: false }, buildHeaders(accessToken));
      return res.data;
    } catch (e) {
      logger.error(`Error on ackMessage request`, e);
      throw e;
    }
  },
};

function buildHeaders(accessToken: AccessToken) {
  const headers = {
    'x-access-token': accessToken,
  };
  return { headers };
}

export default serverApi;
