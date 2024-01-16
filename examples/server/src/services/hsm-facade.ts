import fs from 'fs';
import { Crypto, CryptoKey } from 'node-webcrypto-p11';
import { exec } from 'node:child_process';
import { Algorithm, GUID } from '../types';
import logger from './logger';
export interface HSMFacade {
  generateKeyPair(algorithm: Algorithm): Promise<{ keyId: GUID; pem: string }>;
  sign(keyId: GUID, payload: string, algorithm: Algorithm): Promise<string>;
  verify(keyId: GUID, signature: string, payload: string, algorithm: Algorithm): Promise<boolean>;
}

class HSM implements HSMFacade {
  private crypto: Crypto;

  constructor() {
    const config = {
      library: '/usr/local/lib/softhsm/libsofthsm2.so',
      name: 'SoftHSM v2.0',
      slot: 0,
      readWrite: true,
      pin: '1234',
    };
    this.crypto = new Crypto(config);
  }

  async generateKeyPair(algorithm: string): Promise<{ keyId: GUID; pem: string }> {
    const keys = await this.crypto.subtle.generateKey({ name: algorithm, namedCurve: 'K-256' }, false, [
      'sign',
      'verify',
    ]);
    const key = await this.crypto.keyStorage.setItem(keys.privateKey);
    await this.crypto.keyStorage.setItem(keys.publicKey);
    const keyId = this.extractKeyUUID(key);
    const pem = await this.exportPublicKeyAsPem(keyId);

    return { keyId, pem };
  }

  async sign(keyId: GUID, payload: string, algorithm: string): Promise<string> {
    const privateKey = await this.getKeyById(keyId);
    const signature = await this.crypto.subtle.sign(
      { name: algorithm, hash: 'SHA-256' },
      privateKey,
      Buffer.from(payload, 'hex'),
    );
    const signatureInHex = Buffer.from(signature).toString('hex');
    logger.info(`signature hex: ${signatureInHex}`);
    return signatureInHex;
  }

  async verify(keyId: GUID, signature: string, payload: string, algorithm: string): Promise<boolean> {
    const publicKey = await this.getKeyById(keyId, false);
    const signatureArrayBuffer = new Uint8Array(Buffer.from(signature, 'hex')).buffer;
    const ok = await this.crypto.subtle.verify(
      { name: algorithm, hash: 'SHA-256' },
      publicKey,
      signatureArrayBuffer,
      Buffer.from(payload),
    );
    return ok;
  }

  private exportPublicKeyAsPem(keyId: GUID): Promise<string> {
    return new Promise((res, rej) => {
      exec(
        `pkcs11-tool --module  /usr/local/lib/softhsm/libsofthsm2.so  --read-object --type pubkey --id ${keyId} --output-file public_key.der`,
        (err, output, errMessage) => {
          if (err) {
            logger.error(`error while exporting der file for public key. ${errMessage}`, err);
            rej(err);
          }
          exec(
            `openssl ec -inform DER -in public_key.der -pubin -outform PEM -out public_key.pem`,
            (err, out, errMessage) => {
              if (err) {
                logger.error(`error while exporting pem file for public key. ${errMessage}`, err);
                rej(err);
              }
              const pem = fs.readFileSync('./public_key.pem', 'utf-8');
              res(pem);
            },
          );
        },
      );
    });
  }

  private async getKeyById(keyId: string, isPrivateKey: boolean = true): Promise<CryptoKey> {
    const keys = await this.crypto.keyStorage.keys();
    const fullKeyId = keys.find((_) => _.startsWith(isPrivateKey ? 'private' : 'public') && _.includes(keyId)) || '';
    const key = await this.crypto.keyStorage.getItem(fullKeyId);
    return key;
  }

  private extractKeyUUID(fullKey: string): GUID {
    // @ts-ignore
    return /(.*)-(.*)-(.*)/.exec(fullKey)[3];
  }
}

export default new HSM();
