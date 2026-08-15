# Workspace architecture model

`ForgeWorkspace` is a versioned, closed model. Services have a safe ID/name, type, implementation, derived relative path, optional port, components, environment metadata, and Docker choice. Limits are 20 services, 40 connections, and 10 shared packages.

Applications live in `apps/`, shared libraries in `packages/`, and data/infrastructure declarations in `infrastructure/`. Names reject separators, traversal, control characters, and Windows reserved names.

Ports are stable in service-ID order. Defaults are Next.js 3000, Vite 5173, Express 4000, PostgreSQL 5432, and Redis 6379; collisions use the next available port. Overrides must be integer ports from 1024 through 65535.
