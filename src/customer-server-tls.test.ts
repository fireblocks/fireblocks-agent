import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import tls from 'tls';
import {
  CustomerServerTls,
  CustomerServerTlsError,
  describeCustomerServerTls,
  resolveCustomerServerTls,
} from './customer-server-tls';

// A tiny X.509 builder, so the tests can run a real HTTPS server with a private CA without a
// committed private key or an extra dependency. ECDSA P-256 with SHA-256.
const der = (tag: number, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  const len = body.length;
  const header =
    len < 0x80
      ? Buffer.from([tag, len])
      : len < 0x100
        ? Buffer.from([tag, 0x81, len])
        : Buffer.from([tag, 0x82, len >> 8, len & 0xff]);
  return Buffer.concat([header, body]);
};
const seq = (...parts: Buffer[]) => der(0x30, ...parts);
const oid = (dotted: string): Buffer => {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const bytes = [a * 40 + b];
  for (const n of rest) {
    const chunk = [n & 0x7f];
    for (let v = n >> 7; v > 0; v >>= 7) chunk.unshift((v & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
};
const name = (cn: string) => seq(der(0x31, seq(oid('2.5.4.3'), der(0x0c, Buffer.from(cn)))));
const utcTime = (d: Date) => der(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'));

interface Issued {
  cert: string;
  key: crypto.KeyObject;
}

const issue = (subject: string, issuer: { cn: string; key?: crypto.KeyObject }, ca: boolean): Issued => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const extensions = ca
    ? [seq(oid('2.5.29.19'), der(0x01, Buffer.from([0xff])), der(0x04, seq(der(0x01, Buffer.from([0xff])))))]
    : [
        seq(
          oid('2.5.29.17'),
          der(0x04, seq(der(0x82, Buffer.from('localhost')), der(0x87, Buffer.from([127, 0, 0, 1])))),
        ),
      ];
  const tbs = seq(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, crypto.randomBytes(8).fill(0x01, 0, 1)),
    ECDSA_SHA256,
    name(issuer.cn),
    seq(utcTime(new Date(Date.now() - 3600_000)), utcTime(new Date(Date.now() + 86400_000))),
    name(subject),
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, seq(...extensions)),
  );
  const signature = crypto.sign('sha256', tbs, issuer.key ?? privateKey);
  const certDer = seq(tbs, ECDSA_SHA256, der(0x03, Buffer.from([0]), signature));
  const b64 = certDer.toString('base64').replace(/.{64}/g, '$&\n');
  return { cert: `-----BEGIN CERTIFICATE-----\n${b64.trimEnd()}\n-----END CERTIFICATE-----\n`, key: privateKey };
};

let ca: Issued;
let leaf: Issued;
let otherCa: Issued;
let dir: string;
let caFile: string;

beforeAll(() => {
  ca = issue('Customer Server test CA', { cn: 'Customer Server test CA' }, true);
  leaf = issue('localhost', { cn: 'Customer Server test CA', key: ca.key }, false);
  otherCa = issue('Another CA', { cn: 'Another CA' }, true);
});
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-server-tls-'));
  caFile = path.join(dir, 'ca.crt');
  fs.writeFileSync(caFile, ca.cert);
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const errorOf = (env: Record<string, string | undefined>): string => {
  try {
    resolveCustomerServerTls(env);
  } catch (e) {
    expect(e).toBeInstanceOf(CustomerServerTlsError);
    return (e as Error).message;
  }
  throw new Error('resolveCustomerServerTls did not throw');
};

const HTTPS_URL = 'https://localhost:5000/api';
const HTTP_URL = 'http://customer-server:5000/api';

describe('resolveCustomerServerTls: the URL', () => {
  it('accepts https:// with the default CA certificates only', () => {
    const result = resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL });
    expect(result.scheme).toBe('https');
    expect(result.caSetting).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.httpsAgent.options.ca).toBeUndefined();
    expect(result.httpsAgent.options.rejectUnauthorized).not.toBe(false);
    expect(describeCustomerServerTls(result)).toBe('HTTPS, verified against the default CA certificates');
  });

  it('refuses http:// by default', () => {
    expect(errorOf({ CUSTOMER_SERVER_URL: HTTP_URL })).toMatch(
      /^CUSTOMER_SERVER_URL is http:\/\/, so signing requests and the Authorization header would cross the network unencrypted\./,
    );
  });

  it.each(['false', ' FALSE ', ''])('refuses http:// with ALLOW_INSECURE_CUSTOMER_SERVER=%j', (value) => {
    expect(errorOf({ CUSTOMER_SERVER_URL: HTTP_URL, ALLOW_INSECURE_CUSTOMER_SERVER: value })).toMatch(/is http:\/\//);
  });

  it.each(['true', 'TRUE', ' true '])(
    'allows http:// with ALLOW_INSECURE_CUSTOMER_SERVER=%j, with a warning',
    (value) => {
      const result = resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTP_URL, ALLOW_INSECURE_CUSTOMER_SERVER: value });
      expect(result.scheme).toBe('http');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/plain HTTP, unencrypted/);
      expect(describeCustomerServerTls(result)).toBe('plain HTTP, unencrypted (ALLOW_INSECURE_CUSTOMER_SERVER=true)');
    },
  );

  it.each(['yes', '1', 'on'])('refuses ALLOW_INSECURE_CUSTOMER_SERVER=%j: only true or false', (value) => {
    expect(errorOf({ CUSTOMER_SERVER_URL: HTTP_URL, ALLOW_INSECURE_CUSTOMER_SERVER: value })).toBe(
      'ALLOW_INSECURE_CUSTOMER_SERVER must be true or false.',
    );
  });

  it('ignores ALLOW_INSECURE_CUSTOMER_SERVER with https://, with a warning', () => {
    const result = resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL, ALLOW_INSECURE_CUSTOMER_SERVER: 'true' });
    expect(result.scheme).toBe('https');
    expect(result.warnings).toEqual([
      'ALLOW_INSECURE_CUSTOMER_SERVER=true is ignored: CUSTOMER_SERVER_URL is https://.',
    ]);
  });

  it.each([undefined, '', '  '])('refuses a missing CUSTOMER_SERVER_URL (%j)', (value) => {
    expect(errorOf({ CUSTOMER_SERVER_URL: value })).toMatch(/^CUSTOMER_SERVER_URL is not set/);
  });

  it('refuses a URL that does not parse', () => {
    expect(errorOf({ CUSTOMER_SERVER_URL: '://nothing' })).toMatch(/is not a valid URL/);
  });

  it.each(['ftp://customer-server/api', 'customer-server:5000/api'])('refuses %j: not https://', (value) => {
    expect(errorOf({ CUSTOMER_SERVER_URL: value })).toBe('CUSTOMER_SERVER_URL must start with https://.');
  });
});

describe('resolveCustomerServerTls: the CA file', () => {
  it('adds CUSTOMER_SERVER_CA_FILE to the default CA certificates instead of replacing them', () => {
    const result = resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL, CUSTOMER_SERVER_CA_FILE: caFile });
    const trusted = result.httpsAgent.options.ca as string[];
    expect(trusted).toContain(ca.cert.trim());
    // The same default set the Agent uses: where the runtime reports it, it can come from the system
    // store (for example with --use-system-ca), which need not hold every bundled root.
    const getDefaults = (tls as unknown as { getCACertificates?: (type: string) => string[] }).getCACertificates;
    const defaults = getDefaults ? getDefaults('default') : [...tls.rootCertificates];
    for (const root of defaults.slice(0, 5)) {
      expect(trusted).toContain(root);
    }
    expect(trusted.length).toBeGreaterThan(defaults.length);
    expect(result.caSetting).toBe('CUSTOMER_SERVER_CA_FILE');
    expect(result.caCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(describeCustomerServerTls(result)).toBe(
      'HTTPS, verified against the default CA certificates and 1 from CUSTOMER_SERVER_CA_FILE',
    );
  });

  it('reads every certificate in a bundle', () => {
    fs.writeFileSync(caFile, `${ca.cert}\n${otherCa.cert}`);
    expect(resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL, CUSTOMER_SERVER_CA_FILE: caFile }).caCount).toBe(
      2,
    );
  });

  it('accepts SSL_CERT_PATH, its old name, with a deprecation warning', () => {
    const result = resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL, SSL_CERT_PATH: caFile });
    expect(result.caSetting).toBe('SSL_CERT_PATH');
    expect(result.warnings).toEqual(['SSL_CERT_PATH is deprecated: rename it to CUSTOMER_SERVER_CA_FILE.']);
  });

  it('refuses both names together', () => {
    expect(errorOf({ CUSTOMER_SERVER_URL: HTTPS_URL, CUSTOMER_SERVER_CA_FILE: caFile, SSL_CERT_PATH: caFile })).toBe(
      'Set either CUSTOMER_SERVER_CA_FILE or SSL_CERT_PATH (its old name), not both.',
    );
  });

  it.each(['CUSTOMER_SERVER_CA_FILE', 'SSL_CERT_PATH'])(
    'refuses a %s that cannot be read: no silent fallback',
    (setting) => {
      const missing = path.join(dir, 'missing.crt');
      expect(errorOf({ CUSTOMER_SERVER_URL: HTTPS_URL, [setting]: missing })).toBe(
        `${setting} could not be read (${missing}): ENOENT`,
      );
    },
  );

  it('refuses a file with no certificate, without printing its contents', () => {
    fs.writeFileSync(caFile, 'not a certificate, could be anything');
    const message = errorOf({ CUSTOMER_SERVER_URL: HTTPS_URL, CUSTOMER_SERVER_CA_FILE: caFile });
    expect(message).toBe(`CUSTOMER_SERVER_CA_FILE holds no PEM certificate (${caFile}).`);
    expect(message).not.toContain('could be anything');
  });

  it('refuses a certificate that does not parse', () => {
    fs.writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n');
    expect(errorOf({ CUSTOMER_SERVER_URL: HTTPS_URL, CUSTOMER_SERVER_CA_FILE: caFile })).toMatch(/cannot be parsed/);
  });

  it('still reads the CA file with http://, and says it is not used', () => {
    const result = resolveCustomerServerTls({
      CUSTOMER_SERVER_URL: HTTP_URL,
      ALLOW_INSECURE_CUSTOMER_SERVER: 'true',
      CUSTOMER_SERVER_CA_FILE: caFile,
    });
    expect(result.warnings).toContain('CUSTOMER_SERVER_CA_FILE is not used: CUSTOMER_SERVER_URL is http://.');
  });
});

describe('the agent against a real HTTPS server', () => {
  let server: https.Server;
  let port: number;

  beforeAll(async () => {
    server = https.createServer(
      { cert: leaf.cert, key: leaf.key.export({ type: 'pkcs8', format: 'pem' }) },
      (_req, res) => res.writeHead(200).end('ok'),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // The certificate's names are checked against servername; the connection goes to 127.0.0.1.
  const call = (result: CustomerServerTls, servername = 'localhost'): Promise<number> =>
    new Promise((resolve, reject) => {
      https
        .get({ host: '127.0.0.1', servername, port, path: '/api/health', agent: result.httpsAgent }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on('error', reject);
    });

  it('connects when the server certificate is signed by the configured CA', async () => {
    await expect(
      call(resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL, CUSTOMER_SERVER_CA_FILE: caFile })),
    ).resolves.toBe(200);
  });

  it('refuses the server without the CA file', async () => {
    await expect(call(resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL }))).rejects.toThrow();
  });

  it('refuses the server with an unrelated CA', async () => {
    fs.writeFileSync(caFile, otherCa.cert);
    await expect(
      call(resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL, CUSTOMER_SERVER_CA_FILE: caFile })),
    ).rejects.toThrow();
  });

  it('still checks the host name against the certificate', async () => {
    const result = resolveCustomerServerTls({ CUSTOMER_SERVER_URL: HTTPS_URL, CUSTOMER_SERVER_CA_FILE: caFile });
    await expect(call(result, 'customer-server.example.com')).rejects.toThrow(/altnames|Hostname/i);
  });
});
