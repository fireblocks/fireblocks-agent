import { TOKEN_PATH } from '../constants';
import * as logger from './logger';
import fs from 'fs';

const deviceService = {
  isPaired: (): boolean => {
    return fs.existsSync(TOKEN_PATH);
  },

  saveRefreshToken: (token: string) => {
    try {
      fs.writeFileSync(TOKEN_PATH, token);
    } catch (e) {
      logger.error(`Error saving refresh token`, e);
    }
  },

  getRefreshToken: (): string => {
    return deviceService.isPaired()
      ? fs.readFileSync(TOKEN_PATH).toString()
      : undefined;
  },
};

export default deviceService;
