# Environment variables

HTTP produces an API URL, database connections produce `DATABASE_URL`, and cache connections produce `REDIS_URL`. Local examples use host ports; Compose examples use service names and container ports.

Generated values are development placeholders. Browser prefixes such as `VITE_` and `NEXT_PUBLIC_` may carry only non-secret values. ForgeKi rejects browser-visible secrets and never reads, persists, prints, or generates real credentials.
