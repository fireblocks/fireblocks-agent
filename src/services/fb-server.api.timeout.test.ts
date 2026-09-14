import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import http from 'http';
import net from 'net';

// Deadlines on the MAG calls, exercised against real sockets rather than a mocked adapter.
//
// The failure these guard is NOT a connection error -- those already reject promptly. It is a
// gateway that completes the TCP handshake and then never sends a response: no RST, no FIN, no
// error event. Node's http client has no deadline of its own, so without an explicit timeout the
// promise never settles. Outbound TCP keep-alive is off by default, and even enabled it is a
// ~2h backstop on Linux. A mock adapter cannot reproduce that; a listening socket that stays
// silent can.

/** Accepts connections and answers nothing, ever. */
const startSilentServer = async (routes: Record<string, string> = {}) => {
  const sockets = new Set<net.Socket>();
  const server = http.createServer((req, res) => {
    const body = routes[(req.url || '').split('?')[0]];
    if (body === undefined) {
      return; // hang: request received, response never written
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(body);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      // requests still parked on this server hold their sockets open; drop them so the
      // handles do not outlive the suite
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

// Vars this suite writes. process.env is process-wide and jest reuses a worker across test files
// (and --runInBand puts every file in one process), so leaving MOBILE_GATEWAY_URL pointed at a
// port this suite has already closed would leak into any suite that runs after it.
const OWNED_ENV = ['MOBILE_GATEWAY_URL', 'FB_HTTP_TIMEOUT_MS', 'FB_LONG_POLL_TIMEOUT_MS'] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  OWNED_ENV.forEach((key) => (originalEnv[key] = process.env[key]));
});

afterEach(() => {
  OWNED_ENV.forEach((key) => {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  });
});

/** Load a fresh copy of the api module bound to the given gateway url and deadlines. */
const loadApi = (env: Record<string, string>) => {
  let api: typeof import('./fb-server.api').default;
  jest.isolateModules(() => {
    Object.assign(process.env, env);
    api = require('./fb-server.api').default;
  });
  return api!;
};

/** 'rejected' | 'resolved' | 'still pending' after `withinMs`. */
const settlement = async (promise: Promise<unknown>, withinMs: number) => {
  let timer: NodeJS.Timeout;
  const outcome = await Promise.race([
    promise.then(
      () => 'resolved',
      () => 'rejected',
    ),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve('still pending'), withinMs);
    }),
  ]);
  clearTimeout(timer!);
  return outcome;
};

const someDeviceData = { userId: 'user-id', deviceId: 'device-id', refreshToken: 'refresh-token' };

type Api = typeof import('./fb-server.api').default;

const aTxSignRequest = () => ({
  message: {
    payloadSignatureData: { service: 'signing_service', signature: 'sig' },
    payload: JSON.stringify({ requestId: 'req-1', type: 'KEY_LINK_TX_SIGN_REQUEST' }),
  },
  transportMetadata: { requestId: 'req-1', type: 'KEY_LINK_TX_SIGN_REQUEST' as const },
});

const aSignedStatus = () => ({
  type: 'KEY_LINK_TX_SIGN_RESPONSE' as const,
  status: 'SIGNED' as const,
  requestId: 'req-1',
  response: { signedMessages: [{ index: 0, message: 'm', signature: 's' }] },
});

describe('fb-server.api request deadlines', () => {
  let gateway: Awaited<ReturnType<typeof startSilentServer>>;

  beforeAll(async () => {
    gateway = await startSilentServer();
  });

  afterAll(async () => {
    await gateway.close();
  });

  it('gives up on an access-token fetch the gateway never answers', async () => {
    const api = loadApi({ MOBILE_GATEWAY_URL: gateway.url, FB_HTTP_TIMEOUT_MS: '150' });

    // This is the fetch connect() awaits before it has a socket or an armed timer. Left
    // unsettled it severs the WebSocket reconnect chain (see fb-server-ws.api.ts).
    const outcome = await settlement(api.getAccessToken(someDeviceData), 1500);

    expect(outcome).toBe('rejected');
  });
});

describe('fb-server.api request deadlines - authenticated calls', () => {
  // /access_token answers so each call gets past authentication and parks on its own endpoint;
  // otherwise every one of these would "pass" on the token fetch timing out instead.
  let gateway: Awaited<ReturnType<typeof startSilentServer>>;

  beforeAll(async () => {
    gateway = await startSilentServer({ '/access_token': JSON.stringify({ accessToken: 'test-token' }) });
  });

  afterAll(async () => {
    await gateway.close();
  });

  const shortCalls: Array<[string, (api: Api) => Promise<unknown>]> = [
    ['pairDevice', (api) => api.pairDevice({ userId: 'user-id', pairingToken: 'pairing-token' })],
    ['getCertificates', (api) => api.getCertificates()],
    ['ackMessage', (api) => api.ackMessage(1)],
    ['broadcastResponse', (api) => api.broadcastResponse(aSignedStatus(), aTxSignRequest())],
  ];

  it.each(shortCalls)('gives up on %s when the gateway never answers', async (_name, invoke) => {
    const api = loadApi({ MOBILE_GATEWAY_URL: gateway.url, FB_HTTP_TIMEOUT_MS: '150' });

    expect(await settlement(invoke(api), 1500)).toBe('rejected');
  });

  it('does not apply the short deadline to the getMessages long poll', async () => {
    // /msg is a long poll: MAG holds the request open until a message arrives or its own window
    // expires. Bounding it by the short deadline would abort every idle poll, so it gets the far
    // larger FB_LONG_POLL_TIMEOUT_MS instead -- still bounded, just not on this scale.
    const api = loadApi({
      MOBILE_GATEWAY_URL: gateway.url,
      FB_HTTP_TIMEOUT_MS: '150',
      FB_LONG_POLL_TIMEOUT_MS: '180000',
    });

    expect(await settlement(api.getMessages(), 1500)).toBe('still pending');
  });
});
