import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { MARKETPLACE_LIMITS, MarketplaceError } from './model.js';

export type NetworkResource =
  'index' | 'publishers' | 'revocations' | 'plugin-package' | 'application-update';
export interface NetworkRequest {
  resource: NetworkResource;
  url: string;
  maximumBytes: number;
  contentTypes: readonly string[];
}
export interface NetworkResponse {
  status: number;
  url: string;
  contentType: string;
  bytes: Uint8Array;
  redirectUrl?: string;
}
export interface NetworkTransport {
  request(request: NetworkRequest, signal: AbortSignal): Promise<NetworkResponse>;
}
export type AddressResolver = (host: string) => Promise<string[]>;

export class ForgeKiNetworkClient {
  private readonly hosts: ReadonlySet<string>;
  constructor(
    hosts: ReadonlySet<string>,
    private readonly transport: NetworkTransport = new FetchTransport(),
    private readonly resolveAddresses: AddressResolver = defaultResolver,
  ) {
    this.hosts = new Set([...hosts].map(normalizeHost));
  }
  fetchMarketplaceIndex(url: string) {
    return this.fetch({
      resource: 'index',
      url,
      maximumBytes: MARKETPLACE_LIMITS.indexBytes,
      contentTypes: ['application/json'],
    });
  }
  fetchPublisherRegistry(url: string) {
    return this.fetch({
      resource: 'publishers',
      url,
      maximumBytes: MARKETPLACE_LIMITS.publishersBytes,
      contentTypes: ['application/json'],
    });
  }
  fetchRevocations(url: string) {
    return this.fetch({
      resource: 'revocations',
      url,
      maximumBytes: MARKETPLACE_LIMITS.revocationsBytes,
      contentTypes: ['application/json'],
    });
  }
  fetchPluginPackage(url: string) {
    return this.fetch({
      resource: 'plugin-package',
      url,
      maximumBytes: MARKETPLACE_LIMITS.packageBytes,
      contentTypes: ['application/vnd.forgeki.plugin+json'],
    });
  }
  checkApplicationUpdates(url: string) {
    return this.fetch({
      resource: 'application-update',
      url,
      maximumBytes: MARKETPLACE_LIMITS.updateMetadataBytes,
      contentTypes: ['application/json'],
    });
  }

  private async fetch(initial: NetworkRequest): Promise<Uint8Array> {
    let request = initial;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MARKETPLACE_LIMITS.timeoutMs);
    try {
      for (let redirects = 0; redirects <= MARKETPLACE_LIMITS.redirects; redirects += 1) {
        await assertAllowedNetworkUrl(request.url, this.hosts, this.resolveAddresses);
        const response = await this.transport.request(request, controller.signal);
        if (response.redirectUrl) {
          if (redirects === MARKETPLACE_LIMITS.redirects)
            throw new MarketplaceError('NETWORK_POLICY', 'Marketplace redirect limit exceeded.');
          request = { ...request, url: new URL(response.redirectUrl, request.url).toString() };
          continue;
        }
        if (response.status < 200 || response.status >= 300)
          throw new MarketplaceError(
            'NETWORK_FAILURE',
            `Trusted service returned HTTP ${response.status}.`,
          );
        if (
          !request.contentTypes.some((type) => response.contentType.toLowerCase().startsWith(type))
        )
          throw new MarketplaceError(
            'NETWORK_POLICY',
            'Trusted service returned an unsupported content type.',
          );
        if (response.bytes.byteLength > request.maximumBytes)
          throw new MarketplaceError(
            'NETWORK_POLICY',
            'Trusted service response exceeded its size limit.',
          );
        return response.bytes;
      }
      throw new MarketplaceError('NETWORK_POLICY', 'Redirect limit exceeded.');
    } catch (error) {
      if (error instanceof MarketplaceError) throw error;
      throw new MarketplaceError(
        'NETWORK_FAILURE',
        error instanceof Error && error.name === 'AbortError'
          ? 'Trusted service request timed out.'
          : 'Trusted service is unavailable.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function assertAllowedNetworkUrl(
  value: string,
  hosts: ReadonlySet<string>,
  resolveAddresses: AddressResolver = defaultResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MarketplaceError('NETWORK_POLICY', 'Remote URL is invalid.');
  }
  const hostname = normalizeHost(url.hostname);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !hosts.has(hostname)
  )
    throw new MarketplaceError(
      'NETWORK_POLICY',
      'Remote URL is outside the trusted HTTPS allowlist.',
    );
  if (isBlockedHost(hostname))
    throw new MarketplaceError(
      'NETWORK_POLICY',
      'Local and private network destinations are blocked.',
    );
  const addresses = await resolveAddresses(hostname);
  if (!addresses.length || addresses.some(isPrivateAddress))
    throw new MarketplaceError('NETWORK_POLICY', 'DNS resolved to a blocked network address.');
  return url;
}

export function isPrivateAddress(address: string): boolean {
  const normalized = normalizeHost(address.toLowerCase().split('%')[0]!);
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89a-f]/u.test(normalized) ||
    normalized.startsWith('ff')
  )
    return true;
  const dottedMapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  const hexadecimalMapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  const mapped = hexadecimalMapped
    ? [
        Number.parseInt(hexadecimalMapped[1]!, 16) >> 8,
        Number.parseInt(hexadecimalMapped[1]!, 16) & 0xff,
        Number.parseInt(hexadecimalMapped[2]!, 16) >> 8,
        Number.parseInt(hexadecimalMapped[2]!, 16) & 0xff,
      ].join('.')
    : dottedMapped;
  const ip = mapped ?? normalized;
  if (isIP(ip) !== 4) return false;
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    a! >= 224
  );
}
function isBlockedHost(host: string): boolean {
  const lower = normalizeHost(host);
  return (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    (isIP(lower) > 0 && isPrivateAddress(lower))
  );
}
function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/\.$/u, '')
    .replace(/^\[|\]$/gu, '');
}
async function defaultResolver(host: string): Promise<string[]> {
  return (await lookup(host, { all: true, verbatim: true })).map(({ address }) => address);
}

class FetchTransport implements NetworkTransport {
  async request(request: NetworkRequest, signal: AbortSignal): Promise<NetworkResponse> {
    const response = await fetch(request.url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
      headers: { accept: request.contentTypes.join(', ') },
    });
    const redirectUrl =
      response.status >= 300 && response.status < 400
        ? (response.headers.get('location') ?? undefined)
        : undefined;
    if (redirectUrl) {
      return {
        status: response.status,
        url: response.url,
        contentType: response.headers.get('content-type') ?? '',
        bytes: new Uint8Array(),
        redirectUrl,
      };
    }
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > request.maximumBytes)
      throw new MarketplaceError(
        'NETWORK_POLICY',
        'Trusted service response exceeded its size limit.',
      );
    if (!response.body)
      throw new MarketplaceError('NETWORK_FAILURE', 'Trusted service returned no response body.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > request.maximumBytes) {
        await reader.cancel('ForgeKi response size limit exceeded.').catch(() => undefined);
        throw new MarketplaceError(
          'NETWORK_POLICY',
          'Trusted service response exceeded its size limit.',
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      status: response.status,
      url: response.url,
      contentType: response.headers.get('content-type') ?? '',
      bytes,
      ...(redirectUrl ? { redirectUrl } : {}),
    };
  }
}
