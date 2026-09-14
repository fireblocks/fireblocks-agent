import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import http from 'http';
import https from 'https';
import net from 'net';

// Deadlines on the customer-server calls, exercised against real sockets rather than a mocked
// adapter -- same reasoning as fb-server.api.timeout.test.ts: the failure is not a connection
// error but a peer that completes the TCP handshake and then never responds, which no mock
// adapter reproduces.
//
// The customer server is customer-operated infrastructure (CUSTOMER_SERVER_URL points at a
// service the operator wrote; examples/server is only a reference), so the agent has no basis for
// assuming it will not accept a connection and go silent. Unbounded, a hung /messagesStatus stops
// the status-poll loop for the life of the process: the reschedule in customer-server-client.ts
// sits after the await, and the catch that would reach it needs a rejection -- a hang is the
// absence of one.

/** Accepts connections and answers nothing, ever. */
const startSilentServer = async () => {
  const sockets = new Set<net.Socket>();
  const server = http.createServer(() => {
    return; // request received, response never written
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
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

// Vars this suite writes. process.env is process-wide and jest reuses a worker across test files
// (and --runInBand puts every file in one process), so leaving CUSTOMER_SERVER_URL pointed at a
// port this suite has already closed would leak into any suite that runs after it.
const OWNED_ENV = ['CUSTOMER_SERVER_URL', 'CUSTOMER_SERVER_TIMEOUT_MS', 'CUSTOMER_SERVER_SIGN_TIMEOUT_MS'] as const;
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

/** Load a fresh copy of the api module bound to the given customer-server url and deadlines. */
const loadApi = (env: Record<string, string>) => {
  let api: typeof import('./customer-server.api').default;
  jest.isolateModules(() => {
    Object.assign(process.env, env);
    api = require('./customer-server.api').default;
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

const httpsAgent = new https.Agent();

const aMessageEnvelope = () => ({
  message: {
    payloadSignatureData: { service: 'signing_service', signature: 'sig' },
    payload: JSON.stringify({ requestId: 'req-1', type: 'KEY_LINK_TX_SIGN_REQUEST' }),
  },
  transportMetadata: { requestId: 'req-1', type: 'KEY_LINK_TX_SIGN_REQUEST' as const },
});

describe('customer-server.api request deadlines', () => {
  let customerServer: Awaited<ReturnType<typeof startSilentServer>>;

  beforeAll(async () => {
    customerServer = await startSilentServer();
  });

  afterAll(async () => {
    await customerServer.close();
  });

  it('gives up on messagesStatus when the customer server never answers', async () => {
    const api = loadApi({ CUSTOMER_SERVER_URL: customerServer.url, CUSTOMER_SERVER_TIMEOUT_MS: '150' });

    // This is the call the status-poll loop awaits. Left unsettled it never reaches the
    // setTimeout that schedules the next poll, and status updates stop permanently.
    const outcome = await settlement(api.messagesStatus({ requestsIds: ['req-1'] } as any, httpsAgent), 1500);

    expect(outcome).toBe('rejected');
  });

  it('gives up on messagesToSign when the customer server never answers', async () => {
    const api = loadApi({ CUSTOMER_SERVER_URL: customerServer.url, CUSTOMER_SERVER_SIGN_TIMEOUT_MS: '150' });

    const outcome = await settlement(api.messagesToSign([aMessageEnvelope()] as any, httpsAgent), 1500);

    expect(outcome).toBe('rejected');
  });

  it('does not apply the status deadline to messagesToSign', async () => {
    // In HOT mode the reference server signs inline inside /messagesToSign, so a real HSM batch
    // can legitimately outlast the status deadline. Bounding it on that scale would abort healthy
    // signing; it gets its own far larger budget instead -- still bounded, just not on this scale.
    const api = loadApi({
      CUSTOMER_SERVER_URL: customerServer.url,
      CUSTOMER_SERVER_TIMEOUT_MS: '150',
      CUSTOMER_SERVER_SIGN_TIMEOUT_MS: '120000',
    });

    const outcome = await settlement(api.messagesToSign([aMessageEnvelope()] as any, httpsAgent), 1500);

    expect(outcome).toBe('still pending');
  });
});
