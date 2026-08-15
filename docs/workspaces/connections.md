# Service connections

- Web to API: `HTTP`
- Express or server-capable Next.js to PostgreSQL/SQLite: `DATABASE`
- Express or server-capable Next.js to Redis: `CACHE`
- Web or API to a shared library: `SHARED_PACKAGE`

React/Vite cannot connect directly to a database or Redis. Duplicate, self, missing-endpoint, and unsupported connections fail validation. Removing a service removes its connections after confirmation.
