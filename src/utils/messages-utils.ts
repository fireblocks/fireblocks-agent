import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CertificatesMap, FBMessage, FBMessageEnvelope, JWT, Message, MessageEnvelop } from '../types';

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
    verifyFbMessage(fbMessage);
    return toMessage(fbMsgEnvelope.msgId, fbMessage);
  } catch (e) {
    throw new Error('Message signature is invalid');
  }
};

const toMessage = (msgId: number, fbMessage: FBMessage): MessageEnvelop => {
  const fbMsgPayload = fbMessage.payload;
  const parsedMessage = JSON.parse(fbMsgPayload.payload) as Message;

  return {
    msgId,
    type: fbMessage.type,
    requestId: extractMessageUniqueId(fbMessage),
    message: parsedMessage,
    payload: fbMsgPayload.payload,
  };
};

const verifyFbMessage = (message: FBMessage): boolean => {
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

const getVerifyDetailsFromPayloadSignature = (payloadSignature: { service: string, signature: string }, payload: string): VerifyDetails => {
  const serviceSigner = payloadSignature.service.toLowerCase();
  const messageVerifier = KEY_TO_VERIFIER_MAP[serviceSigner];
  if (!certMap.hasOwnProperty(messageVerifier)) {
    throw new Error(`Certificate for ${serviceSigner} is missing`);
  }

  return {
    payload: payload,
    certificate: certMap[messageVerifier],
    signatureInfo: {
      signature: payloadSignature.signature,
      format: 'hex',
    },
  };
}

const getPayloadVerifyDetails = (fbMessage: FBMessage): VerifyDetails => {
  const fbMsgPayload = fbMessage.payload;
  const payloadSignatureData = fbMsgPayload.signatureData;
  if (payloadSignatureData === undefined && payloadSignatureData === null) {
    throw new Error('Payload signature data is missing');
  }

  return getVerifyDetailsFromPayloadSignature(payloadSignatureData, fbMsgPayload.payload);
}

const getDataToVerify = (fbMessage: FBMessage): VerifyDetails[] => {
  const res: VerifyDetails[] = [];

  switch (fbMessage.type) {
    case 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST': {
      res.push(getPayloadVerifyDetails(fbMessage));
      break;
    }
  }
  return res;
};

const extractMessageUniqueId = (fbMessage: FBMessage): string => {
  const fbMsgPayload = fbMessage.payload;
  const parsedMessage = JSON.parse(fbMsgPayload.payload);

  return parsedMessage.requestId ?? parsedMessage.txId ?? "";
}

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
