import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CertificatesMap, FBMessage, FBMessageEnvelope, JWT, MessageEnvelop } from '../types';

const PROOF_OF_OWNERSHIP_SUPPORTED_MAJOR_VERSIONS = ['2'];

let certMap;
export const decodeAndVerifyMessage = (
  fbMsgEnvelope: FBMessageEnvelope,
  certificates: CertificatesMap,
): MessageEnvelop => {
  certMap = certificates;
  let fbMessage = fbMsgEnvelope.msg;
  if (typeof fbMessage === 'string') {
    try {
      const zsCertificate = certMap['zs'];
      fbMessage = jwt.verify(fbMsgEnvelope.msg as JWT, zsCertificate) as FBMessage;
    } catch (e) {
      throw new Error('JWT Message signature is invalid');
    }
  }

  verifyFbMessage(fbMessage);

  return {
    transportMetadata: {
      msgId: fbMsgEnvelope.msgId,
      deviceId: fbMsgEnvelope.deviceId,
      internalMessageId: fbMsgEnvelope.internalMessageId,
      type: fbMessage.type,
    },
    message: fbMessage.payload,
  };
};

const verifyFbMessage = (message: FBMessage): boolean => {
  const toVerify = getDataToVerify(message);
  try {
    for (const verifying of toVerify) {
      if (!verifyRSASignatureFromCertificate(
        verifying.payload,
        verifying.signatureInfo.signature,
        verifying.certificate,
        verifying.signatureInfo.format,
      )) {
        throw 'invalid signature';
      }
    }
  } catch (e) {
    throw new Error('Message signature is invalid');
  }

  return true;
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

const getDataToVerify = (fbMessage: FBMessage): VerifyDetails[] => {
  const res: VerifyDetails[] = [];

  switch (fbMessage.type) {
    case 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST': {
      // Deprecated message no need to verify it
      break;
    }
    case 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST': {
      const fbMsgPayload = fbMessage.payload;
      let parsedMessage = JSON.parse(fbMsgPayload.payload);
      const msgVersion = parsedMessage.version;
      if (msgVersion === undefined || !PROOF_OF_OWNERSHIP_SUPPORTED_MAJOR_VERSIONS.includes(msgVersion.split('.')[0])) {
        throw new Error('Unsupported message version');
      }

      const messageVerifier = KEY_TO_VERIFIER_MAP[fbMsgPayload.payloadSignatureData.service.toLowerCase()];
      const certificate = certMap[messageVerifier];
      res.push({
        payload: fbMsgPayload.payload,
        certificate,
        signatureInfo: {
          signature: fbMsgPayload.payloadSignatureData.signature,
          format: 'hex',
        },
      });
      break;
    }
  }
  return res;
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
