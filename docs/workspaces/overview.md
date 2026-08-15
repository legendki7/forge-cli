# Multi-service workspaces

ForgeKi Workspace Builder models a local monorepo before writing it. A workspace contains typed services, connections, deterministic tooling, and a portable `forgeki.workspace.json` architecture file.

Supported services are Next.js, React/Vite, Express, PostgreSQL, SQLite, Redis, and a shared TypeScript library. Five built-in presets cover common foundations; bounded custom presets stay in Desktop application data.

The visual builder, CLI, scanner, and generator use `@forgecli7/workspaces`. Generation is offline and never installs dependencies, starts services, deploys software, or calls external APIs. Import is evidence-based and can report detected, likely, unknown, or conflicting results.
