# Environments

Environment schemas and values are separate. ForgeKi models names, descriptions, owners, required/optional state, secret/public boundaries, profile applicability, and safe non-secret examples. It does not request or persist production secrets.

Every variable has one owner such as `service:web`, `service:api`, `database:postgres`, `infrastructure:cache`, or `workspace`. Duplicate identities and conflicting owners are blocked.

Generated files are safe examples only: `.env.example`, `.env.local.example`, `.env.staging.example`, `.env.production.example`, and per-service examples such as `apps/api/.env.production.example`. Multi-service root files act as indexes when values belong in service files. ForgeKi never generates a real `.env`; secret assignments are blank.

The Desktop Environments page provides profile cards, an ownership matrix, Public/Secret and Required/Optional badges, workspace topology, profile comparison, and drift state. It never displays secret values.
