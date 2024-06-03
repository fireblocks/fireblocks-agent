import * as asn1 from 'asn1.js';
import { createHash } from 'crypto';
import * as pkcs11js from "pkcs11js";
import { Algorithm } from '../types';
import { ALGORITHMS_INFO, PKCSAlgorithmInfo, SUPPORTED_ALGORITHMS } from './algorithm-info';
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

// Define an ASN.1 structure using asn1.js that can handle both bit string and octet string
const GenericASN1Data = asn1.define('GenericASN1Data', function () {
    this.choice({
        bitString: this.bitstr(),
        octetString: this.octstr()
    });
});


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

    // can be called to cleanup pkcs11 library resources
    public dispose() {

        this.pkcs11.C_Logout(this.session);
        this.pkcs11.C_CloseSession(this.session);
        this.session = null;
        this.pkcs11.C_Finalize();
    }

    private decodeASN1Data(buffer: Buffer): Buffer {

        // Attempt to decode the buffer using the defined ASN.1 structure
        try {
            const decoded = GenericASN1Data.decode(buffer, 'der');
            // Return the data based on the type that was successfully decoded
            if (decoded.type === 'bitString') {
                return decoded.value.data; // For bitString, return the data portion
            } else if (decoded.type === 'octetString') {
                return decoded.value; // For octetString, return the Buffer directly
            }
        } catch (error) {
            console.error('Failed to decode ASN.1 data:', error);
            throw error;
        }
    }

    private derEncodeEcdsaPublicKey(publicPoint: Buffer) {
        // Define an ASN.1 structure for the ECDSA public key
        const ECPublicKeyASN = asn1.define('ECPublicKey', function () {
            this.seq().obj(
                this.key('algorithm').seq().obj(
                    this.key('id').objid(),
                    this.key('curve').objid()
                ),
                this.key('pubKey').bitstr()
            );
        });

        const secp256k1Oid = [1, 3, 132, 0, 10];

        return ECPublicKeyASN.encode({
            algorithm: {
                id: [1, 2, 840, 10045, 2, 1],
                curve: secp256k1Oid
            },
            pubKey: {
                data: publicPoint,
                unused: 0
            }
        }, 'der');
    }

    private derEncodeEddsaPublicKey(publicPoint: Buffer) {
        // Define an ASN.1 structure for the EDDSA public key
        const EdDSAPublicKeyASN = asn1.define('EdDSAPublicKey', function () {
            this.seq().obj(
                this.key('algorithm').seq().obj(
                    this.key('id').objid()
                ),
                this.key('pubKey').bitstr()
            );
        });

        const ed25519Oid = [1, 3, 101, 112];

        return EdDSAPublicKeyASN.encode({
            algorithm: {
                id: ed25519Oid
            },
            pubKey: {
                data: publicPoint,
                unused: 0
            }
        }, 'der');
    }

    // this function DER encodes public key and than encodes it again as PEM
    private pemEncode(publicPoint: Buffer, algorithm: string) {
        let derEncodedPublicKey: Buffer;
        if (algorithm === "ECDSA_SECP256K1") {
            derEncodedPublicKey = this.derEncodeEcdsaPublicKey(publicPoint);
        } else if (algorithm === "EDDSA_ED25519") {
            derEncodedPublicKey = this.derEncodeEddsaPublicKey(publicPoint);
        } else {
            throw new Error(`Unsupported algorithm ${algorithm}`);
        }

        // Convert the DER-encoded public key to PEM format
        const pemFormattedKey = `-----BEGIN PUBLIC KEY-----\n${derEncodedPublicKey.toString('base64')}\n-----END PUBLIC KEY-----`;

        return pemFormattedKey;
    }

    // generates ECDSA secp256k1 keypair. Should be adjusted to generate other key pairs
    async generateKeyPair(algorithm: string): Promise<{ keyId: string; pem: string }> {
        logger.info(`Request to generate ${algorithm} key pair`);

        const algoInfo: PKCSAlgorithmInfo = ALGORITHMS_INFO.get(algorithm);
        if (!SUPPORTED_ALGORITHMS.includes(algorithm) || algoInfo === undefined) {
            throw new Error(`Unsupported algorithm ${algorithm}`);
        }

        const publicKeyTemplate = [
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PUBLIC_KEY },
            { type: pkcs11js.CKA_KEY_TYPE, value: algoInfo.type },
            { type: pkcs11js.CKA_TOKEN, value: true }, //controls if the key is session scope or global
            { type: pkcs11js.CKA_PRIVATE, value: false },
            { type: pkcs11js.CKA_VERIFY, value: true },
            { type: pkcs11js.CKA_EC_PARAMS, value: algoInfo.oid },
        ];

        const privateKeyTemplate = [
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY },
            { type: pkcs11js.CKA_KEY_TYPE, value: algoInfo.type },
            { type: pkcs11js.CKA_PRIVATE, value: true },
            { type: pkcs11js.CKA_TOKEN, value: true },//controls if the key is session scope or global
            { type: pkcs11js.CKA_SIGN, value: true },
            { type: pkcs11js.CKA_DERIVE, value: true },
        ];

        //create a new key pair object
        const keys = this.pkcs11.C_GenerateKeyPair(
            this.session,
            { mechanism: algoInfo.generateKeyMechanism },
            publicKeyTemplate,
            privateKeyTemplate
        );

        //retrieve public key
        const attrs = this.pkcs11.C_GetAttributeValue(this.session, keys.publicKey, [{ type: pkcs11js.CKA_EC_POINT }])

        if (!(attrs[0].value instanceof Buffer)) {
            throw new Error("ec is not buffer");
        }

        //convert der encoded public key into hex buffer containing EC (X, Y) coordinates
        const ec = attrs[0].value;
        const ecpt = this.decodeASN1Data(ec);

        logger.info(`ec=${ec.toString('hex')}, ecpt=${ecpt.toString('hex')}}`);

        //generate key id based on public key
        const keyId: string = hashSha256(ecpt);
        const ski = Buffer.from(keyId, 'hex');
        logger.debug('ski=' + ski.toString('hex'));

        //define key id and label based on the public key
        this.pkcs11.C_SetAttributeValue(
            this.session,
            keys.publicKey,
            [
                { type: pkcs11js.CKA_ID, value: ski }, //this is bytes buffer
                { type: pkcs11js.CKA_LABEL, value: ski.toString('hex') }  //and this is a hex string
            ]
        );

        // same id and label for private key as for public key
        this.pkcs11.C_SetAttributeValue(
            this.session,
            keys.privateKey,
            [
                { type: pkcs11js.CKA_ID, value: ski },
                { type: pkcs11js.CKA_LABEL, value: ski.toString('hex') }
            ]
        );

        logger.debug('pub CKA_ID: ' + JSON.stringify(
            (this.pkcs11.C_GetAttributeValue(
                this.session,
                keys.publicKey,
                [{ type: pkcs11js.CKA_ID }]))[0].value)
        );

        logger.debug('pub CKA_LABEL: ' + JSON.stringify(
            (this.pkcs11.C_GetAttributeValue(
                this.session,
                keys.publicKey,
                [{ type: pkcs11js.CKA_LABEL }]))[0].value)
        );


        //PEM encode pure public key. The result contains key and the curve type.
        const pem = this.pemEncode(ecpt, algorithm);

        logger.info('Generated Key ' + keyId + ', pub key: ' + ec.toString('hex') + ', Pem encoded: ' + pem);

        return { keyId, pem }
    }

    private getPrivateKeyObject(keyId: string) {
        // Find the private key by ID
        const template = [
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY },
            { type: pkcs11js.CKA_ID, value: Buffer.from(keyId, 'hex') }
        ];

        //please check that in your library this does not free hObject underlying structure.
        //consider moving C_FindObjectsFinal after hObject is not used anymore.
        this.pkcs11.C_FindObjectsInit(this.session, template);
        let hObject = this.pkcs11.C_FindObjects(this.session);
        this.pkcs11.C_FindObjectsFinal(this.session);

        if (hObject == null) {
            logger.error(`Key not found : ${keyId}`);
            throw new Error(`Key not found : ${keyId}`)
        }

        logger.info(`Private key found ${keyId}`);
        return hObject;
    }

    //implemented only for ECDSA
    async sign(keyId: string, payload: string, algorithm: string): Promise<string> {
        logger.info(`Request to sign with key ${keyId} payload: ${payload} algo: ${algorithm}`);

        const algoInfo: PKCSAlgorithmInfo = ALGORITHMS_INFO.get(algorithm);
        if (!SUPPORTED_ALGORITHMS.includes(algorithm) || algoInfo === undefined) {
            throw new Error(`Unsupported algorithm ${algorithm}`);
        }

        const { signMechanism: mechanism } = algoInfo;

        // Find the private key by ID
        let provKeyObj = this.getPrivateKeyObject(keyId);

        // Sign the payload. Algorithm is provided here and curve is defined on the private key attributes
        this.pkcs11.C_SignInit(this.session, { mechanism }, provKeyObj);
        //EC signatures are represented as a 32-bit R followed by a 32-bit S value, and not ASN.1 encoded.
        const signature: Buffer = this.pkcs11.C_Sign(this.session, Buffer.from(payload, 'hex'), Buffer.alloc(64));
        const signatureInHex: string = signature.toString('hex');

        logger.info(`Signed with key id ${keyId} signature hex: ${signatureInHex}`);

        return signatureInHex;
    }

    //implemented only for ECDSA
    async verify(keyId: string, signature: string, payload: string, algorithm: string): Promise<boolean> {
        logger.info(`Request to verify with key ${keyId} payload: ${payload} signature: ${signature} algo: ${algorithm}`);

        const algoInfo: PKCSAlgorithmInfo = ALGORITHMS_INFO.get(algorithm);
        if (!SUPPORTED_ALGORITHMS.includes(algorithm) || algoInfo === undefined) {
            throw new Error(`Unsupported algorithm ${algorithm}`);
        }

        const { verifyMechanism: mechanism } = algoInfo;

        let provKeyObj = this.getPrivateKeyObject(keyId);
        this.pkcs11.C_VerifyInit(this.session, { mechanism }, provKeyObj);
        const ok = this.pkcs11.C_Verify(this.session, Buffer.from(payload, 'hex'), Buffer.from(signature, 'hex'));
        logger.info(`Verified with key id ${keyId} is ${ok}`);

        return ok;
    }
}

export default new HSM();
