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

export interface AccessTokenRequest {
  userId: GUID;
  deviceId: GUID;
  refreshToken: RefreshToken;
}

export interface FBMessageEnvelope {
  msg: JWT | FBMessage;
  msgId: number;
  deviceId: GUID;
  internalMessageId: GUID;
}

export interface FBMessage {
  type: RequestType;
  payload: FBMessagePayload;
}

export interface PairingToken {
  userId: GUID;
}

export type CertificatesMap = { [service: string]: string };

export type RequestType = components['schemas']['RequestType'];
export type ResponseType = components['schemas']['ResponseType'];
export type FBMessagePayload = components['schemas']['Message'];
export type MessageStatus = components['schemas']['MessageStatus'];
export type MessageEnvelop = components['schemas']['MessageEnvelope'];
export type MessagePayload = components['schemas']['MessagePayload'];
export type TransportMetadata = components['schemas']['TransportMetadata'];
export type TxMetadata = components['schemas']['TxMetadata'];
export type TxMetadataSignature = components['schemas']['TxMetadataSignature'];

export interface DecodedMessage {
  request: MessageEnvelop;
  msgId: number;
}

export interface ExtendedMessageStatusCache {
  messageStatus: MessageStatus;
  msgId: number;
  request: MessageEnvelop;
}
