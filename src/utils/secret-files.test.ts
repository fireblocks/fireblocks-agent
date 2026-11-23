import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applySecretFiles, FILE_BACKED_SETTINGS } from './secret-files';

// Not a real credential.
const VALUE = 'not-a-real-secret-value';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-files-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const writeFile = (contents: string): string => {
  const file = path.join(dir, 'secret');
  fs.writeFileSync(file, contents);
  return file;
};

describe('applySecretFiles', () => {
  it('covers the device data, the customer server authorization and the proxy URLs', () => {
    expect([...FILE_BACKED_SETTINGS]).toEqual([
      'FB_DEVICE_DATA',
      'CUSTOMER_SERVER_AUTHORIZATION',
      'HTTPS_PROXY',
      'HTTP_PROXY',
    ]);
  });

  it('reads a proxy URL with credentials from HTTPS_PROXY_FILE', () => {
    // A proxy URL with a user name and password, built rather than written out: not a real credential.
    const url = new URL('http://proxy.example.internal:3128');
    url.username = 'svc-user';
    url.password = 'placeholder';
    const proxy = url.toString();
    const env: Record<string, string | undefined> = { HTTPS_PROXY_FILE: writeFile(`${proxy}\n`) };
    expect(applySecretFiles(env)).toEqual(['HTTPS_PROXY']);
    expect(env.HTTPS_PROXY).toBe(proxy);
  });

  it('leaves the environment alone when no _FILE setting is present', () => {
    const env: Record<string, string | undefined> = { FB_DEVICE_DATA: VALUE };
    expect(applySecretFiles(env)).toEqual([]);
    expect(env).toEqual({ FB_DEVICE_DATA: VALUE });
  });

  it('reads the value from the file and trims the final newline', () => {
    const env: Record<string, string | undefined> = { FB_DEVICE_DATA_FILE: writeFile(`${VALUE}\n`) };
    expect(applySecretFiles(env)).toEqual(['FB_DEVICE_DATA']);
    expect(env.FB_DEVICE_DATA).toBe(VALUE);
  });

  it('reads every setting from its own file', () => {
    const env: Record<string, string | undefined> = {};
    for (const name of FILE_BACKED_SETTINGS) {
      fs.writeFileSync(path.join(dir, name), `${name}-${VALUE}`);
      env[`${name}_FILE`] = path.join(dir, name);
    }
    expect(applySecretFiles(env)).toEqual([...FILE_BACKED_SETTINGS]);
    for (const name of FILE_BACKED_SETTINGS) {
      expect(env[name]).toBe(`${name}-${VALUE}`);
    }
  });

  it('treats a blank _FILE setting as unset', () => {
    const env: Record<string, string | undefined> = { CUSTOMER_SERVER_AUTHORIZATION_FILE: ' ' };
    expect(applySecretFiles(env)).toEqual([]);
  });

  it('refuses both the value and the file, without the value in the message', () => {
    const env = { CUSTOMER_SERVER_AUTHORIZATION: VALUE, CUSTOMER_SERVER_AUTHORIZATION_FILE: writeFile(VALUE) };
    expect(() => applySecretFiles(env)).toThrow(
      'Set either CUSTOMER_SERVER_AUTHORIZATION or CUSTOMER_SERVER_AUTHORIZATION_FILE, not both.',
    );
  });

  it('names the setting and path when the file is missing', () => {
    const missing = path.join(dir, 'missing');
    expect(() => applySecretFiles({ FB_DEVICE_DATA_FILE: missing })).toThrow(
      `FB_DEVICE_DATA_FILE could not be read (${missing}): ENOENT`,
    );
  });

  it('refuses an empty file', () => {
    const file = writeFile('\n');
    expect(() => applySecretFiles({ FB_DEVICE_DATA_FILE: file })).toThrow(`FB_DEVICE_DATA_FILE is empty (${file}).`);
  });
});
