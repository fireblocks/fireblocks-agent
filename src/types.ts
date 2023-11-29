export type GUID = string;
export type RefreshToken = string;
export type JWT = string;

export interface PairDeviceRequest {
  deviceId: GUID;
  userId: GUID;
  pairingToken: JWT;
}

export interface AccessTokenReuest {
  userId: GUID;
  deviceId: GUID;
  refreshToken: RefreshToken;
}
