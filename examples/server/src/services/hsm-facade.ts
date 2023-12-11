import { Crypto, CryptoKey } from 'node-webcrypto-p11';
import { GUID } from '../types';

export interface HSMFacade {
  generateKeyPair(): Promise<string>;
  sign(keyId: GUID, payload: string): Promise<string>;
  verify(keyId: GUID, signature: string, payload: string): Promise<boolean>;
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

  async generateKeyPair(): Promise<GUID> {
    const keys = await this.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'K-256' },
      false,
      ['sign', 'verify'],
    );
    const key = await this.crypto.keyStorage.setItem(keys.privateKey);
    await this.crypto.keyStorage.setItem(keys.publicKey);
    const keyId = this.extractKeyUUID(key);
    return keyId;
  }

  async sign(keyId: GUID, payload: string): Promise<string> {
    const privateKey = await this.getKeyById(keyId);
    const signature = await this.crypto.subtle.sign(
      // @ts-ignore
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      Buffer.from(payload),
    );
    return Buffer.from(signature).toString('hex');
  }

  async verify(keyId: GUID, signature: string, payload: string): Promise<boolean> {
    const publicKey = await this.getKeyById(keyId, false);
    const signatureArrayBuffer = this.toArrayBuffer(Buffer.from(signature, 'hex'));
    const ok = await this.crypto.subtle.verify(
      // @ts-ignore
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signatureArrayBuffer,
      Buffer.from(payload),
    );
    return ok;
  }

  private toArrayBuffer(buffer: Buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < buffer.length; ++i) {
      view[i] = buffer[i];
    }
    return arrayBuffer;
  }

  private async getKeyById(keyId: string, isPrivateKey: boolean = true): Promise<CryptoKey> {
    const keys = await this.crypto.keyStorage.keys();
    const fullKeyId =
      keys.find((_) => _.startsWith(isPrivateKey ? 'private' : 'public') && _.includes(keyId)) ||
      '';
    const key = await this.crypto.keyStorage.getItem(fullKeyId);
    return key;
  }

  private extractKeyUUID(fullKey: string): string {
    // @ts-ignore
    return /(.*)-(.*)-(.*)/.exec(fullKey)[3];
  }
}

export default new HSM();
