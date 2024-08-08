require('dotenv').config({
  path: `${__dirname}/../.env.${process.env.NODE_ENV}`,
});

export const MOBILE_GATEWAY_URL = process.env.MOBILE_GATEWAY_URL;
export const CUSTOMER_SERVER_URL = process.env.CUSTOMER_SERVER_URL;
export const CUSTOMER_SERVER_PULL_CADENCE_MS = Number(process.env.CUSTOMER_SERVER_PULL_CADENCE_MS ?? 30000);
export const AGENT_REQUESTS_CACHE_SIZE = Number(process.env.AGENT_REQUESTS_CACHE_SIZE ?? 2048);
export const CUSTOMER_SERVER_AUTHORIZATION = process.env.CUSTOMER_SERVER_AUTHORIZATION;
export const TOKEN_PATH = `${__dirname}/.fireblocks-refresh-token`;
export const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
