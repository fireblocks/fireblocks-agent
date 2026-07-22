require('dotenv').config({
  path: `${__dirname}/../.env.${process.env.NODE_ENV}`,
});

export const MOBILE_GATEWAY_URL = process.env.MOBILE_GATEWAY_URL;
export const CUSTOMER_SERVER_URL = process.env.CUSTOMER_SERVER_URL;
export const CUSTOMER_SERVER_PULL_CADENCE_MS = Number(process.env.CUSTOMER_SERVER_PULL_CADENCE_MS ?? 30000);
export const AGENT_REQUESTS_CACHE_SIZE = Number(process.env.AGENT_REQUESTS_CACHE_SIZE ?? 2048);
export const BROADCAST_BATCH_SIZE = Number(process.env.BROADCAST_BATCH_SIZE ?? 30);
export const CUSTOMER_SERVER_AUTHORIZATION = process.env.CUSTOMER_SERVER_AUTHORIZATION;
export const TOKEN_PATH = `${__dirname}/.fireblocks-refresh-token`;
export const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
// Parse a boolean-ish env var robustly so an opt-out kill switch never fails open.
// Recognized (case-insensitive) disable values: false/0/no/off. Enable values: true/1/yes/on.
// Anything unset, blank, or unrecognized falls back to the supplied default.
const parseBooleanEnv = (raw: string | undefined, defaultValue: boolean): boolean => {
  if (raw === undefined) {
    return defaultValue;
  }
  const value = raw.trim().toLowerCase();
  if (value === '') {
    return defaultValue;
  }
  if (['false', '0', 'no', 'off'].includes(value)) {
    return false;
  }
  if (['true', '1', 'yes', 'on'].includes(value)) {
    return true;
  }
  return defaultValue;
};

// Message-delivery transport. WebSocket push (MAG /msg/ws) is the default: acks ride the
// socket and sign responses stay on HTTP. Set WEBSOCKET_ENABLED to false/0/no/off (any case)
// to fall back to HTTP long-polling.
export const WEBSOCKET_ENABLED = parseBooleanEnv(process.env.WEBSOCKET_ENABLED, true);
// Handshake / open watchdog: if the socket does not emit 'open' within this window the
// connection attempt is terminated and retried. Covers a stalled TCP-connected-but-no-101
// upgrade where the CONNECTING phase would otherwise have no timer at all.
const wsOpenTimeoutMs = Number(process.env.WS_OPEN_TIMEOUT_MS);
export const WS_OPEN_TIMEOUT_MS = Number.isFinite(wsOpenTimeoutMs) && wsOpenTimeoutMs > 0 ? wsOpenTimeoutMs : 10000;
// Maximum accepted size of a single inbound WebSocket frame (bytes). Guards against a
// malicious/misbehaving server sending a huge frame that would stall the event loop / spike
// memory (ws defaults to 100 MiB). Default 1 MiB.
const wsMaxPayloadBytes = Number(process.env.WS_MAX_PAYLOAD_BYTES);
export const WS_MAX_PAYLOAD_BYTES =
  Number.isFinite(wsMaxPayloadBytes) && wsMaxPayloadBytes > 0 ? wsMaxPayloadBytes : 1024 * 1024;
// Client-side keep-alive ping cadence for the WebSocket. If no pong/traffic arrives within
// one interval the socket is treated as half-dead and reconnected. Guard against a
// non-numeric or non-positive env value by falling back to the 30s default.
const wsPingIntervalMs = Number(process.env.WS_PING_INTERVAL_MS);
export const WS_PING_INTERVAL_MS = Number.isFinite(wsPingIntervalMs) && wsPingIntervalMs > 0 ? wsPingIntervalMs : 30000;
