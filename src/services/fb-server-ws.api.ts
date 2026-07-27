import crypto from 'crypto';
import WebSocket from 'ws';
import { FBMessageEnvelope, MessageEnvelop, MessageStatus } from 'types';
import { MOBILE_GATEWAY_URL, WS_MAX_PAYLOAD_BYTES, WS_OPEN_TIMEOUT_MS, WS_PING_INTERVAL_MS } from '../constants';
import deviceService from './device.service';
import fbServerApi, { buildResponseObject } from './fb-server.api';
import logger from './logger';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const WS_PATH = '/msg/ws';

export type MessagesHandler = (messages: FBMessageEnvelope[]) => void;

/**
 * Push-mode message stream over MAG's WebSocket endpoint (server: mobile-api-gw
 * websocket-service, path /msg/ws, auth via x-access-token header).
 *
 * MAG pushes each RabbitMQ message as a JSON FBMessageEnvelope: { msg, msgId,
 * deviceId, internalMessageId }. Messages delivered over the socket MUST be acked
 * over the same socket ({ msgId, nack: false }) — MAG maps msgId -> deliveryTag
 * per-connection. Sign responses still go over the existing HTTP endpoints.
 *
 * Liveness has THREE layers so a stalled connection can never wedge delivery:
 *   1. handshakeTimeout on the socket + an explicit open-watchdog timer covering the
 *      CONNECTING phase — if the upgrade never completes (TCP connected but no 101)
 *      we terminate and reconnect instead of sitting forever with no timer armed.
 *   2. an app-level keep-alive once open — a protocol ping every WS_PING_INTERVAL_MS;
 *      if neither a pong nor any traffic arrives within one interval the socket is
 *      treated as half-dead, terminated, and reconnected (exponential backoff with
 *      jitter, fresh access token per attempt).
 *   3. TCP SO_KEEPALIVE on the underlying socket as belt-and-suspenders.
 *
 * Ack delivery is AT-LEAST-ONCE BY DESIGN: acks ride the currently-connected
 * transport, and MAG maps msgId -> deliveryTag PER-CONNECTION. If the socket
 * reconnects between a message's delivery and its ack, that ack no-ops on the new
 * connection and MAG redelivers the message -> the agent re-signs it. Signing is
 * idempotent, so redelivery is harmless. This is an intentional guarantee, not a
 * bug, and is forward-compatible with a future MAG that supports cross-connection
 * acks. See ackViaTransport in messages.service.ts.
 */
class FbServerWsApi {
  private ws: WebSocket | null = null;
  private onMessages: MessagesHandler | null = null;
  private reconnectDelayMs = RECONNECT_BASE_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private connectTimer: NodeJS.Timeout | null = null;
  private isAlive = false;
  private stopped = false;

  start(onMessages: MessagesHandler): void {
    this.stopped = false;
    this.onMessages = onMessages;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.stopKeepAlive();
    this.clearConnectTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  ackMessage(msgId: number | string, nack = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected - cannot ack'));
        return;
      }
      ws.send(JSON.stringify({ msgId, nack }), (err?: Error) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Broadcast a signed/failed response back to MAG over the socket. Frame: { type, payload,
   * routing_id, broadcastId }. `payload` is the same object the HTTP handler publishes downstream —
   * { type, status, request, response, sessionContext } — where sessionContext is the agent's access
   * token (mirrors keylink_tx_sign_response.ts injecting req.accessToken before broadcastMsg).
   * `routing_id` is the agent's tenantId (MAG forwards it verbatim to broadcastMsg). `broadcastId`
   * is a content hash MAG echoes back as a broadcastAck (agent ignores it; no retransmit).
   *
   * tenantId is resolved BEFORE the connection is re-checked so the send happens synchronously on a
   * still-open socket (no stale-socket race across the await).
   */
  async broadcastResponse(msgStatus: MessageStatus, request: MessageEnvelop): Promise<void> {
    const { type } = msgStatus;
    const routing_id = await fbServerApi.getTenantId();
    const accessToken = await fbServerApi.getAccessToken(deviceService.getDeviceData());
    const payload = JSON.stringify({ ...buildResponseObject(msgStatus, request), sessionContext: accessToken });
    const broadcastId = crypto.createHash('sha256').update(`${type}|${payload}|${routing_id}`).digest('hex');
    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected - cannot broadcast'));
        return;
      }
      ws.send(JSON.stringify({ type, payload, routing_id, broadcastId }), (err?: Error) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }
    // Reset liveness for this fresh attempt so a stale `true` from a previous
    // generation can never suppress the first keep-alive check.
    this.isAlive = false;
    try {
      const accessToken = await fbServerApi.getAccessToken(deviceService.getDeviceData());
      if (this.stopped) {
        // stop() was called while we awaited the access token — don't create an orphan socket
        return;
      }
      const wsUrl = MOBILE_GATEWAY_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + WS_PATH;
      logger.info(`WS: connecting to ${wsUrl}`);
      const ws = new WebSocket(wsUrl, {
        headers: { 'x-access-token': accessToken },
        // Bound the upgrade: if the 101 never arrives ws emits 'error' -> reconnect.
        handshakeTimeout: WS_OPEN_TIMEOUT_MS,
        // Cap a single inbound frame so a huge/malicious frame can't stall the loop / spike memory.
        maxPayload: WS_MAX_PAYLOAD_BYTES,
      });
      this.ws = ws;
      // Watchdog for the CONNECTING phase: if 'open' never fires (e.g. TCP connected but the
      // upgrade stalls and even handshakeTimeout somehow doesn't surface) tear it down and retry.
      this.armOpenWatchdog(ws);

      ws.on('open', () => {
        this.clearConnectTimer();
        this.reconnectDelayMs = RECONNECT_BASE_MS;
        this.isAlive = true;
        this.enableTcpKeepAlive(ws);
        this.startKeepAlive(ws);
        logger.info('WS: connected - MAG will push messages (no polling)');
      });

      // any inbound traffic proves the connection is alive
      ws.on('pong', () => {
        this.isAlive = true;
      });

      ws.on('message', (data: WebSocket.RawData) => {
        this.isAlive = true;
        const text = data.toString();
        try {
          const envelope = JSON.parse(text) as FBMessageEnvelope;
          if (envelope && envelope.msg) {
            this.onMessages([envelope]);
          } else {
            // Control frame (e.g. broadcastAck) or a non-message envelope. Repo policy
            // forbids logging raw inbound payloads, so log metadata only — never `text`.
            const isObj = !!envelope && typeof envelope === 'object';
            const hasMsg = isObj && 'msg' in (envelope as object);
            const hasMsgId = isObj && 'msgId' in (envelope as object);
            logger.info(`WS: control frame (${Buffer.byteLength(text)} bytes, hasMsg=${hasMsg}, hasMsgId=${hasMsgId})`);
          }
        } catch (e) {
          logger.error(`WS: failed parsing pushed message: ${e.message}`);
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        if (this.ws !== ws) {
          // Late event from a socket we've already replaced — ignore it so it cannot
          // double-reconnect or null out the current socket.
          return;
        }
        this.clearConnectTimer();
        this.stopKeepAlive();
        this.ws = null;
        logger.error(`WS: closed (code=${code} reason=${reason}) - reconnecting in ~${this.reconnectDelayMs}ms`);
        this.scheduleReconnect();
      });

      ws.on('error', (e: Error) => {
        if (this.ws !== ws) {
          // Late event from a superseded socket — ignore.
          return;
        }
        // Mirror close so an 'error' NOT followed by a 'close' still fully tears down this
        // socket (release + stop keep-alive) and reconnects exactly once. scheduleReconnect()
        // and the socket-identity guard keep an error->close pair to a single reconnect.
        this.clearConnectTimer();
        this.stopKeepAlive();
        this.ws = null;
        logger.error(`WS: error ${e.message} - reconnecting in ~${this.reconnectDelayMs}ms`);
        this.scheduleReconnect();
      });
    } catch (e) {
      logger.error(`WS: connect failed: ${e.message} - retrying in ~${this.reconnectDelayMs}ms`);
      this.scheduleReconnect();
    }
  }

  private armOpenWatchdog(ws: WebSocket): void {
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (this.ws !== ws) {
        return; // socket already opened, replaced, or torn down
      }
      logger.error(`WS: open watchdog fired - no 'open' within ${WS_OPEN_TIMEOUT_MS}ms; terminating and reconnecting`);
      this.stopKeepAlive();
      this.ws = null; // release before terminate so the resulting 'close' is ignored
      try {
        ws.terminate();
      } catch (e) {
        logger.error(`WS: terminate after open-timeout failed: ${e.message}`);
      }
      this.scheduleReconnect();
    }, WS_OPEN_TIMEOUT_MS);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private enableTcpKeepAlive(ws: WebSocket): void {
    // Best-effort TCP keep-alive on the underlying socket. Not part of the public ws
    // type, so probe defensively and never let it break the connection.
    try {
      const socket = (ws as unknown as { _socket?: { setKeepAlive?: (enable: boolean, initialDelay: number) => void } })
        ._socket;
      if (socket && typeof socket.setKeepAlive === 'function') {
        socket.setKeepAlive(true, WS_PING_INTERVAL_MS);
      }
    } catch (e) {
      logger.error(`WS: enabling TCP keep-alive failed: ${e.message}`);
    }
  }

  private startKeepAlive(ws: WebSocket): void {
    this.stopKeepAlive();
    this.pingTimer = setInterval(() => {
      if (this.ws !== ws) {
        // This timer belongs to a superseded socket — stop it.
        this.stopKeepAlive();
        return;
      }
      if (!this.isAlive) {
        logger.error(
          `WS: keep-alive timeout - no pong/traffic within ${WS_PING_INTERVAL_MS}ms, ` +
            'terminating half-dead connection',
        );
        this.stopKeepAlive();
        this.ws = null; // release before terminate so the resulting 'close' is ignored
        try {
          ws.terminate(); // hard close
        } catch (e) {
          logger.error(`WS: terminate on keep-alive timeout failed: ${e.message}`);
        }
        this.scheduleReconnect(); // reconnect directly (the ignored 'close' won't)
        return;
      }
      this.isAlive = false;
      try {
        ws.ping();
      } catch (e) {
        logger.error(`WS: ping failed: ${e.message}`);
      }
    }, WS_PING_INTERVAL_MS);
  }

  private stopKeepAlive(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return; // never double-schedule ('error' + 'close' can both fire)
    }
    // A disconnect can be caused by MAG rejecting our access token server-side (device
    // revoked / re-paired) while the token is still locally unexpired. getAccessToken()
    // caches by the token's own exp, so without this we'd hand back the same rejected token
    // on every retry and the loop could never self-heal until it happened to expire. Drop the
    // cached token here so the next connect() force-fetches a fresh one.
    fbServerApi._resetTokenCache();
    // Equal jitter (delay in [base/2, base]) spreads a fleet's reconnects so they don't
    // stampede MAG in lockstep after a shared outage. Upper bound stays <= base so the
    // exponential-backoff schedule (double/cap/reset-on-open) is preserved.
    const base = this.reconnectDelayMs;
    const half = Math.floor(base / 2);
    const delay = half + crypto.randomInt(half + 1);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectDelayMs = Math.min(base * 2, RECONNECT_MAX_MS);
  }
}

export default new FbServerWsApi();
