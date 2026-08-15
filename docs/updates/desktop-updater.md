# Desktop Updater

The provider abstraction is ready to feed a future official Tauri 2 updater integration. Phase 6
stops at verified pre-install state because no official endpoint, production updater public key, or
signed release artifact exists. A real integration must use the maintained Tauri updater for
download/install/restart, retain explicit confirmation, and never implement custom executable replacement.

The test provider exercises signed Stable/Beta metadata, explicit download confirmation, artifact
size/digest/signature verification, cancellation, and download failure. It never replaces an installed
ForgeKi executable.
