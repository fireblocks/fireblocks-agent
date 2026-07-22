import Chance from 'chance';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { messageBuilder } from '../services/fb-server.api.test';
import {
  FBMessage,
  FBMessageEnvelope,
  FBMessagePayload,
  MessageEnvelop,
  MessagePayload,
  RequestType,
  TxMetadata,
} from '../types';
import * as utils from './messages-utils';
const c = new Chance();

// The outer zService envelope is an RS256 JWT in production, so sign the test fixtures
// with an RSA keypair (the public half goes into the cert map as `zs`).
const ZS = aKeyPair();

describe('Messages utils', () => {
  it('should verify proof of ownership message', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      cm: publicKey,
    };
    const requestId = c.guid();
    const fbMessage = aFbProofOfOwnershipMessage(privateKey, { requestId });
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);
    const messageEnvelope = utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    const expectedMessage: MessageEnvelop = {
      message: fbMessage.payload,
      transportMetadata: {
        requestId,
        type: fbMessage.type,
      },
    };
    expect(messageEnvelope).toEqual({ request: expectedMessage, msgId: fbMessageEnvelope.msgId });
  });

  it('should not verify a message with false zServiceCertificate', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      cm: publicKey,
    };
    const requestId = c.guid();
    const fbMessage = aFbProofOfOwnershipMessage(privateKey, { requestId: requestId });
    // Sign the envelope with a key that is NOT the zService key -> RS256 verify must fail.
    const wrongKey = aKeyPair();
    const fbMessageEnvelope = buildASignedMessage(fbMessage, wrongKey.privateKey);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    // Error carries metadata only -- no raw message payload.
    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot(
      `"JWT Message signature is invalid. msgId: ${fbMessageEnvelope.msgId} type: ${fbMessage.type} requestId: ${requestId}"`,
    );
  });

  it('should not verify a message with false vsCertificate', () => {
    const pair1 = aKeyPair();
    const pair2 = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      vs: pair1.publicKey,
    };
    const fbMessage = aFbProofOfOwnershipMessage(pair2.privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Certificate for configuration_manager is missing"');
  });

  it('should not verify a message with false cmCertificate', () => {
    const pair1 = aKeyPair();
    const pair2 = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      cm: pair1.publicKey,
    };
    const fbMessage = aFbProofOfOwnershipMessage(pair2.privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Invalid signature from configuration_manager"');
  });

  it('should not verify a proof of ownership message without version', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      cm: publicKey,
    };
    const fbMessage = aCustomFbProofOfOwnershipMessage(privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Message version is missing"');
  });

  it('should not verify a proof of ownership message with unsupported version', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      cm: publicKey,
    };
    const invalid_version = '0.0.0';
    const fbMessage = aCustomFbProofOfOwnershipMessage(privateKey, { version: invalid_version });
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot(`"Unsupported message version: ${invalid_version}"`);
  });

  it('should verify unknown message', () => {
    const { privateKey, publicKey } = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      cm: publicKey,
    };

    // @ts-ignore
    const type = 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST' as RequestType;
    const fbMsgPayload = aFbMessagePayload(privateKey, type, 'CONFIGURATION_MANAGER');
    const fbMessage: FBMessage = { type, payload: fbMsgPayload };
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);
    const messageEnvelope = utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    const expectedMessage: MessageEnvelop = {
      message: fbMessage.payload,
      transportMetadata: {
        requestId: '',
        type: fbMessage.type,
      },
    };
    expect(messageEnvelope).toEqual({ request: expectedMessage, msgId: fbMessageEnvelope.msgId });
  });

  it('should verify tx sign request message', () => {
    const { privateKey: PSprivateKey, publicKey: PSpublicKey } = aKeyPair();
    const { privateKey: SSprivateKey, publicKey: SSpublicKey } = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      ps: PSpublicKey,
      vs: SSpublicKey,
    };
    const txId = c.guid();
    const fbMessage = aFbTxSignRequestMessage(SSprivateKey, PSprivateKey, { txId });
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);
    const messageEnvelope = utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    const expectedMessage: MessageEnvelop = {
      message: fbMessage.payload,
      transportMetadata: {
        requestId: txId,
        type: fbMessage.type,
      },
    };
    expect(messageEnvelope).toEqual({ request: expectedMessage, msgId: fbMessageEnvelope.msgId });
  });

  it('should not verify a tx sign request message with false signing service signature', () => {
    const { privateKey } = aKeyPair();
    const { privateKey: PSprivateKey, publicKey: PSpublicKey } = aKeyPair();
    const { privateKey: SSprivateKey, publicKey: SSpublicKey } = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      ps: PSpublicKey,
      vs: SSpublicKey,
    };
    const fbMessage = aFbTxSignRequestMessage(privateKey, PSprivateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Invalid signature from signing_service"');
  });

  it('should not verify a tx sign request message with false ps signature', () => {
    const { privateKey } = aKeyPair();
    const { privateKey: PSprivateKey, publicKey: PSpublicKey } = aKeyPair();
    const { privateKey: SSprivateKey, publicKey: SSpublicKey } = aKeyPair();
    const certificates = {
      zs: ZS.publicKey,
      ps: PSpublicKey,
      vs: SSpublicKey,
    };
    const fbMessage = aFbTxSignRequestMessage(SSprivateKey, privateKey);
    const fbMessageEnvelope = buildASignedMessage(fbMessage, ZS.privateKey);

    const expectToThrow = () => utils.decodeAndVerifyMessage(fbMessageEnvelope, certificates);

    expect(expectToThrow).toThrowErrorMatchingInlineSnapshot('"Invalid signature from policy_service"');
  });

  it('rejects a non-string (object) msg instead of bypassing verification', () => {
    const certificates = { zs: ZS.publicKey, cm: ZS.publicKey };
    // An attacker-supplied object payload previously skipped jwt.verify entirely.
    const objectEnvelope = {
      deviceId: 'some-device-id',
      msgId: 7,
      internalMessageId: 'internal-message-id',
      msg: { type: 'KEY_LINK_TX_SIGN_REQUEST', payload: { payload: '{}' } },
    } as unknown as FBMessageEnvelope;

    expect(() => utils.decodeAndVerifyMessage(objectEnvelope, certificates)).toThrow('expected a signed JWT string');
  });

  it('rejects an HS256 token forged with the public zs cert (algorithm confusion)', () => {
    const certificates = { zs: ZS.publicKey, cm: ZS.publicKey };
    const fbMessage = aFbProofOfOwnershipMessage(aKeyPair().privateKey);
    // Forge with HS256 using the *public* zs cert as the HMAC secret; the RS256 pin must reject it.
    const forged: FBMessageEnvelope = {
      deviceId: 'some-device-id',
      msgId: 9,
      internalMessageId: 'internal-message-id',
      msg: jwt.sign(JSON.stringify(fbMessage), ZS.publicKey, { algorithm: 'HS256' }),
    };

    expect(() => utils.decodeAndVerifyMessage(forged, certificates)).toThrow('JWT Message signature is invalid');
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

function aFbTxSignRequestMessage(
  privateKey: string,
  policyPrivateKey: string,
  payloadFields?: Partial<MessagePayload>,
): FBMessage {
  const txMetadata = aTxMetadata(policyPrivateKey) as any;
  return aCustomFbTxSignRequestMessage(privateKey, { ...payloadFields, metadata: txMetadata });
}

function aCustomFbProofOfOwnershipMessage(privateKey: string, payloadFields?: Partial<MessagePayload>): FBMessage {
  const type = 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST';
  const fbMsgPayload = aFbMessagePayload(privateKey, type, 'CONFIGURATION_MANAGER', payloadFields);
  return {
    type,
    payload: fbMsgPayload,
  };
}

function aFbProofOfOwnershipMessage(privateKey: string, payloadFields?: Partial<MessagePayload>): FBMessage {
  return aCustomFbProofOfOwnershipMessage(privateKey, { ...payloadFields, version: '2.0.0' });
}

function aFbMessagePayload(
  privateKey: string,
  type: RequestType,
  service: string,
  payloadFields?: Partial<MessagePayload>,
): FBMessagePayload {
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
  const txMetaData = '{ "example": "metadata" }';
  const signer = crypto.createSign('sha256');
  signer.update(txMetaData);
  const signature = signer.sign(privateKey, 'hex');

  return {
    txMetaData,
    txMetaDataSignatures: [
      {
        id: 'policy_service',
        type: 'SERVICE',
        signature,
      },
    ],
  };
}

function buildASignedMessage(innerMessage: FBMessage, zsSigningKey: string): FBMessageEnvelope {
  const jwtMessage = jwt.sign(JSON.stringify(innerMessage), zsSigningKey, { algorithm: 'RS256' });
  return {
    deviceId: 'some-device-id',
    msgId: 1,
    msg: jwtMessage,
    internalMessageId: 'internal-message-id',
  };
}
