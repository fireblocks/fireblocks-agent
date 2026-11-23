// proxy-from-env ships no type declarations.
declare module 'proxy-from-env' {
  /** The proxy URL for a request URL from HTTP(S)_PROXY / ALL_PROXY / NO_PROXY, or '' when none applies. */
  export function getProxyForUrl(url: string | URL): string;
}
