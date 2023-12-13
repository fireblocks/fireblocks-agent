import { components } from "../api/customer-server";

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
  msg: JWT;
  msgId: GUID;
  deviceId: GUID;
  internalMessageId: GUID;
}

export interface Message {
  msgId: GUID;
  type: TxType;
  txId: GUID;
  keyId: GUID;
  payload: string;
  algorithm: Algorithm;
}

export enum Algorithm {
  ECDSA = 'ECDSA',
  EDDSA = 'EDDSA',
}

export enum TxType {
  MPC_START_SIGNING = 'MPC_START_SIGNING',
  MPC_STOP_SIGNING = 'MPC_STOP_SIGNING',
}

export interface PairingToken {
  userId: GUID;
}

export type MessageStatus = components['schemas']['MessageStatus'];
export type MessageEnvelop = components['schemas']['MessageEnvelope'];
