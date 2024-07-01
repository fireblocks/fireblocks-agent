import { components } from './customer-server';

export type RequestType = components['schemas']['RequestType'];
export type ResponseType = components['schemas']['ResponseType'];
export type Message = components['schemas']['Message'];
export type MessageStatus = components['schemas']['MessageStatus'];
export type MessageEnvelope = components['schemas']['MessageEnvelope'];
export type MessagePayload = components['schemas']['MessagePayload'];
export type Algorithm = components['schemas']['Algorithm']
export type SignedMessage = components['schemas']['SignedMessage'];
export type GUID = string;
