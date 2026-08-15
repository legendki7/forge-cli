# Deployment targets

Targets generate files only.

| Architecture       | Docker Compose | Generic Docker | Kubernetes     | Static Export                           | Node Server |
| ------------------ | -------------- | -------------- | -------------- | --------------------------------------- | ----------- |
| Next.js server     | Workspace only | Yes            | Yes            | Only with explicit static compatibility | Yes         |
| React/Vite         | Workspace only | Yes            | Yes            | Yes                                     | No          |
| Express            | Workspace only | Yes            | Yes            | No                                      | Yes         |
| PostgreSQL / Redis | Yes            | No             | Reference only | No                                      | No          |

`forge deployment targets [directory]` reports the compatible subset. ForgeKi does not silently force Next.js static export and never presents a database as a Node Server.

Built-in presets are Local Docker, Staging Docker, Production Docker, Kubernetes Starter, Static Frontend, and Node Server. Only compatible targets are shown in Desktop.
