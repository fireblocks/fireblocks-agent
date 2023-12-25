import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Algorithm, FBMessage, FBMessageEnvlope, Message, TxType } from '../types';
import * as utils from './messages-utils';

describe('Messages utils', () => {
  it('should verify a message', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      vs: publicKey,
    };
    const fbMessage = aFbMessage(privateKey);
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

  it('should not verify a message with false zServiceCertificate', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: 'my-zs-secret',
      vs: publicKey,
    };
    const fbMessage = aFbMessage(privateKey);
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
    const fbMessage = aFbMessage(pair2.privateKey);
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

function aFbMessage(privateKey: string): FBMessage {
  const txMetaData = `some-content-to-sign`;
  const signer = crypto.createSign('sha256');
  signer.update(txMetaData);
  const signature = signer.sign(privateKey, 'hex');

  const innerMessage: FBMessage = {
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

function buildASignedMessage(innerMessage: FBMessage, zsCertificate): FBMessageEnvlope {
  const jwtMessage = jwt.sign(JSON.stringify(innerMessage), zsCertificate);
  return {
    deviceId: 'some-device-id',
    msgId: 'some-message-id',
    msg: jwtMessage,
    internalMessageId: 'internal-message-id',
  };
}
