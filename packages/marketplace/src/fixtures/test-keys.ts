/** TEST ONLY — DO NOT USE IN PRODUCTION. These deterministic fixture keys secure no real service. */
export const TEST_ROOT_KEY = {
  id: 'forgeki-test-root-1',
  algorithm: 'Ed25519' as const,
  publicKey: 'MCowBQYDK2VwAyEACv8oVScBcHZB9jnYCyIDFVDIa6hrHds4/0eO3eKfyM0=',
};
export const TEST_ROOT_PRIVATE_KEY =
  'MC4CAQAwBQYDK2VwBCIEIN/rJ/tu+Fw4IULybfF7Lz1av4W/LXR+SjntXrekVX//';
export const TEST_PUBLISHER_PUBLIC_KEY =
  'MCowBQYDK2VwAyEA6FlfUpepVgUgQy7gD7kgvZWQ+jnuSxny02owuuo4wXo=';
export const TEST_PUBLISHER_PRIVATE_KEY =
  'MC4CAQAwBQYDK2VwBCIEIIf3gj4ITlsoHW9AQt0DHKteygll6irANpOdDPCTFYNy';
export const TEST_OTHER_PUBLIC_KEY = 'MCowBQYDK2VwAyEAWHVQu0rHtzCOvNRHz0m95MCnlJJn106yf/cS2UErGNw=';
export const TEST_UPDATE_ROOT = {
  id: 'forgeki-test-update-1',
  algorithm: 'Ed25519' as const,
  publicKey: 'MCowBQYDK2VwAyEAf2jDWtQ4XiUzuIocDZWIVayhQXm/WCrW4Vl8X6JPS8I=',
};
export const TEST_UPDATE_PRIVATE_KEY =
  'MC4CAQAwBQYDK2VwBCIEINIny58SfMmOwuKc4OOJmjQwy0bq4NzWEus0v6fvnYkQ';
