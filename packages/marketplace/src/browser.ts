export {
  MARKETPLACE_LIMITS,
  MARKETPLACE_SCHEMA_VERSION,
  type ApplicationUpdateCheck,
  type MarketplaceFreshness,
  type MarketplacePluginEntry,
  type MarketplaceStatus,
  type PublisherStatus,
  type SignatureStatus,
  type UpdateChannel,
} from './model.js';
export type { MarketplaceSearchOptions, PluginInstallReview, RemotePluginView } from './service.js';

export const MARKETPLACE_TRUST_EXPLANATION =
  'Community plugins are declarative and cannot execute arbitrary code, run shell commands, or access ForgeKi network APIs.';
export const PRODUCTION_MARKETPLACE_CONFIGURED = false;
export const PRODUCTION_UPDATE_PROVIDER_CONFIGURED = false;
