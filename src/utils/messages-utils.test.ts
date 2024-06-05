import Chance from 'chance';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { messageBuilder } from '../services/fb-server.api.test';
import { FBMessage, FBMessageEnvelope, FBMessagePayload, MessageEnvelop, MessagePayload, RequestType, TxMetadata } from '../types';
import * as utils from './messages-utils';

const c = new Chance();

describe('Messages utils', () => {
  it('should verify proof of ownership message', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      cm: publicKey,
    };
    const requestId = c.guid();
    const fbMessage = aFbProofOfOwnershipMessage(privateKey, { requestId });
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);
    const messageEnvelope = utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    const expectedMessage: MessageEnvelop = {
      message: fbMessage.payload,
      transportMetadata: {
        msgId: fbMessageEnvelope.msgId,
        requestId,
        type: fbMessage.type,
      },
    };
    expect(messageEnvelope).toEqual(expectedMessage);
  });

  it('should not verify a message with false zServiceCertificate', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      cm: publicKey,
    };
    const fbMessage = aFbProofOfOwnershipMessage(privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, 'false-certificate');

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"JWT Message signature is invalid"');
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

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Certificate for configuration_manager is missing"');
  });

  it('should not verify a message with false cmCertificate', () => {
    const pair1 = aKeyPair();
    const pair2 = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      cm: pair1.publicKey,
    };
    const fbMessage = aFbProofOfOwnershipMessage(pair2.privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Invalid signature from configuration_manager"');
  });

  it('should not verify a proof of ownership message without version', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      cm: publicKey,
    };
    const fbMessage = aCustomFbProofOfOwnershipMessage(privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Message version is missing"');
  });

  it('should not verify a proof of ownership message with unsupported version', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      cm: publicKey,
    };
    const invalid_version = "0.0.0";
    const fbMessage = aCustomFbProofOfOwnershipMessage(privateKey, { version: invalid_version });
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot(`"Unsupported message version: ${invalid_version}"`);
  });

  it('should verify tx sign request message', () => {
    const { privateKey: PSprivateKey, publicKey: PSpublicKey } = aKeyPair();
    const { privateKey: SSprivateKey, publicKey: SSpublicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      ps: PSpublicKey,
      vs: SSpublicKey,
    };
    const fbMessage = aFbTxSignRequestMessage(SSprivateKey, PSprivateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);
    const messageEnvelope = utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    const expectedMessage: MessageEnvelop = {
      message: fbMessage.payload,
      transportMetadata: {
        deviceId: fbMessageEnvelope.deviceId,
        internalMessageId: fbMessageEnvelope.internalMessageId,
        msgId: fbMessageEnvelope.msgId,
        type: fbMessage.type,
      },
    };
    expect(messageEnvelope).toEqual(expectedMessage);
  });

  it('should not verify a tx sign request message with false ps signature', () => {
    const { privateKey } = aKeyPair();
    const { privateKey: PSprivateKey, publicKey: PSpublicKey } = aKeyPair();
    const { privateKey: SSprivateKey, publicKey: SSpublicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      ps: PSpublicKey,
      vs: SSpublicKey,
    };
    const fbMessage = aFbTxSignRequestMessage(SSprivateKey, privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Invalid signature from policy_service"');
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

function aCustomFbTxSignRequestMessage(privateKey: string, payloadFields?: Partial<MessagePayload>): FBMessage {
  const type = 'KEY_LINK_TX_SIGN_REQUEST';
  const fbMsgPayload = aFbMessagePayload(privateKey, type, 'SIGNING_SERVICE', payloadFields);
  return {
    type,
    payload: fbMsgPayload,
  };
}

function aFbTxSignRequestMessage(privateKey: string, policyPrivateKey: string): FBMessage {

  const txMetadata = aTxMetadata(policyPrivateKey) as any;
  return aCustomFbTxSignRequestMessage(privateKey, { metadata: txMetadata });
}

function aCustomFbProofOfOwnershipMessage(privateKey: string, payloadFields?: Partial<MessagePayload>): FBMessage {
  const type = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST'
  const fbMsgPayload = aFbMessagePayload(privateKey, type, 'CONFIGURATION_MANAGER', payloadFields);
  return {
    type,
    payload: fbMsgPayload,
  };
}

function aFbProofOfOwnershipMessage(privateKey: string, payloadFields?: Partial<MessagePayload>): FBMessage {
  return aCustomFbProofOfOwnershipMessage(privateKey, { ...payloadFields, version: "2.0.0" });
}

function aFbMessagePayload(privateKey: string, type: RequestType, service: string, payloadFields?: Partial<MessagePayload>): FBMessagePayload {
  const payload = messageBuilder.aMessagePayload(type, payloadFields);
  const payloadStr = JSON.stringify(payload);

  const signer = crypto.createSign('sha256');
  signer.update(payloadStr);
  const signature = signer.sign(privateKey, 'hex');

  return {
    payload: payloadStr,
    payloadSignatureData: {
      service,
      signature,
    },
  };
}

function aTxMetadata(privateKey: string): TxMetadata {
  const txMetadata = '{ "example": "metadata" }';
  const signer = crypto.createSign('sha256');
  signer.update(txMetadata);
  const signature = signer.sign(privateKey, 'hex');

  return {
    txMetadata,
    txMetaDataSignatures: [
      {
        id: 'policy_service',
        type: 'SERVICE',
        signature,
      },
    ],
  };
}

function buildASignedMessage(innerMessage: FBMessage, zsCertificate): FBMessageEnvelope {
  const jwtMessage = jwt.sign(JSON.stringify(innerMessage), zsCertificate);
  return {
    deviceId: 'some-device-id',
    msgId: 1,
    msg: jwtMessage,
    internalMessageId: 'internal-message-id',
  };
}
