# Secure Updates

ForgeKi implements signed update metadata, Stable/Beta channels, user-visible checks, and artifact
digest/signature verification. The production update provider is currently **not configured**, so the
application truthfully displays “Update service not configured.” Checks do not download automatically,
and Phase 6 never silently installs an update or self-updates the CLI.
