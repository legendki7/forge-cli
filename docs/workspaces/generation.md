# Workspace generation

ForgeKi creates a review plan containing file ownership, services, ports, environment, Docker services, CI, and warnings. The backend reparses the closed model and recomputes the trusted plan; creation is refused if it differs from the reviewed plan.

Files are exclusively written to a temporary sibling directory and atomically renamed after success. Existing destinations are never overwritten. Output includes root workspace scripts, service/shared packages, `.env.example` files, `forgeki.workspace.json`, a README, and selected Docker/CI assets. ForgeKi does not install packages or start generated software.
