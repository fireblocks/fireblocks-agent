require('dotenv').config({
  path: `${__dirname}/../.env.${process.env.NODE_ENV}`,
});

export const MOBILE_GATEWAY_URL = process.env.MOBILE_GATEWAY_URL;
export const CUSTOMER_SERVER_URL = process.env.CUSTOMER_SERVER_URL;
export const CUSTOMER_SERVER_PULL_CADENCE_MS = Number(process.env.CUSTOMER_SERVER_PULL_CADENCE_MS ?? 30000);
export const AGENT_REQUESTS_CACHE_SIZE = Number(process.env.AGENT_REQUESTS_CACHE_SIZE ?? 2048);
export const BROADCAST_BATCH_SIZE = Number(process.env.BROADCAST_BATCH_SIZE ?? 30);
export const CUSTOMER_SERVER_AUTHORIZATION = process.env.CUSTOMER_SERVER_AUTHORIZATION;
// Deadline for the customer-server status poll. Same failure as FB_HTTP_TIMEOUT_MS guards on the
// gateway side, and if anything more exposed: the customer server is customer-operated
// infrastructure, so the agent has no basis for assuming the peer will not accept a connection and
// then go silent. Unbounded it is a permanent wedge, not a slow call -- the reschedule in
// customer-server-client.ts sits after the await, so a hang never reaches it and status updates
// stop for the life of the process. A hang detector, not a latency SLO.
// Caveat when tuning: in KeyLink Flow this call lands on getMessagesStatus, which opens with an
// unfiltered $group over the whole `messages` collection (no $match, no index beyond _id, nothing
// ever deleted -- archiving is a flag). Its cost grows with the deployment's lifetime message
// count, so this deadline sits on top of a scan that gets slower forever. Removing that scan is
// WLT-12843; raising this value is not the fix for it.
const customerServerTimeoutMs = Number(process.env.CUSTOMER_SERVER_TIMEOUT_MS);
export const CUSTOMER_SERVER_TIMEOUT_MS =
  Number.isFinite(customerServerTimeoutMs) && customerServerTimeoutMs > 0 ? customerServerTimeoutMs : 30000;
// Deadline for messagesToSign specifically. Split out because it is the one call whose latency is
// the customer's HSM rather than a lookup: in HOT mode the reference server signs the whole batch
// inline before responding, so the status budget above would abort healthy signing. Still bounded
// -- an unsettled signing request strands those messages unacked and unresolvable.
const customerServerSignTimeoutMs = Number(process.env.CUSTOMER_SERVER_SIGN_TIMEOUT_MS);
export const CUSTOMER_SERVER_SIGN_TIMEOUT_MS =
  Number.isFinite(customerServerSignTimeoutMs) && customerServerSignTimeoutMs > 0
    ? customerServerSignTimeoutMs
    : 120000;
export const TOKEN_PATH = `${__dirname}/.fireblocks-refresh-token`;
// An already-paired {userId, deviceId, refreshToken}, so a container starts paired without a
// TTY and without writing to disk - TOKEN_PATH is ephemeral there. Pair once elsewhere and
// copy the file. Bearer credential: inject from a secret manager, never an .env file.
export const FB_DEVICE_DATA = process.env.FB_DEVICE_DATA?.trim() || undefined;
export const SSL_CERT_PATH = process.env.SSL_CERT_PATH;
// Deadline for the short request/response calls to MAG (access_token, pair_device,
// get_service_certificates, the msg ack, and the HTTP broadcast). Node's http client has no
// timeout of its own, so a gateway that completes the TCP handshake and then never responds --
// no RST, no FIN -- leaves the promise unsettled forever. That is not hypothetical: it is what
// severs the WebSocket reconnect chain, since connect() awaits access_token before it has a
// socket or an armed timer. Deliberately generous: this is a hang detector, not a latency SLO.
// Does NOT apply to getMessages -- that is a long poll, see FB_LONG_POLL_TIMEOUT_MS.
const fbHttpTimeoutMs = Number(process.env.FB_HTTP_TIMEOUT_MS);
export const FB_HTTP_TIMEOUT_MS = Number.isFinite(fbHttpTimeoutMs) && fbHttpTimeoutMs > 0 ? fbHttpTimeoutMs : 30000;
// Deadline for the getMessages long poll. MAG holds /msg open until a message arrives or its own
// window expires, so FB_HTTP_TIMEOUT_MS would abort every idle poll. This is a hang backstop and
// nothing more: it has to clear both the gateway's poll window and the infrastructure request
// ceiling above it, and past that, lower is better -- the value is exactly how long a wedged poll
// goes unnoticed. It matters because in HTTP mode the poll loop in fireblocks-agent.ts has no other
// liveness check -- one unsettled request stops message delivery for the life of the process.
const fbLongPollTimeoutMs = Number(process.env.FB_LONG_POLL_TIMEOUT_MS);
export const FB_LONG_POLL_TIMEOUT_MS =
  Number.isFinite(fbLongPollTimeoutMs) && fbLongPollTimeoutMs > 0 ? fbLongPollTimeoutMs : 90000;
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
// Total budget for a single connection ATTEMPT, armed before the access-token fetch that
// connect() starts with. WS_OPEN_TIMEOUT_MS only covers a socket that already exists; the
// window between "reconnect timer fired" and "socket constructed" has no socket and no timer,
// so a token fetch that hangs instead of failing leaves the client with nothing armed and the
// reconnect chain permanently severed. This is the backstop for that window -- FB_HTTP_TIMEOUT_MS
// should normally reject first, so it is set comfortably above it.
const wsConnectTimeoutMs = Number(process.env.WS_CONNECT_TIMEOUT_MS);
export const WS_CONNECT_TIMEOUT_MS =
  Number.isFinite(wsConnectTimeoutMs) && wsConnectTimeoutMs > 0 ? wsConnectTimeoutMs : 60000;
// That ordering is load-bearing, not stylistic: if the HTTP deadline does not reject first, the
// connect watchdog pre-empts it and abandons attempts whose token fetch was still healthy. Both
// are env-tunable independently, so check rather than assume. Non-fatal -- a misordering degrades
// behaviour rather than breaking it, and the agent is still strictly better off than with no
// deadline at all.
if (FB_HTTP_TIMEOUT_MS >= WS_CONNECT_TIMEOUT_MS) {
  // Required lazily, not imported: a static import is hoisted above the dotenv call, and winston
  // pulls in modules that read process.env at module scope (@dabh/diagnostics reads DEBUG,
  // @colors/colors reads FORCE_COLOR / NO_COLOR / TERM). No .env* in this repo sets any of them
  // today, so nothing is broken -- but loading the logger after dotenv costs nothing and keeps
  // that from becoming a trap. It also leaves constants.ts free of a static edge to services/,
  // so logger.ts could import a constant later without creating a cycle.
  const logger = require('./services/logger').default;
  logger.warn(
    `WS_CONNECT_TIMEOUT_MS (${WS_CONNECT_TIMEOUT_MS}ms) should exceed FB_HTTP_TIMEOUT_MS ` +
      `(${FB_HTTP_TIMEOUT_MS}ms) - the connect watchdog will pre-empt the access-token deadline`,
  );
}
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
