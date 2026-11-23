import fs from 'fs';

// Settings that can be supplied as a file instead of an environment variable. For each NAME,
// NAME_FILE names a file (for example a Kubernetes Secret mounted as a file) whose contents become
// NAME, so the value never appears in the process environment (`docker inspect`, `oc describe`).
// HTTPS_PROXY and HTTP_PROXY are here because a proxy URL can carry a user name and password.
export const FILE_BACKED_SETTINGS = [
  'FB_DEVICE_DATA',
  'CUSTOMER_SERVER_AUTHORIZATION',
  'HTTPS_PROXY',
  'HTTP_PROXY',
] as const;

const clean = (value: unknown): string | undefined => {
  const v = (value as string | undefined)?.toString().trim();
  return v ? v : undefined;
};

/**
 * Reads every NAME_FILE that is set and puts the file's contents into env[NAME].
 *
 * Runs before the .env file is loaded, so a mounted secret takes precedence over a default in
 * .env.<NODE_ENV> (dotenv never overrides a value that is already set). Throws, naming the setting
 * and the path but never the value, when NAME and NAME_FILE are both set in the environment, or
 * when the file cannot be read or is empty. Surrounding whitespace, including a final newline, is
 * removed.
 *
 * Imports nothing but fs: it runs before configuration is loaded.
 *
 * @returns The names that were read from a file
 */
export const applySecretFiles = (env: Record<string, string | undefined>): string[] => {
  const loaded: string[] = [];
  for (const name of FILE_BACKED_SETTINGS) {
    const file = clean(env[`${name}_FILE`]);
    if (!file) {
      continue;
    }
    if (clean(env[name])) {
      throw new Error(`Set either ${name} or ${name}_FILE, not both.`);
    }
    let contents: string;
    try {
      contents = fs.readFileSync(file, 'utf8');
    } catch (e) {
      throw new Error(`${name}_FILE could not be read (${file}): ${(e as NodeJS.ErrnoException).code ?? 'error'}`);
    }
    const value = clean(contents);
    if (!value) {
      throw new Error(`${name}_FILE is empty (${file}).`);
    }
    env[name] = value;
    loaded.push(name);
  }
  return loaded;
};
