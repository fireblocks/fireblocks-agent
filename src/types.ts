import { components } from '../api/customer-server';

export type GUID = string;
export type RefreshToken = string;
export type JWT = string;
export type AccessToken = string;
export interface PairDeviceRequest {
  deviceId: GUID;
  userId: GUID;
  pairingToken: JWT;
}
export interface PairDeviceResponse {
  refreshToken: RefreshToken;
}

export interface AccessTokenReuest {
  userId: GUID;
  deviceId: GUID;
  refreshToken: RefreshToken;
}

export interface FBMessageEnvlope {
  msg: JWT | Object;
  msgId: GUID;
  deviceId: GUID;
  internalMessageId: GUID;
}

export type ProofOfOwnershipPayloadStringify = string;
export type SignatureId = 'configuration_manager' | 'zs';

export type MessageStringify = string;
export interface FBMessagePayload {
  payload: MessageStringify;
  signatureData: {
    service: string;
    signature: string;
  };
}

export interface FBMessage {
  type: TxType;
  payload: FBMessagePayload;
}

export interface MPCPayload {
  phase: TxType;
  tenantId: GUID;
  txId: GUID;
  keyId: GUID;
  payload: string;
  algorithm: number;
  metadata: TransactionMetadata;
  userAccessToken: string;
}

export type Message = components['schemas']['Message'];
export type Algorithm = components['schemas']['Algorithm'];
export type TxType = components['schemas']['TxType'];

export interface PairingToken {
  userId: GUID;
}

export interface TransactionMetadata {
  signInfo: Array<{ path: number[]; payload: string }>;
  chaincode: string;
  txMetaData: string;
  txMetaDataSignatures: {
    id: string;
    type: string;
    signature: string;
  }[];
}

export type CertificatesMap = { [service: string]: string };

export type MessageStatus = components['schemas']['MessageStatus'];
export type MessageEnvelop = components['schemas']['MessageEnvelope'];
