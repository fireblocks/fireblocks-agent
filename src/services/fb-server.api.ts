import axios from 'axios';
import fs from 'fs';
import {
  AccessToken,
  AccessTokenRequest,
  CertificatesMap,
  FBMessageEnvelope,
  MessageStatus,
  PairDeviceRequest,
  PairDeviceResponse,
} from 'types';
import { MOBILE_GATEWAY_URL } from '../constants';
import deviceService from './device.service';
import logger from './logger';

const TYPE_TO_ENDPOINT = {
  KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE: 'keylink_proof_of_ownership_response',
  KEY_LINK_TX_SIGN_RESPONSE: 'keylink_tx_sign_response',
};

let i = 21; //TODO: remove
let certificatesMapCache;
const fbServerApi = {
  pairDevice: async (pairDevice: PairDeviceRequest): Promise<PairDeviceResponse> => {
    try {
      logger.info(`Pairing using ${MOBILE_GATEWAY_URL}/pair_device`)
      const res = await axios.post(`${MOBILE_GATEWAY_URL}/pair_device`, pairDevice);
      return res.data;
    } catch (e) {
      logger.error(`Error on pairDevice request ${e.message}`);
      throw e;
    }
  },

  getAccessToken: async (accessTokenReq: AccessTokenRequest): Promise<AccessToken> => {
    try {
      const res = await axios.post(`${MOBILE_GATEWAY_URL}/access_token`, accessTokenReq);
      fs.writeFileSync(`accessToken.log`, JSON.stringify(res.data.accessToken));
      return res.data.accessToken;
    } catch (e) {
      logger.error(`Error on getAccessToken request ${e}`);
      throw e;
    }
  },

  broadcastResponse: async (msgStatus: MessageStatus): Promise<void> => {
    try {
      logger.info(`entering broadcastResponse`);
      const accessToken = await fbServerApi.getAccessToken(deviceService.getDeviceData());
      const { type } = msgStatus;
      const { payload } = msgStatus.request.message;
      const parsedPayload = JSON.parse(payload);
      const responseObject = {
        type,
        status: msgStatus.status,
        request: parsedPayload,
        response: msgStatus.response,
      };
      const url = `${MOBILE_GATEWAY_URL}/${TYPE_TO_ENDPOINT[type]}`;
      logger.info(`broadcasting to ${url} response ${JSON.stringify(responseObject)}`);
      const res = await axios.post(
        url,
        responseObject,
        buildHeaders(accessToken),
      );
      logger.info(`Exiting broadcastResponse`);
      return res.data;
    } catch (e) {
      logger.error(`Error on broadcast request ${e.message}`);
      throw e;
    }
  },

  getMessages: async (): Promise<FBMessageEnvelope[]> => {
    try {
      const accessToken = await fbServerApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.get(`${MOBILE_GATEWAY_URL}/msg?useBatch=true`, buildHeaders(accessToken));
      const messages = res.data;
      if (messages) {
        fs.writeFileSync(`messages${i}.json`, JSON.stringify(messages));
        i++;
        return Array.isArray(messages) ? messages : [messages];
      }
      return [];
    } catch (e) {
      logger.error(`Error on getMessages request ${e.message}`);
      throw e;
    }
  },

  getCertificates: async (): Promise<CertificatesMap> => {
    try {
      if (certificatesMapCache) {
        return certificatesMapCache;
      }
      const accessToken = await fbServerApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.get(`${MOBILE_GATEWAY_URL}/get_service_certificates`, buildHeaders(accessToken));
      certificatesMapCache = res.data;
      return certificatesMapCache;
    } catch (e) {
      logger.error(`Error on getMessages request ${e.message}`);
      throw e;
    }
  },

  ackMessage: async (msgId: number) => {
    try {
      const accessToken = await fbServerApi.getAccessToken(deviceService.getDeviceData());
      const res = await axios.put(`${MOBILE_GATEWAY_URL}/msg`, { msgId, nack: false }, buildHeaders(accessToken));
      return res.data;
    } catch (e) {
      logger.error(`Error on ackMessage request ${e.message}`);
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

export default fbServerApi;
