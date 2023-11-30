require('dotenv').config({
  path: `${__dirname}/../.env.${process.env.NODE_ENV}`,
});

export const MOBILE_GATEWAY_URL = process.env.MOBILE_GATEWAY_URL;
export const TOKEN_PATH = `${__dirname}/.hsm-refresh-token`;
