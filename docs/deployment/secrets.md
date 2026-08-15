# Secret boundary

ForgeKi stores schemas, never secret values. A secret variable is displayed only by name, owner, applicability, and required state. Users configure its value later in their chosen platform.

Any variable where `secret` and `browserVisible` are both true is blocking. Secret names using `NEXT_PUBLIC_`, `VITE_`, or `PUBLIC_` are also blocking. This check is shared by CLI and Desktop.

Environment examples leave secret assignments blank. Compose uses required environment references. Kubernetes uses `secretKeyRef` guidance without creating Secret data. CLI previews never echo values found in local example files.
