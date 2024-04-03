import * as asn1 from 'asn1.js';
import { createHash } from 'crypto';
import * as pkcs11js from "pkcs11js";
import { Algorithm } from '../types';
import logger from './logger';


function hashSha256(inBuffer: Buffer): string {
    // Create a SHA-256 hash of the input string
    const hash = createHash('sha256');
    hash.update(inBuffer);

    // Convert the hash to a hexadecimal string
    const hashHex = hash.digest('hex');

    return hashHex;
}

export interface HSMFacade {
    generateKeyPair(algorithm: Algorithm): Promise<{ keyId: string; pem: string }>;
    sign(keyId: string, payload: string, algorithm: Algorithm): Promise<string>;
    verify(keyId: string, signature: string, payload: string, algorithm: Algorithm): Promise<boolean>;
}
const LIBRARY = '/usr/local/lib/softhsm/libsofthsm2.so';
const PIN = '1234';

class HSM implements HSMFacade {

    private pkcs11: pkcs11js.PKCS11;
    private slot: pkcs11js.Handle;
    private session: pkcs11js.Handle;
    constructor() {
        this.pkcs11 = new pkcs11js.PKCS11();
        this.pkcs11.load(LIBRARY);
        this.pkcs11.C_Initialize();
        this.slot = this.pkcs11.C_GetSlotList(true)[0];
        this.session = this.pkcs11.C_OpenSession(this.slot, pkcs11js.CKF_RW_SESSION | pkcs11js.CKF_SERIAL_SESSION);

        const genInfo: pkcs11js.ModuleInfo = this.pkcs11.C_GetInfo();
        logger.info('Using cryptoki Version:  ' + genInfo.cryptokiVersion.major + "." + genInfo.cryptokiVersion.minor);
        logger.info('Using HSM manufacturer id: ' + genInfo.manufacturerID);
        logger.info('Library description: ' + genInfo.libraryDescription);
        logger.info('Library version: ' + genInfo.libraryVersion.major + "." + genInfo.libraryVersion.minor);

        const slotInfo: pkcs11js.SlotInfo = this.pkcs11.C_GetSlotInfo(this.slot);
        logger.info('Using HSM slot ' + slotInfo.slotDescription);

        // Login to the session. Adjust as needed for your HSM's requirements.
        this.pkcs11.C_Login(this.session, pkcs11js.CKU_USER, PIN);

    }

    private destructor() {

        this.pkcs11.C_Logout(this.session);
        this.pkcs11.C_CloseSession(this.session);
        this.session = null;
        this.pkcs11.C_Finalize();
    }


    private _fixEcpt(ecpt: Buffer): Buffer {
        if ((ecpt.length & 1) === 0 &&
            (ecpt[0] === 0x04) && (ecpt[ecpt.length - 1] === 0x04)) {
            ecpt = ecpt.slice(0, ecpt.length - 1);
        } else if (ecpt[0] === 0x04 && ecpt[2] === 0x04) {
            ecpt = ecpt.slice(2);
        }
        return ecpt;
    }


    private _pemEncode(publicPoint: Buffer) {
        // Define an ASN.1 structure for the public key
        const ECPrivateKeyASN = asn1.define('ECPublicKey', function () {
            this.seq().obj(
                this.key('algorithm').seq().obj(
                    this.key('id').objid(),
                    this.key('curve').objid()
                ),
                this.key('pubKey').bitstr()
            );
        });

        // Specify the curve OID for secp256r1
        //const secp256r1Oid = [1, 2, 840, 10045, 3, 1, 7]; // OID for secp256r1
        const secp256k1Oid = [1, 3, 132, 0, 10]; // OID for secp256k1

        // Include the algorithm identifiers for an ECC public key using secp256r1
        const derEncodedPublicKey = ECPrivateKeyASN.encode({
            algorithm: {
                id: [1, 2, 840, 10045, 2, 1], // id-ecPublicKey
                curve: secp256k1Oid
            },
            pubKey: {
                data: publicPoint,
                unused: 0
            }
        }, 'der');

        // Convert the DER-encoded public key to PEM format
        const pemFormattedKey = `-----BEGIN PUBLIC KEY-----\n${derEncodedPublicKey.toString('base64')}\n-----END PUBLIC KEY-----`;

        return pemFormattedKey;
    }

    async generateKeyPair(algorithm: string): Promise<{ keyId: string; pem: string }> {
        //const secp256r1 = Buffer.from("06082A8648CE3D030107", "hex") //der encoded OID  1.2.840.10045.3.1.7 
        const secp256k1 = Buffer.from("06052b8104000A", "hex"); //der encoded  OID 1.3.132.0.10 

        try {
            const publicKeyTemplate =
                [
                    { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PUBLIC_KEY },
                    { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_EC },
                    { type: pkcs11js.CKA_TOKEN, value: true },
                    { type: pkcs11js.CKA_PRIVATE, value: false },
                    { type: pkcs11js.CKA_VERIFY, value: true },
                    { type: pkcs11js.CKA_EC_PARAMS, value: secp256k1 },
                ];
            const privateKeyTemplate =
                [
                    { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY },
                    { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_EC },
                    { type: pkcs11js.CKA_PRIVATE, value: true },
                    { type: pkcs11js.CKA_TOKEN, value: true },
                    { type: pkcs11js.CKA_SIGN, value: true },
                    { type: pkcs11js.CKA_DERIVE, value: true },
                ];

            var keys = this.pkcs11.C_GenerateKeyPair(this.session,
                { mechanism: pkcs11js.CKM_EC_KEY_PAIR_GEN },
                publicKeyTemplate,
                privateKeyTemplate);

            const attrs = this.pkcs11.C_GetAttributeValue(this.session, keys.publicKey, [{ type: pkcs11js.CKA_EC_POINT }])

            if (!(attrs[0].value instanceof Buffer)) {
                throw new Error("ec is not buffer");
            }

            const ec = attrs[0].value;
            const ecpt = this._fixEcpt(ec);
            logger.debug('ec=' + ec.toString('hex') + ', ecpt=' + ecpt.toString('hex'));

            const keyId: string = hashSha256(ecpt);
            const ski = Buffer.from(keyId, 'hex');
            logger.debug('ski=' + ski.toString('hex'));

            this.pkcs11.C_SetAttributeValue(this.session, keys.publicKey,
                [{ type: pkcs11js.CKA_ID, value: ski },
                { type: pkcs11js.CKA_LABEL, value: ski.toString('hex') }]);
            this.pkcs11.C_SetAttributeValue(this.session, keys.privateKey,
                [{ type: pkcs11js.CKA_ID, value: ski },
                { type: pkcs11js.CKA_LABEL, value: ski.toString('hex') }]);


            logger.debug('pub  CKA_ID: ' + JSON.stringify(
                (this.pkcs11.C_GetAttributeValue(this.session, keys.publicKey,
                    [{ type: pkcs11js.CKA_ID }]))[0].value));

            logger.debug('pub  CKA_LABEL: ' + JSON.stringify(
                (this.pkcs11.C_GetAttributeValue(this.session, keys.publicKey,
                    [{ type: pkcs11js.CKA_LABEL }]))[0].value));


            //const pem = await this.exportPublicKeyAsPem(keyId);
            const pem = this._pemEncode(ecpt);

            logger.info('Generated Key ' + keyId + ', pub key: ' + ec.toString('hex') + ', Pem encoded: ' + pem);

            return { keyId, pem }
        }
        catch (error) {
            console.error("An error occurred:", error);

            return { keyId: "", pem: "" };
        }
    }


    private _getPrivateKey(keyId: string) {
        // Find the private key by ID
        const template = [
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY },
            { type: pkcs11js.CKA_ID, value: Buffer.from(keyId, 'hex') }
        ];
        this.pkcs11.C_FindObjectsInit(this.session, template);
        let hObject = this.pkcs11.C_FindObjects(this.session);
        this.pkcs11.C_FindObjectsFinal(this.session);

        if (hObject == null) {
            logger.error(`Key not found : ${keyId}`);
            return null;
        }

        return hObject;

    }

    async sign(keyId: string, payload: string, algorithm: string): Promise<string> {
        try {

            logger.info(`Request to sign with key ${keyId} payload: ${payload} algo: ${algorithm}`);

            // Find the private key by ID
            let provKeyObj = this._getPrivateKey(keyId);

            if (null != provKeyObj) {
                logger.info(`Private key found ${keyId}`);
            }


            // Sign the payload
            this.pkcs11.C_SignInit(this.session, { mechanism: pkcs11js.CKM_ECDSA }, provKeyObj);
            //EC signatures are represented as a 32-bit R followed by a 32-bit S value, and not ASN.1 encoded.
            const signature: Buffer = this.pkcs11.C_Sign(this.session, Buffer.from(payload, 'hex'), Buffer.alloc(64));
            const signatureInHex: string = signature.toString('hex');

            logger.info(`Signed with key id ${keyId} signature hex: ${signatureInHex}`);

            return signatureInHex;
        }
        catch (error) {
            console.error("An error occurred:", error);

            return "";
        }

    }

    async verify(keyId: string, signature: string, payload: string, algorithm: string): Promise<boolean> {
        try {
            let provKeyObj = this._getPrivateKey(keyId);

            this.pkcs11.C_VerifyInit(this.session, { mechanism: pkcs11js.CKM_ECDSA }, provKeyObj);
            const ok = this.pkcs11.C_Verify(this.session, Buffer.from(payload, 'hex'), Buffer.from(signature, 'hex'));
            logger.info(`Verified with key id ${keyId} is ${ok}`);

            return ok;
        }
        catch (error) {
            console.error("An error occurred:", error);

            return false;
        }
    }
}

export default new HSM();
