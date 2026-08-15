# Kubernetes configuration

ForgeKi generates deterministic starter `Deployment`, `Service`, `ConfigMap`, and `PersistentVolumeClaim` documents. Application secrets use `secretKeyRef` placeholders; no Kubernetes `Secret` data is generated.

Names must be DNS-compatible and at most 63 characters. Application replicas are bounded from 1 through 20, defaulting to one for Staging and two for Production. CPU/memory requests and limits use a closed syntax. Beginner mode uses conservative defaults; Advanced mode displays exact resources and hashes.

PostgreSQL and Redis manifests are development/reference configurations. Managed production services may be preferable. ForgeKi does not add Helm, run `kubectl`, require a cluster, or claim cluster reachability.
