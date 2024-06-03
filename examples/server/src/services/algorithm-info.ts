import * as pkcs11js from "pkcs11js";

// current pkcs11js  aligned with pkcs11 spec 2.40 which does not include EDDSA.
// It is included in 3.0 which can be found https://docs.oasis-open.org/pkcs11/pkcs11-curr/v3.0/csprd01/pkcs11-curr-v3.0-csprd01.html#_Toc10560880
// Assuming that the shared object and the hardware supports EDDSA
const CKK_EC_EDWARDS = 0x00000040;
const CKM_EDDSA = 0x00001057;
const CKM_EC_EDWARDS_KEY_PAIR_GEN = 0x00001055

export interface PKCSAlgorithmInfo {
    oid: Buffer;
    type: number;
    generateKeyMechanism: number;
    signMechanism: number;
    verifyMechanism: number;
}

const EcdsaSecp256k1Info: PKCSAlgorithmInfo = {
    oid: Buffer.from("06052b8104000A", "hex"),
    type: pkcs11js.CKK_EC,
    generateKeyMechanism: pkcs11js.CKM_EC_KEY_PAIR_GEN,
    signMechanism: pkcs11js.CKM_ECDSA,
    verifyMechanism: pkcs11js.CKM_ECDSA,
};

const EddsaInfo: PKCSAlgorithmInfo = {
    oid: Buffer.from("06032b6570", "hex"),
    type: CKK_EC_EDWARDS,
    generateKeyMechanism: CKM_EC_EDWARDS_KEY_PAIR_GEN,
    signMechanism: CKM_EDDSA,
    verifyMechanism: CKM_EDDSA,
};

export const ALGORITHMS_INFO = new Map<string, PKCSAlgorithmInfo>([
    ['ECDSA_SECP256K1', EcdsaSecp256k1Info],
    ['EDDSA_ED25519', EddsaInfo],
]);

export const SUPPORTED_ALGORITHMS = Array.from(ALGORITHMS_INFO.keys());
