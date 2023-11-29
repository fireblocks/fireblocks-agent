export type GUID = string;
export type JWT = string;

export interface PairDeviceRequest {
  deviceId: GUID;
  userId: GUID;
  pairingToken: JWT;
}
