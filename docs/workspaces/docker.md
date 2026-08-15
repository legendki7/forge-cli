# Docker Compose workspaces

When enabled, ForgeKi generates application Dockerfiles and root Compose configuration. PostgreSQL uses `postgres:17-alpine`; Redis uses `redis:7-alpine`. Health checks, application dependencies, and a PostgreSQL volume are included. SQLite remains file-based.

Images and commands are trusted templates, never user-supplied commands. ForgeKi does not invoke Docker, pull images, start containers, or implement deployment.

Redis is a trusted workspace implementation. The Phase 3 bundled Redis plugin remains an isolated single-stack example and is not loaded into this catalog, avoiding duplicate identity and new plugin privileges.
