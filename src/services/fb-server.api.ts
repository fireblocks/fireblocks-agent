import axios from 'axios';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import {
  AccessToken,
  AccessTokenRequest,
  CertificatesMap,
  FBMessageEnvelope,
  MessageEnvelop,
  MessageStatus,
  PairDeviceRequest,
  PairDeviceResponse,
} from 'types';
import { MOBILE_GATEWAY_URL } from '../constants';
import { AGENT_VERSION } from '../version';
import deviceService from './device.service';
import logger from './logger';

const TYPE_TO_ENDPOINT = {
  KEY_LINK_PROOF_OF_OWNERSHIP_RESPONSE: 'keylink_proof_of_ownership_response',
  KEY_LINK_TX_SIGN_RESPONSE: 'keylink_tx_sign_response',
};

let certificatesMapCache;

// Short-lived reuse of the MAG access token so we don't POST /access_token once per
// message on the hot path (a burst of N signed messages used to trigger ~N token fetches
// from broadcast+ack). Only tokens that are JWTs with a decodable exp are cached -- the
// token is reused until shortly before it expires, then refetched. Non-JWT tokens are
// never cached (fetched fresh every call).
let cachedAccessToken: AccessToken | null = null;
let cachedAccessTokenExpiryMs = 0;
// tenantId claim from the last decoded access token. MAG uses it as the WebSocket broadcast
// routing_id; cached alongside the token so the hot path never re-decodes per broadcast.
let cachedTenantId: string | null = null;
const ACCESS_TOKEN_EXPIRY_SKEW_MS = 30_000;

function rememberAccessToken(token: AccessToken, nowMs: number): void {
  cachedAccessToken = null;
  cachedAccessTokenExpiryMs = 0;
  cachedTenantId = null;
  try {
    const decoded = jwt.decode(token) as { exp?: number; tenantId?: string } | null;
    if (decoded) {
      // tenantId is the claim MAG verifies into IAccessTokenData and reads as .tenantId. Capture
      // it regardless of whether the token itself is cacheable (only tokens with a valid exp are
      // reused) so the WS transport always has a routing_id to send.
      if (typeof decoded.tenantId === 'string' && decoded.tenantId.length > 0) {
        cachedTenantId = decoded.tenantId;
      }
      if (typeof decoded.exp === 'number' && decoded.exp * 1000 > nowMs) {
        cachedAccessToken = token;
        cachedAccessTokenExpiryMs = decoded.exp * 1000;
      }
    }
  } catch {
    // Not a JWT we can reason about -- leave it uncached.
  }
}

// The response object broadcast back to MAG. Built identically for both transports -- the HTTP
// POST body and the WebSocket frame `payload` -- so the two are byte-for-byte equivalent.
export function buildResponseObject(msgStatus: MessageStatus, request: MessageEnvelop) {
  return {
    type: msgStatus.type,
    status: msgStatus.status,
    request: JSON.parse(request.message.payload),
    response: msgStatus.response,
  };
}

const fbServerApi = {
  pairDevice: async (pairDevice: PairDeviceRequest): Promise<PairDeviceResponse> => {
    try {
      logger.info(`Pairing using ${MOBILE_GATEWAY_URL}/pair_device`);
      const res = await axios.post(`${MOBILE_GATEWAY_URL}/pair_device`, pairDevice);
      return res.data;
    } catch (e) {
      logger.error(`Error on pairDevice request ${e.message}`);
      throw e;
    }
  },

  getAccessToken: async (accessTokenReq: AccessTokenRequest): Promise<AccessToken> => {
    const now = Date.now();
    if (cachedAccessToken && now < cachedAccessTokenExpiryMs - ACCESS_TOKEN_EXPIRY_SKEW_MS) {
      return cachedAccessToken;
    }
    try {
      const res = await axios.post(`${MOBILE_GATEWAY_URL}/access_token`, accessTokenReq);
      const token: AccessToken = res.data.accessToken;
      rememberAccessToken(token, now);
      return token;
    } catch (e) {
      logger.error(`Error on getAccessToken request ${e}`);
      throw e;
    }
  },

  // Resolve the tenantId claim from the (cached or freshly fetched) access token. Used as the
  // WebSocket broadcast routing_id -- MAG forwards routing_id verbatim to broadcastMsg(msg,
  // tenantId) with no fallback, so a valid tenantId is mandatory for the WS transport. Throws
  // rather than emit a frame with a bogus routing_id.
  getTenantId: async (): Promise<string> => {
    await fbServerApi.getAccessToken(deviceService.getDeviceData());
    if (!cachedTenantId) {
      throw new Error('Access token has no tenantId claim - cannot route WebSocket broadcast');
    }
    return cachedTenantId;
  },

  _resetTokenCache: () => {
    cachedAccessToken = null;
    cachedAccessTokenExpiryMs = 0;
    cachedTenantId = null;
  },

  broadcastResponse: async (msgStatus: MessageStatus, request: MessageEnvelop): Promise<void> => {
    try {
      logger.info(`entering broadcastResponse`);
      const accessToken = await fbServerApi.getAccessToken(deviceService.getDeviceData());
      const { type } = msgStatus;
      const responseObject = buildResponseObject(msgStatus, request);

      if (!(type in TYPE_TO_ENDPOINT)) {
        throw new Error(`Unknown type ${type}`);
      }

      const endpoint = TYPE_TO_ENDPOINT[type];
      const url = `${MOBILE_GATEWAY_URL}/${endpoint}`;
      // Metadata only -- never log responseObject (it carries the raw request payload and
      // the signature).
      logger.info(`broadcasting ${type} to ${endpoint} (status=${msgStatus.status}, requestId=${msgStatus.requestId})`);
      const res = await axios.post(url, responseObject, buildHeaders(accessToken));
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
      logger.info(`Acking message ${msgId}`);
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
    'User-Agent': `FireblocksAgent/${AGENT_VERSION}`,
  };
  return { headers };
}

export default fbServerApi;
