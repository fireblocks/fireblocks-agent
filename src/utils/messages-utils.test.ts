import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { messageBuilder } from '../services/fb-server.api.test';
import { FBMessage, FBMessageEnvlope, FBMessagePayload, Message, MessageEnvelop } from '../types';
import * as utils from './messages-utils';

describe('Messages utils', () => {
  it('should verify proof of ownership message', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      cm: publicKey,
    };
    const fbMessage = aFbProofOfOwnershipMessage(privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);
    const messageEnvelope = utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);
    const internalMessage = JSON.parse(fbMessage.payload.payload) as Message;

    const expectedMessage: MessageEnvelop = {
      msgId: fbMessageEnvelope.msgId,
      type: 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST',
      message: internalMessage,
      payload: fbMessage.payload.payload,
    };
    expect(messageEnvelope).toEqual(expectedMessage);
  });

  it('should not verify a message with false zServiceCertificate', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      vs: publicKey,
    };
    const fbMessage = aFbProofOfOwnershipMessage(privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, 'false-certificate');

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Message signature is invalid"');
  });

  it('should not verify a message with false vsCertificate', () => {
    const pair1 = aKeyPair();
    const pair2 = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      vs: pair1.publicKey,
    };
    const fbMessage = aFbProofOfOwnershipMessage(pair2.privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Message signature is invalid"');
  });
});

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

function aKeyPair(): KeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function aFbProofOfOwnershipMessage(privateKey: string): FBMessage {
  const fbMsgPayload = aFbMessagePayload(privateKey);
  return {
    type: 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST',
    payload: fbMsgPayload,
  };
}

function aFbMessagePayload(privateKey: string): FBMessagePayload {
  const payload: Message = messageBuilder.aMessage();
  const payloadStr = JSON.stringify(payload);

  const signer = crypto.createSign('sha256');
  signer.update(payloadStr);
  const signature = signer.sign(privateKey, 'hex');

  const innerMessage: FBMessagePayload = {
    payload: payloadStr,
    signatureData: {
      service: 'CONFIGURATION_MANAGER',
      signature,
    },
  };
  return innerMessage;
}

function buildASignedMessage(innerMessage: FBMessage, zsCertificate): FBMessageEnvlope {
  const jwtMessage = jwt.sign(JSON.stringify(innerMessage), zsCertificate);
  return {
    deviceId: 'some-device-id',
    msgId: 1,
    msg: jwtMessage,
    internalMessageId: 'internal-message-id',
  };
}
