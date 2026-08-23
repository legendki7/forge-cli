# ForgeKi Arabic terminology

This glossary keeps ForgeKi Desktop's Modern Standard Arabic consistent. It applies to the Desktop
interface and documentation. The `forge` CLI is intentionally outside the localization scope for
this release and continues to emit English output.

## Product and technical terms

Product names, standards, package names, commands, framework names, and stable identifiers remain
in their canonical form. Examples include ForgeKi, ForgeKi Desktop, Next.js, React, Vite, Express,
Node.js, TypeScript, JavaScript, pnpm, npm, Yarn, Bun, Git, GitHub Actions, Docker, Docker Compose,
Kubernetes, PostgreSQL, SQLite, Prisma, Drizzle, Tailwind CSS, Vitest, Playwright, JSON, YAML, API,
URL, CLI, MSI, and NSIS.

Paths, versions, ports, URLs, hashes, commands, code, package names, and identifiers use the shared
`technical-value` treatment: left-to-right direction, bidi isolation, and no translated content.

## Preferred Arabic UI terms

| English           | Arabic           |
| ----------------- | ---------------- |
| Home              | الرئيسية         |
| Workspace         | مساحة العمل      |
| Workspace Builder | منشئ مساحة العمل |
| Stack Builder     | منشئ الحزمة      |
| Settings          | الإعدادات        |
| Marketplace       | السوق            |
| Deployment        | النشر            |
| Environment       | البيئة           |
| Security          | الأمان           |
| Plugin            | إضافة            |
| Template          | قالب             |
| Preset            | إعداد مسبق       |
| Validation        | تحقق             |
| Trust             | ثقة              |
| Integrity         | تكامل            |
| Scan              | فحص              |
| Generate          | إنشاء            |

Use direct, concise verbs for actions and neutral factual language for security, warnings, and
errors. Do not translate stable backend values, persisted IDs, telemetry-free diagnostics fields,
or search keywords. Search continues to match canonical technical names in both interface languages.

## Engineering checks

English is the fallback catalog. TypeScript enforces key parity, and tests verify parity, non-empty
translations, language migration, persistence, immediate switching, root direction, and technical
value isolation. A visible-string audit compares Desktop TSX literals with catalog entries; any
intentional canonical technical term must be documented here rather than translated ad hoc.
