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

## Deploy on Vercel

1. **Database.** Create a Postgres database. Neon works well: Vercel → Storage → Neon, or neon.tech. Copy the **pooled** connection string.
2. **Import the repo** in Vercel. The framework (Next.js) and pnpm are detected automatically. `vercel.json` sets the build to `pnpm db:migrate && pnpm build`, so migrations run once per deploy, and adds the daily scheduler.
3. **Environment variables** (Project → Settings → Environment Variables, Production):

   | Variable | Required | Value |
   |---|---|---|
   | `DATABASE_URL` | Yes | Pooled Postgres URL. The deploy fails with a clear message if it's missing. |
   | `BETTER_AUTH_SECRET` | Yes | `openssl rand -base64 32` |
   | `TOKEN_ENCRYPTION_KEY` | Yes | `openssl rand -base64 32` (encrypts OAuth tokens and webhook secrets) |
   | `BETTER_AUTH_URL` | Recommended | `https://your-domain.com`. If unset, the Vercel production domain is used. Hosted blogs and OAuth redirects use this origin. |
   | `CRON_SECRET` | Recommended | Any long random string. Vercel Cron sends it automatically to `/api/cron`. |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Search Console / GA4 | See `.env.example` for the two redirect URIs to register. |
   | `ANTHROPIC_API_KEY` | For agents | Usage is capped per agent. |

4. **Deploy**, then open the site, sign up and create your workspace.
5. **Previews:** give Preview deployments their own `DATABASE_URL` (for example a Neon branch), or leave it unset for Preview. Otherwise a preview build would migrate your production database.
6. **Scheduler timing:** the Hobby plan runs `/api/cron` once a day (06:00 UTC). For on-time scheduled posts, use Pro with an hourly cron, or call `/api/cron` from any external cron with `Authorization: Bearer $CRON_SECRET`.

## Other hosts

1. Create a Postgres database and set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `TOKEN_ENCRYPTION_KEY`.
2. `pnpm db:migrate`, then `pnpm build && pnpm start`.

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
