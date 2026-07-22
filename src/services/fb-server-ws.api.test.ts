import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'crypto';

// The WS client requires the untyped `ws` module at load time; mock it with a minimal
// EventEmitter-like fake so we can drive open/message/close and inspect send/ping.
jest.mock('ws', () => {
  const instances: any[] = [];
  const MockWebSocket: any = jest.fn().mockImplementation((url: string, options: any) => {
    const handlers: { [event: string]: (...args: any[]) => void } = {};
    const socket: any = {
      url,
      options,
      readyState: 1, // OPEN
      on: jest.fn((event: string, cb: (...args: any[]) => void) => {
        handlers[event] = cb;
      }),
      send: jest.fn((_data: string, cb?: (err?: Error) => void) => cb && cb(undefined)),
      ping: jest.fn(),
      terminate: jest.fn(),
      close: jest.fn(),
      emit: (event: string, ...args: any[]) => handlers[event] && handlers[event](...args),
    };
    instances.push(socket);
    return socket;
  });
  MockWebSocket.OPEN = 1;
  MockWebSocket.instances = instances;
  return MockWebSocket;
});

import deviceService from './device.service';
import fbServerApi, { buildResponseObject } from './fb-server.api';
import wsApi from './fb-server-ws.api';
import logger from './logger';
import { FBMessageEnvelope, MessageEnvelop, MessageStatus } from '../types';
import { WS_MAX_PAYLOAD_BYTES, WS_OPEN_TIMEOUT_MS, WS_PING_INTERVAL_MS } from '../constants';

const RECONNECT_BASE_MS = 1_000;

const MockWebSocket: any = require('ws');

const flushMicrotasks = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

describe('fb-server-ws.api', () => {
  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    MockWebSocket.mockClear();
    jest.spyOn(fbServerApi, 'getAccessToken').mockResolvedValue('access-token');
    jest.spyOn(deviceService, 'getDeviceData').mockReturnValue({
      userId: 'user-id',
      deviceId: 'device-id',
      refreshToken: 'refresh-token',
    });
  });

  afterEach(() => {
    wsApi.stop();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('connects to the wss /msg/ws endpoint using the access token header', async () => {
    wsApi.start(jest.fn());
    await flushMicrotasks();

    expect(MockWebSocket).toHaveBeenCalledTimes(1);
    const [url, options] = MockWebSocket.mock.calls[0];
    expect(url).toMatch(/\/msg\/ws$/);
    expect(url.startsWith('ws')).toBe(true);
    expect(options.headers['x-access-token']).toBe('access-token');
  });

  it('delivers a pushed envelope to the injected handler', async () => {
    const onMessages = jest.fn();
    wsApi.start(onMessages);
    await flushMicrotasks();

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    socket.emit('open');

    const envelope: FBMessageEnvelope = {
      msg: 'signed.jwt.token',
      msgId: 42,
      deviceId: 'device-id',
      internalMessageId: 'internal-id',
    };
    socket.emit('message', Buffer.from(JSON.stringify(envelope)));

    expect(onMessages).toHaveBeenCalledWith([envelope]);
  });

  it('acks over the socket with { msgId, nack: false }', async () => {
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const socket = MockWebSocket.instances[0];
    socket.emit('open');

    await wsApi.ackMessage(42);

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ msgId: 42, nack: false }), expect.any(Function));
  });

  it('rejects an ack when the socket is not connected', async () => {
    // start() was never called, so there is no live socket
    await expect(wsApi.ackMessage(7)).rejects.toThrow('WebSocket not connected');
  });

  // A request/response pair whose message.payload is a JSON string (buildResponseObject parses it).
  const aTxSignRequestEnvelope = (): MessageEnvelop => ({
    message: {
      payloadSignatureData: { service: 'some-service', signature: 'sig' },
      payload: JSON.stringify({ some: 'request-payload' }),
    },
    transportMetadata: { requestId: 'req-1', type: 'KEY_LINK_TX_SIGN_REQUEST' },
  });
  const aTxSignSignedStatus = (): MessageStatus => ({
    type: 'KEY_LINK_TX_SIGN_RESPONSE',
    status: 'SIGNED',
    requestId: 'req-1',
    response: { signedMessages: [{ message: 'm', signature: 's', index: 0 }] },
  });

  it('broadcasts a frame shaped { type, payload, routing_id, broadcastId } over the socket', async () => {
    const tenantId = 'tenant-abc';
    jest.spyOn(fbServerApi, 'getTenantId').mockResolvedValue(tenantId);

    wsApi.start(jest.fn());
    await flushMicrotasks();
    const socket = MockWebSocket.instances[0];
    socket.emit('open');

    const request = aTxSignRequestEnvelope();
    const msgStatus = aTxSignSignedStatus();
    await wsApi.broadcastResponse(msgStatus, request);

    // the only thing written on this socket is the broadcast frame
    expect(socket.send).toHaveBeenCalledTimes(1);
    const [sent] = socket.send.mock.calls[0];
    const frame = JSON.parse(sent);
    expect(Object.keys(frame).sort()).toEqual(['broadcastId', 'payload', 'routing_id', 'type']);

    // type is the response type; routing_id is the tenantId resolved from getTenantId
    expect(frame.type).toBe('KEY_LINK_TX_SIGN_RESPONSE');
    expect(frame.routing_id).toBe(tenantId);

    // payload JSON-parses back to the SAME object the HTTP path posts (buildResponseObject)
    expect(JSON.parse(frame.payload)).toEqual(buildResponseObject(msgStatus, request));

    // broadcastId is sha256hex(type|payload|routing_id)
    const expectedBroadcastId = crypto
      .createHash('sha256')
      .update(`${frame.type}|${frame.payload}|${frame.routing_id}`)
      .digest('hex');
    expect(frame.broadcastId).toBe(expectedBroadcastId);
  });

  it('rejects a broadcast when the socket is not connected', async () => {
    // getTenantId is resolved before the connection is re-checked; stub it so the rejection is
    // the not-connected guard rather than a real token fetch.
    jest.spyOn(fbServerApi, 'getTenantId').mockResolvedValue('tenant-abc');
    // start() was never called, so there is no live socket
    await expect(wsApi.broadcastResponse(aTxSignSignedStatus(), aTxSignRequestEnvelope())).rejects.toThrow(
      'WebSocket not connected',
    );
  });

  it('reports isConnected only while the socket is open', async () => {
    expect(wsApi.isConnected()).toBe(false);

    wsApi.start(jest.fn());
    await flushMicrotasks();
    const socket = MockWebSocket.instances[0];
    socket.emit('open');
    expect(wsApi.isConnected()).toBe(true);

    socket.readyState = 3; // CLOSED
    expect(wsApi.isConnected()).toBe(false);
  });

  it('schedules a reconnect after the socket closes', async () => {
    jest.useFakeTimers();
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const first = MockWebSocket.instances[0];
    first.emit('open');
    expect(MockWebSocket).toHaveBeenCalledTimes(1);

    first.emit('close', 1006, Buffer.from('dropped'));
    // exponential backoff starts at 1s; advancing the timer triggers a fresh connect
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();

    expect(MockWebSocket).toHaveBeenCalledTimes(2);
  });

  it('drops the cached access token on reconnect so a server-rejected token is re-fetched', async () => {
    jest.useFakeTimers();
    const resetSpy = jest.spyOn(fbServerApi, '_resetTokenCache');
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const first = MockWebSocket.instances[0];
    first.emit('open');
    // the initial connect must NOT reset the cache (start() -> connect() does not go via reconnect)
    expect(resetSpy).not.toHaveBeenCalled();

    // a disconnect (e.g. MAG rejected the token server-side while it is still locally unexpired)
    // must clear the cached token before the retry, so getAccessToken() force-fetches a fresh one
    // instead of looping on the same rejected token until it happens to expire.
    first.emit('close', 1006, Buffer.from('unauthorized'));
    expect(resetSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(MockWebSocket).toHaveBeenCalledTimes(2);
  });

  it('schedules a reconnect after an error even when no close event follows', async () => {
    jest.useFakeTimers();
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const first = MockWebSocket.instances[0];
    first.emit('open');
    expect(MockWebSocket).toHaveBeenCalledTimes(1);

    // an 'error' that is NOT followed by a 'close' must still recover
    first.emit('error', new Error('boom'));
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();

    expect(MockWebSocket).toHaveBeenCalledTimes(2);
  });

  it('reconnects exactly once for an error immediately followed by a close', async () => {
    jest.useFakeTimers();
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const first = MockWebSocket.instances[0];
    first.emit('open');

    // error then close on the SAME socket: scheduleReconnect() is idempotent, so this
    // must yield exactly one reconnect (two constructions total), not two.
    first.emit('error', new Error('boom'));
    first.emit('close', 1006, Buffer.from('dropped'));
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();

    expect(MockWebSocket).toHaveBeenCalledTimes(2);
  });

  it('ignores late events from a superseded socket', async () => {
    jest.useFakeTimers();
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const first = MockWebSocket.instances[0];
    first.emit('open');

    // drop the first socket and let the reconnect fire so a second socket becomes current
    first.emit('close', 1006, Buffer.from('dropped'));
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(MockWebSocket).toHaveBeenCalledTimes(2);

    const second = MockWebSocket.instances[1];
    second.emit('open');
    expect(wsApi.isConnected()).toBe(true);

    // late events from the already-replaced first socket must be ignored: no extra
    // reconnect is scheduled and the current (second) socket is left intact.
    first.emit('close', 1006, Buffer.from('late'));
    first.emit('error', new Error('late'));
    jest.advanceTimersByTime(5000);
    await flushMicrotasks();

    expect(MockWebSocket).toHaveBeenCalledTimes(2);
    expect(wsApi.isConnected()).toBe(true);
  });

  it('does not create a socket when stop() is called during the token await', async () => {
    let resolveToken: (token: string) => void = () => undefined;
    jest
      .spyOn(fbServerApi, 'getAccessToken')
      .mockReturnValue(new Promise<string>((resolve) => (resolveToken = resolve)) as any);

    wsApi.start(jest.fn());
    await flushMicrotasks();
    // connect() is parked on the token await, so no socket exists yet
    expect(MockWebSocket).not.toHaveBeenCalled();

    wsApi.stop();
    resolveToken('access-token');
    await flushMicrotasks();

    // the post-await stopped-guard prevents an orphan socket
    expect(MockWebSocket).not.toHaveBeenCalled();
  });

  it('logs control-frame metadata without the raw payload', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation((() => undefined) as any);
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const socket = MockWebSocket.instances[0];
    socket.emit('open');

    const secret = 'super-secret-control-frame-value';
    socket.emit('message', Buffer.from(JSON.stringify({ type: 'broadcastAck', secret })));

    const logged = infoSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('control frame');
    expect(logged).not.toContain(secret);
  });

  it('bounds the handshake and inbound frame size on the socket', async () => {
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const [, options] = MockWebSocket.mock.calls[0];
    expect(options.handshakeTimeout).toBe(WS_OPEN_TIMEOUT_MS);
    expect(options.maxPayload).toBe(WS_MAX_PAYLOAD_BYTES);
  });

  it('terminates and reconnects when the open handshake stalls (open never fires)', async () => {
    jest.useFakeTimers();
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const first = MockWebSocket.instances[0];
    expect(first).toBeDefined();
    // deliberately never emit 'open': the CONNECTING-phase watchdog must fire and tear down.
    jest.advanceTimersByTime(WS_OPEN_TIMEOUT_MS);
    expect(first.terminate).toHaveBeenCalledTimes(1);

    // the backoff timer then drives a fresh connection attempt
    jest.advanceTimersByTime(RECONNECT_BASE_MS);
    await flushMicrotasks();
    expect(MockWebSocket).toHaveBeenCalledTimes(2);
  });

  it('terminates and reconnects when no pong arrives within the keep-alive interval', async () => {
    jest.useFakeTimers();
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const first = MockWebSocket.instances[0];
    first.emit('open'); // arms keep-alive (isAlive=true), clears the open watchdog

    // first interval: connection looked alive -> send a ping and flip isAlive to false
    jest.advanceTimersByTime(WS_PING_INTERVAL_MS);
    expect(first.ping).toHaveBeenCalledTimes(1);

    // second interval with no pong/traffic in between -> half-dead -> terminate + reconnect
    jest.advanceTimersByTime(WS_PING_INTERVAL_MS);
    expect(first.terminate).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(RECONNECT_BASE_MS);
    await flushMicrotasks();
    expect(MockWebSocket).toHaveBeenCalledTimes(2);
  });

  it('keeps pinging (no terminate) while pongs keep the connection alive', async () => {
    jest.useFakeTimers();
    wsApi.start(jest.fn());
    await flushMicrotasks();

    const first = MockWebSocket.instances[0];
    first.emit('open');

    jest.advanceTimersByTime(WS_PING_INTERVAL_MS);
    expect(first.ping).toHaveBeenCalledTimes(1);

    first.emit('pong'); // liveness restored before the next interval
    jest.advanceTimersByTime(WS_PING_INTERVAL_MS);

    expect(first.ping).toHaveBeenCalledTimes(2);
    expect(first.terminate).not.toHaveBeenCalled();
    expect(MockWebSocket).toHaveBeenCalledTimes(1); // still the original socket, no reconnect
  });
});
