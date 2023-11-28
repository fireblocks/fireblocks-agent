import { TOKEN_PATH } from '../constants';
import * as logger from './logger';
import fs from 'fs';

export const isPaired = (): boolean => {
  return fs.existsSync(TOKEN_PATH);
};

export const saveRefreshToken = (token: string) => {
  try {
    fs.writeFileSync(TOKEN_PATH, token);
  } catch (e) {
    logger.error(`Error saving refresh token`, e);
  }
};

export const getRefreshToken = (): string => {
  return isPaired() ? fs.readFileSync(TOKEN_PATH).toString() : undefined;
};
