import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  Algorithm,
  CertificatesMap,
  FBMessage,
  FBMessageEnvlope,
  FBSignatureMessage,
  GUID,
  JWT,
  MPCPayload,
  Message,
  MessagePayload,
  ProofOfOwnershipPayload,
  TxType,
} from '../types';

let certMap;
export const decodeAndVerifyMessage = (messageEnvelope: FBMessageEnvlope, certificates: CertificatesMap): Message => {
  try {
    certMap = certificates;
    const zsCertificate = certMap['zs'];
    const decodedMessage = jwt.verify(messageEnvelope.msg as JWT, zsCertificate) as FBMessage<MessagePayload>;
    verifyMpcMessage(decodedMessage);
    return toMessage(messageEnvelope.msgId, decodedMessage);
  } catch (e) {
    throw new Error('Message signature is invalid');
  }
};

const toMessage = (msgId: GUID, fbMessage: FBMessage<MessagePayload>): Message => {
  const shared = {
    msgId,
    type: fbMessage.type,
  };
  switch (fbMessage.type) {
    case TxType.MPC_START_SIGNING: {
      const mpcMessage = fbMessage as FBMessage<MPCPayload>;
      const { txId, keyId, payload, algorithm } = mpcMessage.payload;
      return {
        ...shared,
        txId,
        keyId,
        payload,
        algorithm: algorithm === 101 ? Algorithm.ECDSA : Algorithm.EDDSA,
      };
    }
    case TxType.EXTERNAL_KEY_PROOF_OF_OWNERSHIP: {
      const ownershipMessage = fbMessage as FBSignatureMessage;
      const parsedPayload = JSON.parse(ownershipMessage.payload) as ProofOfOwnershipPayload;
      const { externalKeyId, algorithm, requestId } = parsedPayload;
      return {
        ...shared,
        keyId: externalKeyId,
        txId: requestId,
        payload: ownershipMessage.payload,
        algorithm: algorithm === 101 ? Algorithm.ECDSA : Algorithm.EDDSA,
      };
    }
  }
};

const verifyMpcMessage = (message: FBMessage<MessagePayload>): boolean => {
  const toVerify = getDataToVerify(message);
  for (const verifying of toVerify) {
    const isSignatureValid = verifyRSASignatureFromCertificate(
      verifying.payload,
      verifying.signatureInfo.signature,
      verifying.certificate,
      verifying.signatureInfo.format,
    );
    if (!isSignatureValid) {
      throw 'invalid signature';
    }
    return isSignatureValid;
  }
};

function verifyRSASignatureFromCertificate(
  payload: string,
  signature: string,
  certificatePEM: string,
  signatureFormat: SignatureFormat,
): boolean {
  const verifier = crypto.createVerify('sha256');
  verifier.update(payload);
  return verifier.verify(certificatePEM, signature, signatureFormat);
}

const getDataToVerify = (message: FBMessage<MessagePayload>): VerifyDetails[] => {
  const res: VerifyDetails[] = [];

  switch (message.type) {
    case TxType.MPC_START_SIGNING: {
      //   const verifyDetails = await this._buildVerifyDetailsForMessagesWithSignature(message, jwtInfo);
      const metaData = buildVerifyDetailsForMessagesWithMetadata(message as FBMessage<MPCPayload>);
      res.push(...metaData);
      // res.push(...verifyDetails);
      break;
    }
    case TxType.EXTERNAL_KEY_PROOF_OF_OWNERSHIP: {
      const ownershipMessage = message as FBSignatureMessage;
      const messageVerifier = KEY_TO_VERIFIER_MAP[ownershipMessage.signatureId];
      const certificate = certMap[messageVerifier];
      res.push({
        payload: ownershipMessage.payload,
        certificate,
        signatureInfo: {
          signature: ownershipMessage.signature,
          format: 'hex',
        },
      });
      break;
    }
  }
  return res;
};

const buildVerifyDetailsForMessagesWithMetadata = (message: FBMessage<MPCPayload>): VerifyDetails[] => {
  const { metadata } = message.payload;
  const metadataVerifier = KEY_TO_VERIFIER_MAP[metadata.txMetaDataSignatures[0].id];
  const serviceCertificate = certMap[metadataVerifier];
  return [
    {
      payload: metadata.txMetaData,
      certificate: serviceCertificate,
      signatureInfo: {
        signature: metadata.txMetaDataSignatures[0].signature,
        format: 'hex',
      },
    },
  ];
};

interface VerifyDetails {
  payload: string;
  certificate: string;
  signatureInfo: {
    signature: string;
    format: SignatureFormat;
  };
}

export type SignatureFormat = 'base64' | 'hex';

const KEY_TO_VERIFIER_MAP: Record<string, string> = {
  MPC_START_SIGNING: 'vs',
  policy_service: 'ps',
  configuration_manager: 'cm',
};
