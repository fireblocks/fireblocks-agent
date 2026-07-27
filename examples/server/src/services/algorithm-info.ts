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
    // CKA_EC_PARAMS for ed25519. Thales Luna's CKM_EC_EDWARDS_KEY_PAIR_GEN expects the
    // PKCS#11 v3.0 "CurveName" as a DER PrintableString "edwards25519"
    // (13 0c 65 64 77 61 72 64 73 32 35 35 31 39), NOT the RFC 8410 OID 1.3.101.112
    // (06 03 2b 65 70). Passing the OID makes Luna fail C_GenerateKeyPair with
    // CKR_VENDOR_DEFINED. This matches the template OpenSC (pkcs11-tool
    // --key-type EC:edwards25519) sends, captured via pkcs11-spy on the Luna partition.
    oid: Buffer.from("130c656477617264733235353139", "hex"),
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
