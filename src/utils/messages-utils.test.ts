import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  Algorithm,
  FBMessage,
  FBMessageEnvlope,
  FBSignatureMessage,
  MPCPayload,
  Message,
  MessagePayload,
  ProofOfOwnershipPayload,
  TxType,
} from '../types';
import * as utils from './messages-utils';

describe('Messages utils', () => {
  it('should verify a message', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      vs: publicKey,
    };
    const fbMessage = aFbMpcMessage(privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);
    const message = utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    const expectedMessage: Message = {
      msgId: fbMessageEnvelope.msgId,
      type: fbMessage.type,
      txId: fbMessage.payload.txId,
      keyId: fbMessage.payload.keyId,
      payload: fbMessage.payload.payload,
      algorithm: Algorithm.ECDSA,
    };
    expect(message).toEqual(expectedMessage);
  });

  it('should verify proof of ownership message', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      cm: publicKey,
    };
    const fbMessage = aFbProofOfOwnershipMessage(privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, certificates.zs);
    const message = utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);
    const parsedPayload = JSON.parse(fbMessage.payload) as ProofOfOwnershipPayload;

    const expectedMessage: Message = {
      msgId: fbMessageEnvelope.msgId,
      type: fbMessage.type,
      payload: fbMessage.payload,
      keyId: parsedPayload.externalKeyId,
      txId: parsedPayload.requestId,
      algorithm: Algorithm.ECDSA,
    };
    expect(message).toEqual(expectedMessage);
  });

  it('should not verify a message with false zServiceCertificate', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      vs: publicKey,
    };
    const fbMessage = aFbMpcMessage(privateKey);
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
    const fbMessage = aFbMpcMessage(pair2.privateKey);
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

function aFbProofOfOwnershipMessage(privateKey: string): FBSignatureMessage {
  const payload = {
    tenantId: 'tenant-id',
    algorithm: 101,
    timestamp: Date.now(),
    fbKeyId: `some-key-id`,
    externalKeyId: `some-external-key-id`,
    version: 1,
    requestId: `some-request-id`,
  };
  const payloadStr = JSON.stringify(payload);

  const signer = crypto.createSign('sha256');
  signer.update(payloadStr);
  const signature = signer.sign(privateKey, 'hex');

  const innerMessage: FBSignatureMessage = {
    type: TxType.EXTERNAL_KEY_PROOF_OF_OWNERSHIP,
    payload: payloadStr,
    signature,
    signatureId: 'configuration_manager',
  };
  return innerMessage;
}

function aFbMpcMessage(privateKey: string): FBMessage<MPCPayload> {
  const txMetaData = `some-content-to-sign`;
  const signer = crypto.createSign('sha256');
  signer.update(txMetaData);
  const signature = signer.sign(privateKey, 'hex');

  const innerMessage: FBMessage<MPCPayload> = {
    type: TxType.MPC_START_SIGNING,
    payload: {
      phase: TxType.MPC_START_SIGNING,
      tenantId: 'tenant-id',
      txId: 'some-tx-id',
      keyId: 'some-guid-id',
      payload: 'the-payload-to-sign',
      algorithm: 101,
      userAccessToken: 'access-token',
      metadata: {
        signInfo: [],
        chaincode: 'a9f2313dafed920fe2c258ae694c7c7282e0d4503a8238bfa9d72de688b443b6',
        txMetaData,
        txMetaDataSignatures: [{ id: 'MPC_START_SIGNING', signature, type: 'SERVICE' }],
      },
    },
  };
  return innerMessage;
}

function buildASignedMessage(innerMessage: FBMessage<MessagePayload>, zsCertificate): FBMessageEnvlope {
  const jwtMessage = jwt.sign(JSON.stringify(innerMessage), zsCertificate);
  return {
    deviceId: 'some-device-id',
    msgId: 'some-message-id',
    msg: jwtMessage,
    internalMessageId: 'internal-message-id',
  };
}
