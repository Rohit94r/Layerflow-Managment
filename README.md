# LayerFlow OS

The operating system for founders and early developers who run more than one product: every product, task, decision, cost and integration in one workspace, with a clear next action.

- Vision and requirements: [product-os-master-prompt-v3.md](product-os-master-prompt-v3.md)
- New features (growth engine, content, agents, mobile) and what's next: [new-features.md](new-features.md)
- Architecture, stages and decisions: [BUILD.md](BUILD.md)

## Run it locally

Requirements: Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm dev                      # http://localhost:3000
```

With `DATABASE_URL` empty, an embedded Postgres (PGlite) is created in `.data/` and migrated on startup — no database to install.

## Production

1. Create a Postgres database (Neon recommended) and set `DATABASE_URL`.
2. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (your public URL).
3. `pnpm db:migrate`, then `pnpm build && pnpm start` (or deploy to Vercel).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm test` | Service tests on an in-memory Postgres (tenant isolation, permissions, domain rules) |
| `pnpm lint` / `pnpm typecheck` | ESLint (incl. module boundaries) and TypeScript |
| `pnpm db:generate` | Generate a migration after changing a `schema.ts` |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |

## Layout

```text
src/app/          routes (pages, server actions entry, API route handlers)
src/modules/<m>/  schema.ts · service.ts (business rules + permission checks) · actions.ts · constants.ts
src/server/       db, auth, permissions, request context
src/components/   design system and screens
src/test/         tenant-isolation, permission and domain tests
drizzle/          SQL migrations
```
