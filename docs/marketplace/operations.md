# Marketplace Operations

The verified cache is written atomically only after complete signature/schema verification. Invalid
remote data never replaces a good cache. Refreshes are coalesced; automatic checks are limited to a
24-hour policy in the product model rather than continuous polling.

Downloads enter a random quarantine directory, are never executed or opened externally, and are
deleted after success or failure. On backend startup and before each download, ForgeKi removes stale
randomly named quarantine entries older than 24 hours while leaving unrelated paths untouched.
Maintainers can run `pnpm marketplace:validate`,
`pnpm marketplace:build`, and `pnpm marketplace:verify`. `pnpm marketplace:sign -- --type <type>
--input <document> --output <new-file> --key-id <id> --private-key-file <explicit-path>` signs one
strictly validated document. The key file must contain a base64-encoded PKCS#8 Ed25519 private key.
Production signing material must always be provided through that explicit path; tooling never creates,
discovers, searches for, or prints it, and refuses to overwrite the output file.
