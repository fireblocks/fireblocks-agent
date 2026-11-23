import type { Agent } from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';

// Outbound proxy for the Agent's connections to Fireblocks.
//
// The standard HTTPS_PROXY, HTTP_PROXY and NO_PROXY variables (upper or lower case) choose the
// proxy, resolved by proxy-from-env, the same resolver axios uses for the REST calls, from the same
// settings. The proxy is used as a
// CONNECT tunnel: TLS to Fireblocks stays end to end, and the certificate is checked against the
// default CA certificates plus NODE_EXTRA_CA_CERTS (the root CA of a TLS-inspecting proxy).
//
// The Agent never sends its calls to the Customer Server through the proxy (see
// customer-server.api.ts): signing requests stay on the direct path to the customer's own server.

const agents = new Map<string, HttpsProxyAgent<string>>();

/** The proxy for a URL, from the environment, or undefined when it goes direct (unset or NO_PROXY). */
export const proxyFor = (targetUrl: string): string | undefined => getProxyForUrl(targetUrl) || undefined;

/**
 * An agent that tunnels through the proxy for this URL, or undefined when the URL goes direct.
 * One agent per proxy URL, so connections reuse it. Pass the https:// form of a wss:// URL: the
 * proxy variables are named after HTTP schemes.
 */
export const proxyAgentFor = (targetUrl: string): Agent | undefined => {
  const proxy = proxyFor(targetUrl);
  if (!proxy) {
    return undefined;
  }
  let agent = agents.get(proxy);
  if (!agent) {
    agent = new HttpsProxyAgent(proxy);
    agents.set(proxy, agent);
  }
  return agent;
};

/** The proxy URL without user name and password, for logs. */
export const redactProxyUrl = (proxy: string): string => {
  try {
    const url = new URL(proxy);
    url.username = '';
    url.password = '';
    return url.origin === 'null' ? `${url.protocol}//${url.host}` : url.origin;
  } catch {
    return '[proxy URL that is not a valid URL]';
  }
};

/** One line for the startup log: where calls to this Fireblocks URL go. Never shows credentials. */
export const describeRoute = (targetUrl: string): string => {
  const proxy = proxyFor(targetUrl);
  return proxy ? `through the proxy ${redactProxyUrl(proxy)}` : 'direct (no proxy)';
};
