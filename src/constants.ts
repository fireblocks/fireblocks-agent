require('dotenv').config({
  path: `${__dirname}/../.env.${process.env.NODE_ENV}`,
});

export const MOBILE_GATEWAY_URL = process.env.MOBILE_GATEWAY_URL;
export const CUSTOMER_SERVER_URL = process.env.CUSTOMER_SERVER_URL;
export const CUSTOMER_SERVER_PULL_CADENCE = Number(process.env.CUSTOMER_SERVER_PULL_CADENCE);
export const CUSTOMER_SERVER_AUTHORIZATION = process.env.CUSTOMER_SERVER_AUTHORIZATION;
export const TOKEN_PATH = `${__dirname}/.fireblocks-refresh-token`;
