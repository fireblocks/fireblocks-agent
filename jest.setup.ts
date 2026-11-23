import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Every test file gets its own TOKEN_PATH in a temporary directory, so test files that write or
// remove the paired device's file never race each other when Jest runs them in parallel, and a
// file left in src/ never makes a test see a paired device. The same path survives
// jest.resetModules() within a file.
// The legacy location (next to the code) gets its own directory, so a file there is only ever the
// one a test put there.
const mockTokenPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'fireblocks-agent-test-')),
  '.fireblocks-refresh-token',
);
const mockLegacyTokenPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'fireblocks-agent-test-legacy-')),
  '.fireblocks-refresh-token',
);
jest.mock('./src/constants', () => ({
  ...(jest.requireActual('./src/constants') as Record<string, unknown>),
  TOKEN_PATH: mockTokenPath,
  LEGACY_TOKEN_PATH: mockLegacyTokenPath,
}));
