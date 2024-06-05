import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CertificatesMap, FBMessage, FBMessageEnvelope, JWT, MessageEnvelop, TxMetadata, TxMetadataSignature } from '../types';

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
  for (const verifying of toVerify) {
    if (!verifyRSASignatureFromCertificate(
      verifying.payload,
      verifying.signatureInfo.signature,
      verifying.certificate,
      verifying.signatureInfo.format,
    )) {
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
}

const getDataToVerify = (fbMessage: FBMessage): VerifyDetails[] => {
  const res: VerifyDetails[] = [];

  const fbMsgPayload = fbMessage.payload;
  const payloadSigner = fbMsgPayload.payloadSignatureData.service.toLowerCase();
  const messageVerifier = KEY_TO_VERIFIER_MAP[payloadSigner];
  const certificate = certMap[messageVerifier];
  if (certificate === undefined) {
    throw new Error(`Certificate for ${payloadSigner} is missing`);
  }

  res.push({
    payload: fbMsgPayload.payload,
    certificate,
    service: payloadSigner,
    signatureInfo: {
      signature: fbMsgPayload.payloadSignatureData.signature,
      format: 'hex',
    },
  });

  switch (fbMessage.type) {
    case 'EXTERNAL_KEY_PROOF_OF_OWNERSHIP_REQUEST': {
      // Deprecated message no need to verify it
      break;
    }
    case 'KEY_LINK_PROOF_OF_OWNERSHIP_REQUEST': {
      let parsedMessage = JSON.parse(fbMsgPayload.payload);
      const msgVersion = parsedMessage.version;
      if (msgVersion === undefined) {
        throw new Error('Message version is missing');
      } else if (!PROOF_OF_OWNERSHIP_SUPPORTED_MAJOR_VERSIONS.includes(msgVersion.split('.')[0])) {
        throw new Error(`Unsupported message version: ${msgVersion}`);
      }
      break;
    }
    case 'KEY_LINK_TX_SIGN_REQUEST': {
      // Add verification for txMetaDataSignatures
      let parsedPayload = JSON.parse(fbMsgPayload.payload);
      const txMetadata: TxMetadata = parsedPayload.metadata;
      const policySignature = getPolicySignature(txMetadata.txMetaDataSignatures);
      const policyServiceName = policySignature.id.toLowerCase();
      const txMetadataVerifier = KEY_TO_VERIFIER_MAP[policyServiceName];
      const txMetadataCertificate = certMap[txMetadataVerifier];
      if (txMetadataCertificate === undefined) {
        throw new Error(`Certificate for ${policyServiceName} is missing`);
      }

      res.push({
        payload: txMetadata.txMetaData,
        certificate: txMetadataCertificate,
        service: policyServiceName,
        signatureInfo: {
          signature: policySignature.signature,
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
