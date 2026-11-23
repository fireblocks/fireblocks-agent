import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import net, { AddressInfo } from 'net';
import WebSocket, { WebSocketServer } from 'ws';
import { describeRoute, proxyAgentFor, proxyFor, redactProxyUrl } from './proxy';

const PROXY_VARS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'NO_PROXY',
  'no_proxy',
  'ALL_PROXY',
  'all_proxy',
];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const name of PROXY_VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});
afterEach(() => {
  for (const name of PROXY_VARS) {
    if (saved[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = saved[name];
    }
  }
});

const MAG = 'https://mobile-api.fireblocks.io';

describe('proxyFor', () => {
  it('is undefined when no proxy is set', () => {
    expect(proxyFor(MAG)).toBeUndefined();
    expect(proxyAgentFor(MAG)).toBeUndefined();
  });

  it('uses HTTPS_PROXY for https URLs', () => {
    process.env.HTTPS_PROXY = 'http://proxy.example.internal:3128';
    expect(proxyFor(MAG)).toBe('http://proxy.example.internal:3128');
  });

  it('accepts the lower-case variable too', () => {
    process.env.https_proxy = 'http://proxy.example.internal:3128';
    expect(proxyFor(MAG)).toBe('http://proxy.example.internal:3128');
  });

  it('does not use HTTP_PROXY for https URLs', () => {
    process.env.HTTP_PROXY = 'http://proxy.example.internal:3128';
    expect(proxyFor(MAG)).toBeUndefined();
    expect(proxyFor('http://mag.example.internal')).toBe('http://proxy.example.internal:3128');
  });

  it('goes direct for hosts in NO_PROXY, by exact name or domain suffix', () => {
    process.env.HTTPS_PROXY = 'http://proxy.example.internal:3128';
    process.env.NO_PROXY = 'localhost,.svc,.fireblocks.io';
    expect(proxyFor(MAG)).toBeUndefined();
    expect(proxyFor('https://keylink-flow.keylink.svc:5000/api')).toBeUndefined();
    expect(proxyFor('https://api.example.com')).toBe('http://proxy.example.internal:3128');
  });
});

describe('proxyAgentFor', () => {
  it('returns one tunnelling agent per proxy URL', () => {
    process.env.HTTPS_PROXY = 'http://proxy.example.internal:3128';
    const agent = proxyAgentFor(MAG);
    expect(agent).toBeInstanceOf(HttpsProxyAgent);
    expect((agent as HttpsProxyAgent<string>).proxy.host).toBe('proxy.example.internal:3128');
    expect(proxyAgentFor(`${MAG}/msg/ws`)).toBe(agent);
  });
});

describe('redactProxyUrl and describeRoute', () => {
  it('never shows the user name or password', () => {
    // A proxy URL with a user name and password, built rather than written out: not a real credential.
    const url = new URL('http://proxy.example.internal:3128');
    url.username = 'svc-user';
    url.password = 'placeholder';
    const proxy = url.toString();
    expect(redactProxyUrl(proxy)).toBe('http://proxy.example.internal:3128');
    process.env.HTTPS_PROXY = proxy;
    expect(describeRoute(MAG)).toBe('through the proxy http://proxy.example.internal:3128');
    expect(describeRoute(MAG)).not.toContain('placeholder');
    expect(describeRoute(MAG)).not.toContain('svc-user');
  });

  it('says direct when there is no proxy', () => {
    expect(describeRoute(MAG)).toBe('direct (no proxy)');
  });

  it('does not echo a value that is not a URL', () => {
    expect(redactProxyUrl('not a url with a secret')).toBe('[proxy URL that is not a valid URL]');
  });
});

describe('WebSocket through the proxy', () => {
  // A local WebSocket server and a minimal CONNECT proxy that records where it was asked to go.
  let wsServer: WebSocketServer;
  let httpServer: http.Server;
  let proxyServer: net.Server;
  const connectRequests: string[] = [];

  beforeEach(async () => {
    connectRequests.length = 0;
    httpServer = http.createServer();
    wsServer = new WebSocketServer({ server: httpServer });
    wsServer.on('connection', (socket) => socket.send('hello'));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

    proxyServer = net.createServer((client) => {
      client.once('data', (chunk) => {
        const [requestLine] = chunk.toString('latin1').split('\r\n');
        const [method, target] = requestLine.split(' ');
        connectRequests.push(`${method} ${target}`);
        const [host, port] = target.split(':');
        const upstream = net.connect(Number(port), host, () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          upstream.pipe(client);
          client.pipe(upstream);
        });
        upstream.on('error', () => client.destroy());
      });
    });
    await new Promise<void>((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    wsServer.close();
    await new Promise((resolve) => httpServer.close(resolve));
    await new Promise((resolve) => proxyServer.close(resolve));
  });

  it('opens the WebSocket through a CONNECT tunnel', async () => {
    const wsPort = (httpServer.address() as AddressInfo).port;
    const proxyPort = (proxyServer.address() as AddressInfo).port;
    process.env.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;
    const target = `http://127.0.0.1:${wsPort}`;

    const ws = new WebSocket(`ws://127.0.0.1:${wsPort}/msg/ws`, { agent: proxyAgentFor(target) });
    const first = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      ws.on('error', reject);
    });
    ws.close();

    expect(first).toBe('hello');
    expect(connectRequests).toEqual([`CONNECT 127.0.0.1:${wsPort}`]);
  });
});
