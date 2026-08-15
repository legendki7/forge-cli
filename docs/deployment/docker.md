# Docker configuration

Docker Compose generation uses deterministic names, trusted images (`postgres:17-alpine`, `redis:7-alpine`), named volumes, health checks, environment references, and conservative restart policies. Staging and Production use separate compose files.

Generic Docker uses trusted Node Alpine definitions, multi-stage builds, explicit work directories, a non-root runtime user, target-specific ports, and server health checks where supported.

ForgeKi does not accept arbitrary images from project configuration, emit privileged containers, add arbitrary host mounts, build images, run Compose, or push to a registry. These files are starter configuration, not universal production hardening.
