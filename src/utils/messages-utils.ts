import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  Algorithm,
  CertificatesMap,
  FBMessage,
  FBMessageEnvlope,
  GUID,
  JWT,
  Message,
  TxType,
} from '../types';

let certMap;
export const decodeAndVerifyMessage = (
  messageEnvelope: FBMessageEnvlope,
  certificates: CertificatesMap,
): Message => {
  try {
    certMap = certificates;
    const zsCertificate = certMap['zs'];
    const decodedMessage = jwt.verify(messageEnvelope.msg as JWT, zsCertificate) as FBMessage;
    verifyMpcMessage(decodedMessage);
    return toMessage(messageEnvelope.msgId, decodedMessage);
  } catch (e) {
    throw new Error('Message signature is invalid');
  }
};

const toMessage = (msgId: GUID, fbMessage: FBMessage): Message => {
  const { txId, keyId, payload } = fbMessage.payload;
  return {
    msgId,
    type: TxType.MPC_START_SIGNING,
    txId,
    keyId,
    payload,
    algorithm: fbMessage.payload.algorithm === 101 ? Algorithm.ECDSA : Algorithm.EDDSA,
  };
};

const verifyMpcMessage = (message: FBMessage): boolean => {
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

const getDataToVerify = (message: FBMessage): VerifyDetails[] => {
  const res: VerifyDetails[] = [];
  //   const verifyDetails = await this._buildVerifyDetailsForMessagesWithSignature(message, jwtInfo);
  const metaData = buildVerifyDetailsForMessagesWithMetadata(message);
  switch (message.type) {
    case TxType.MPC_START_SIGNING: {
      res.push(...metaData);
      // res.push(...verifyDetails);
      break;
    }
  }
  return res;
};

const buildVerifyDetailsForMessagesWithMetadata = (message: FBMessage): VerifyDetails[] => {
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
};
