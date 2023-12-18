import { components } from './customer-server';

export type MessageStatus = components['schemas']['MessageStatus'];
export type MessageAlgorithm = components['schemas']['Message']['algorithm'];
export type MessageEnvelope = components['schemas']['MessageEnvelope'];
export enum Algorithm {
  ECDSA = 'ECDSA',
  EDDSA = 'EDDSA',
}
export type GUID = string;
