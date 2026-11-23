import { X509Certificate } from 'crypto';
import fs from 'fs';
import https from 'https';
import tls from 'tls';

// TLS for the Agent's calls to the Customer Server (CUSTOMER_SERVER_URL).
//
// HTTPS is required. Plain http:// is refused unless ALLOW_INSECURE_CUSTOMER_SERVER=true, for local
// development only: signing requests and the Authorization header would cross the network
// unencrypted.
//
// The server's certificate is checked against the default CA certificates (Node's bundled roots
// plus NODE_EXTRA_CA_CERTS) and, when CUSTOMER_SERVER_CA_FILE is set, the CA certificates in that
// file as well: for a server with a private or self-signed CA. SSL_CERT_PATH is its old name and
// still works. A configured file that cannot be read, or that holds no certificate, stops the Agent
// at startup. Certificate checks are never turned off.
//
// The Agent's connections to Fireblocks are not affected: they always use the default CA
// certificates.

export const CA_FILE_SETTING = 'CUSTOMER_SERVER_CA_FILE';
export const CA_FILE_ALIAS = 'SSL_CERT_PATH';
export const ALLOW_INSECURE_SETTING = 'ALLOW_INSECURE_CUSTOMER_SERVER';

export interface CustomerServerTls {
  // The scheme of CUSTOMER_SERVER_URL.
  scheme: 'https' | 'http';
  // The setting the extra CA certificates came from, if any.
  caSetting?: string;
  // How many CA certificates that file added.
  caCount: number;
  httpsAgent: https.Agent;
  warnings: string[];
}

/** A configuration problem: the message names the setting, never a secret value. */
export class CustomerServerTlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerServerTlsError';
  }
}

const clean = (value: unknown): string | undefined => {
  const v = (value as string | undefined)?.toString().trim();
  return v ? v : undefined;
};

const PEM_CERTIFICATE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

// The CA certificates the Agent trusts by default: Node's bundled roots plus NODE_EXTRA_CA_CERTS.
// Passing `ca` to an agent replaces that set, so it is passed again together with the extra file.
const defaultCaCertificates = (): string[] => {
  const withExtra = (tls as unknown as { getCACertificates?: (type: string) => string[] }).getCACertificates;
  return withExtra ? withExtra('default') : [...tls.rootCertificates];
};

const readCaFile = (setting: string, file: string): string[] => {
  let contents: string;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new CustomerServerTlsError(
      `${setting} could not be read (${file}): ${(e as NodeJS.ErrnoException).code ?? 'error'}`,
    );
  }
  const certificates = contents.match(PEM_CERTIFICATE) ?? [];
  if (certificates.length === 0) {
    throw new CustomerServerTlsError(`${setting} holds no PEM certificate (${file}).`);
  }
  for (const pem of certificates) {
    try {
      new X509Certificate(pem);
    } catch {
      throw new CustomerServerTlsError(`${setting} holds a certificate that cannot be parsed (${file}).`);
    }
  }
  return certificates;
};

const parseAllowInsecure = (env: Record<string, string | undefined>): boolean => {
  const raw = clean(env[ALLOW_INSECURE_SETTING])?.toLowerCase();
  if (raw === undefined || raw === 'false') {
    return false;
  }
  if (raw === 'true') {
    return true;
  }
  throw new CustomerServerTlsError(`${ALLOW_INSECURE_SETTING} must be true or false.`);
};

/**
 * Checks CUSTOMER_SERVER_URL and the CA settings, and builds the agent for the calls to the
 * Customer Server. Throws a CustomerServerTlsError for anything that is not allowed.
 *
 * @param env - The environment, normally process.env
 */
export const resolveCustomerServerTls = (env: Record<string, string | undefined>): CustomerServerTls => {
  const warnings: string[] = [];
  const rawUrl = clean(env.CUSTOMER_SERVER_URL);
  if (!rawUrl) {
    throw new CustomerServerTlsError('CUSTOMER_SERVER_URL is not set: set it to https://<your server>/api.');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CustomerServerTlsError('CUSTOMER_SERVER_URL is not a valid URL: set it to https://<your server>/api.');
  }
  const allowInsecure = parseAllowInsecure(env);

  let scheme: 'https' | 'http';
  if (url.protocol === 'https:') {
    scheme = 'https';
    if (allowInsecure) {
      warnings.push(`${ALLOW_INSECURE_SETTING}=true is ignored: CUSTOMER_SERVER_URL is https://.`);
    }
  } else if (url.protocol === 'http:') {
    if (!allowInsecure) {
      throw new CustomerServerTlsError(
        'CUSTOMER_SERVER_URL is http://, so signing requests and the Authorization header would cross the ' +
          'network unencrypted. Use https:// (set CUSTOMER_SERVER_CA_FILE to your CA certificate when the ' +
          `server's certificate is not from a public CA). For local development only, set ${ALLOW_INSECURE_SETTING}=true.`,
      );
    }
    scheme = 'http';
    warnings.push(
      `${ALLOW_INSECURE_SETTING}=true: calls to the Customer Server use plain HTTP, unencrypted. ` +
        'Use this for local development only.',
    );
  } else {
    throw new CustomerServerTlsError('CUSTOMER_SERVER_URL must start with https://.');
  }

  const caFile = clean(env[CA_FILE_SETTING]);
  const caAlias = clean(env[CA_FILE_ALIAS]);
  if (caFile && caAlias) {
    throw new CustomerServerTlsError(`Set either ${CA_FILE_SETTING} or ${CA_FILE_ALIAS} (its old name), not both.`);
  }
  const caSetting = caFile ? CA_FILE_SETTING : caAlias ? CA_FILE_ALIAS : undefined;
  if (caSetting === CA_FILE_ALIAS) {
    warnings.push(`${CA_FILE_ALIAS} is deprecated: rename it to ${CA_FILE_SETTING}.`);
  }
  const extra = caSetting ? readCaFile(caSetting, (caFile ?? caAlias) as string) : [];
  if (caSetting && scheme === 'http') {
    warnings.push(`${caSetting} is not used: CUSTOMER_SERVER_URL is http://.`);
  }

  // Default certificate checks (CA chain and host name), with the extra CA certificates added to
  // the default ones rather than replacing them.
  const httpsAgent =
    extra.length > 0 ? new https.Agent({ ca: [...defaultCaCertificates(), ...extra] }) : new https.Agent();
  return { scheme, caSetting, caCount: extra.length, httpsAgent, warnings };
};

/** One line for the startup log: the scheme and where the extra CA certificates came from. */
export const describeCustomerServerTls = ({ scheme, caSetting, caCount }: CustomerServerTls): string => {
  if (scheme === 'http') {
    return 'plain HTTP, unencrypted (ALLOW_INSECURE_CUSTOMER_SERVER=true)';
  }
  return caSetting
    ? `HTTPS, verified against the default CA certificates and ${caCount} from ${caSetting}`
    : 'HTTPS, verified against the default CA certificates';
};
