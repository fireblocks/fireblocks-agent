import { components } from './customer-server';

export type TxType = components['schemas']['TxType'];
export type Message = components['schemas']['Message'];
export type MessageStatus = components['schemas']['MessageStatus'];
export type MessageAlgorithm = components['schemas']['Message']['algorithm'];
export type MessageEnvelope = components['schemas']['MessageEnvelope'];
export type Algorithm = components['schemas']['Algorithm']
export type GUID = string;
