import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  CertificatesMap,
  DecodedMessage,
  FBMessage,
  FBMessageEnvelope,
  JWT,
  MessageEnvelop,
  TxMetadata,
  TxMetadataSignature,
} from '../types';

const PROOF_OF_OWNERSHIP_SUPPORTED_MAJOR_VERSIONS = ['2'];

let certMap;
export const decodeAndVerifyMessage = (
  fbMsgEnvelope: FBMessageEnvelope,
  certificates: CertificatesMap,
): DecodedMessage => {
  certMap = certificates;
  let fbMessage = fbMsgEnvelope.msg;
  if (typeof fbMessage === 'string') {
    try {
      const zsCertificate = certMap['zs'];
      fbMessage = jwt.verify(fbMsgEnvelope.msg as JWT, zsCertificate) as FBMessage;
    } catch (e) {
      fbMessage = jwt.decode(fbMsgEnvelope.msg as JWT) as FBMessage;
      throw new Error(
        `JWT Message signature is invalid. msgId: ${fbMsgEnvelope.msgId} type: ${
          fbMessage.type
        } requestId: ${extractMessageUniqueId(fbMessage)} Full message: ${fbMsgEnvelope.msg}`,
      );
    }
  }

  verifyFbMessage(fbMessage);

  const request: MessageEnvelop = {
    transportMetadata: {
      requestId: extractMessageUniqueId(fbMessage),
      type: fbMessage.type,
    },
    message: fbMessage.payload,
  };

  return {
    request,
    msgId: fbMsgEnvelope.msgId,
  };
};

const verifyFbMessage = (message: FBMessage): boolean => {
  const toVerify = getDataToVerify(message);
  for (const verifying of toVerify) {
    if (
      !verifyRSASignatureFromCertificate(
        verifying.payload,
        verifying.signatureInfo.signature,
        verifying.certificate,
        verifying.signatureInfo.format,
      )
    ) {
      throw new Error(`Invalid signature from ${verifying.service}`);
    }
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

const getPolicySignature = (txMetaDataSignatures: Array<TxMetadataSignature>): TxMetadataSignature => {
  return txMetaDataSignatures.find((_) => _.id === 'policy_service');
};

const getVerifyDetailsFromPayloadSignature = (
  payloadSignature: { service: string; signature: string },
  payload: string,
): VerifyDetails => {
  const serviceSigner = payloadSignature.service.toLowerCase();
  const messageVerifier = KEY_TO_VERIFIER_MAP[serviceSigner];
  if (!certMap.hasOwnProperty(messageVerifier)) {
    throw new Error(`Certificate for ${serviceSigner} is missing`);
  }

  return {
    payload: payload,
    certificate: certMap[messageVerifier],
    service: serviceSigner,
    signatureInfo: {
      signature: payloadSignature.signature,
      format: 'hex',
    },
  };
};

const getPayloadVerifyDetails = (fbMessage: FBMessage): VerifyDetails => {
  const fbMsgPayload = fbMessage.payload;
  const payloadSignatureData = fbMsgPayload.payloadSignatureData;
  if (payloadSignatureData === undefined || payloadSignatureData === null) {
    throw new Error('Payload signature data is missing');
  }

  return getVerifyDetailsFromPayloadSignature(payloadSignatureData, fbMsgPayload.payload);
};

const getDataToVerify = (fbMessage: FBMessage): VerifyDetails[] => {
  const res: VerifyDetails[] = [];

  switch (fbMessage.type) {
    case 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST': {
      res.push(getPayloadVerifyDetails(fbMessage));

      const fbMsgPayload = fbMessage.payload;
      const parsedMessage = JSON.parse(fbMsgPayload.payload);
      const msgVersion = parsedMessage.version;
      if (msgVersion === undefined || msgVersion == null) {
        throw new Error('Message version is missing');
      } else if (!PROOF_OF_OWNERSHIP_SUPPORTED_MAJOR_VERSIONS.includes(msgVersion.split('.')[0])) {
        throw new Error(`Unsupported message version: ${msgVersion}`);
      }
      break;
    }
    case 'KEY_LINK_TX_SIGN_REQUEST': {
      res.push(getPayloadVerifyDetails(fbMessage));

      // Add verification for txMetaDataSignatures
      const fbMsgPayload = fbMessage.payload;
      const parsedPayload = JSON.parse(fbMsgPayload.payload);
      const txMetadata: TxMetadata = parsedPayload.metadata;
      const policySignature = getPolicySignature(txMetadata.txMetaDataSignatures);
      const policyServiceName = policySignature.id.toLowerCase();
      res.push(
        getVerifyDetailsFromPayloadSignature(
          { service: policyServiceName, signature: policySignature.signature },
          txMetadata.txMetaData,
        ),
      );
      break;
    }
  }

  return res;
};

const extractMessageUniqueId = (fbMessage: FBMessage): string => {
  const fbMsgPayload = fbMessage.payload;
  const parsedMessage = JSON.parse(fbMsgPayload.payload);

  return parsedMessage.requestId ?? parsedMessage.txId ?? '';
};

interface VerifyDetails {
  payload: string;
  certificate: string;
  service: string;
  signatureInfo: {
    signature: string;
    format: SignatureFormat;
  };
}

export type SignatureFormat = 'base64' | 'hex';

const KEY_TO_VERIFIER_MAP: Record<string, string> = {
  signing_service: 'vs',
  policy_service: 'ps',
  configuration_manager: 'cm',
};
