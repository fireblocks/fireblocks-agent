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
  refreshToken: RefreshToken
}

export interface AccessTokenReuest {
  userId: GUID;
  deviceId: GUID;
  refreshToken: RefreshToken;
}

export interface Message {
  msg: any;
  msgId: GUID
  deviceId: GUID
  internalMessageId: GUID
}
