import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ForgeKiNetworkClient,
  assertAllowedNetworkUrl,
  isPrivateAddress,
  type NetworkRequest,
  type NetworkTransport,
} from './network.js';

class Transport implements NetworkTransport {
  constructor(
    private readonly responses: Array<Partial<Awaited<ReturnType<NetworkTransport['request']>>>>,
  ) {}
  async request(request: NetworkRequest) {
    const response = this.responses.shift() ?? {};
    return {
      status: 200,
      url: request.url,
      contentType: 'application/json',
      bytes: new Uint8Array([1]),
      ...response,
    };
  }
}
const hosts = new Set(['catalog.example.test']);
const publicResolver = async () => ['203.0.113.10'];

describe('central network policy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('allows only an allowlisted HTTPS host resolving publicly', async () => {
    await expect(
      assertAllowedNetworkUrl('https://catalog.example.test/index.json', hosts, publicResolver),
    ).resolves.toBeInstanceOf(URL);
  });
  it.each([
    'http://catalog.example.test',
    'file:///tmp/x',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://user@catalog.example.test/x',
    'https://catalog.example.test:8443/x',
    'https://unapproved.example/x',
  ])('rejects unsafe URL %s', async (url) => {
    await expect(assertAllowedNetworkUrl(url, hosts, publicResolver)).rejects.toThrow();
  });
  it.each([
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '127.1.2.3',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'ff02::1',
  ])('classifies private address %s', (address) => expect(isPrivateAddress(address)).toBe(true));
  it('rejects DNS rebinding to private space', async () => {
    await expect(
      assertAllowedNetworkUrl('https://catalog.example.test', hosts, async () => ['192.168.1.2']),
    ).rejects.toThrow(/DNS/u);
  });
  it.each(['https://2130706433/x', 'https://0x7f000001/x', 'https://0177.0.0.1/x'])(
    'rejects obfuscated loopback URL %s',
    async (value) => {
      const parsed = new URL(value);
      await expect(
        assertAllowedNetworkUrl(value, new Set([parsed.hostname.replace(/^\[|\]$/gu, '')])),
      ).rejects.toThrow(/Local|private/u);
    },
  );
  it('rejects redirects to localhost and too many redirects', async () => {
    const first = new ForgeKiNetworkClient(
      hosts,
      new Transport([{ status: 302, redirectUrl: 'https://localhost/private' }]),
      publicResolver,
    );
    await expect(
      first.fetchMarketplaceIndex('https://catalog.example.test/index'),
    ).rejects.toThrow();
    const looping = new ForgeKiNetworkClient(
      hosts,
      new Transport(
        Array.from({ length: 4 }, () => ({
          status: 302,
          redirectUrl: 'https://catalog.example.test/again',
        })),
      ),
      publicResolver,
    );
    await expect(
      looping.fetchMarketplaceIndex('https://catalog.example.test/index'),
    ).rejects.toThrow(/redirect/u);
  });
  it('rejects oversized responses and invalid content types', async () => {
    const oversized = new ForgeKiNetworkClient(
      hosts,
      new Transport([{ bytes: new Uint8Array(5 * 1024 * 1024 + 1) }]),
      publicResolver,
    );
    await expect(
      oversized.fetchMarketplaceIndex('https://catalog.example.test/index'),
    ).rejects.toThrow(/size/u);
    const wrongType = new ForgeKiNetworkClient(
      hosts,
      new Transport([{ contentType: 'text/html' }]),
      publicResolver,
    );
    await expect(
      wrongType.fetchMarketplaceIndex('https://catalog.example.test/index'),
    ).rejects.toThrow(/content type/u);
  });
  it('stops streaming a response as soon as its byte limit is exceeded', async () => {
    const chunk = new Uint8Array(3 * 1024 * 1024);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(chunk);
                controller.enqueue(chunk);
                controller.close();
              },
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const client = new ForgeKiNetworkClient(hosts, undefined, publicResolver);
    await expect(
      client.fetchMarketplaceIndex('https://catalog.example.test/index'),
    ).rejects.toThrow(/size/u);
  });
  it('aborts requests that exceed the central timeout', async () => {
    vi.useFakeTimers();
    const transport: NetworkTransport = {
      request: (_request, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    };
    const request = new ForgeKiNetworkClient(hosts, transport, publicResolver)
      .fetchMarketplaceIndex('https://catalog.example.test/index')
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(request).resolves.toMatchObject({ message: 'Trusted service request timed out.' });
  });
  it('does not expose a frontend-selected URL as instance state', () => {
    expect(
      Object.keys(new ForgeKiNetworkClient(hosts, new Transport([]), publicResolver)),
    ).not.toContain('url');
  });
});
