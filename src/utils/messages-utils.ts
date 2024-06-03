import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CertificatesMap, FBMessage, FBMessageEnvelope, JWT, MessageEnvelop, MessagePayload } from '../types';

const PROOF_OF_OWNERSHIP_SUPPORTED_MAJOR_VERSIONS = ['2'];

let certMap;
export const decodeAndVerifyMessage = (
  fbMsgEnvelope: FBMessageEnvelope,
  certificates: CertificatesMap,
): MessageEnvelop => {
  try {
    certMap = certificates;
    let fbMessage = fbMsgEnvelope.msg;
    if (typeof fbMessage === 'string') {
      const zsCertificate = certMap['zs'];
      fbMessage = jwt.verify(fbMsgEnvelope.msg as JWT, zsCertificate) as FBMessage;
    }

    const parsedMessage = JSON.parse(fbMessage.payload) as MessagePayload;
    verifyFbMessage(fbMessage, parsedMessage);

    return {
      transportMetadata: {
        msgId: fbMsgEnvelope.msgId,
        deviceId: fbMsgEnvelope.deviceId,
        internalMessageId: fbMsgEnvelope.internalMessageId,
        type: parsedMessage.type,
      },
      message: fbMessage,
    };
  } catch (e) {
    throw new Error('Message signature is invalid');
  }
};

const verifyFbMessage = (message: FBMessage, parsedMessage: MessagePayload): boolean => {
  const toVerify = getDataToVerify(message, parsedMessage);
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

const getDataToVerify = (fbMessage: FBMessage, parsedMessage: MessagePayload): VerifyDetails[] => {
  const res: VerifyDetails[] = [];

  const fbMsgPayload: string = fbMessage.payload;
  switch (parsedMessage.type) {
    case 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST': {
      // Deprecated message no need to verify it
      break;
    }
    case 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST': {
      const msgVersion = parsedMessage.version;
      if (msgVersion === undefined || !PROOF_OF_OWNERSHIP_SUPPORTED_MAJOR_VERSIONS.includes(msgVersion.split('.')[0])) {
        throw new Error('Unsupported message version');
      }

      const messageVerifier = KEY_TO_VERIFIER_MAP[fbMessage.payloadSignatureData.service.toLowerCase()];
      const certificate = certMap[messageVerifier];
      res.push({
        payload: fbMsgPayload,
        certificate,
        signatureInfo: {
          signature: fbMessage.payloadSignatureData.signature,
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
