# Flotilla

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

## Signing in

- **Administrator:** set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME` in the environment. The account is created on first start if missing and made an owner of every project. Its role can't be changed or removed by other members. In production an existing password is never overwritten unless `ADMIN_RESET_PASSWORD=1` is set for one deploy. Local development uses the documented defaults in [src/server/auth/admin.ts](src/server/auth/admin.ts).
- **Everyone else:** sign-up is by invitation only. **Invite member** (top bar) or **Team** → Create invite gives a one-time link; only the invited email can create an account with it.
- **No setup step:** after signing in you land directly in a project (created automatically as "<first name>'s project", renamable in Settings). Use **Add project** in the top bar to create another top-level project. Switching projects in the top bar keeps you on the same page — inbox, work, integrations, automations and every other feature belong to the selected project. Products inside a project are listed under **Products**.

## Deploy on Vercel

1. **Database.** Create a Postgres database. Neon works well: Vercel → Storage → Neon, or neon.tech. Copy the **pooled** connection string.
2. **Import the repo** in Vercel. The framework (Next.js) and pnpm are detected automatically. `vercel.json` sets the build to `pnpm db:migrate && pnpm build`, so migrations run once per deploy, and adds the daily scheduler.
3. **Environment variables** (Project → Settings → Environment Variables, Production). The full list is in [Environment variables](#environment-variables) below.
4. **Deploy**, then open the site and sign in as the administrator. Your workspace is created automatically.
5. **Previews:** give Preview deployments their own `DATABASE_URL` (for example a Neon branch), or leave it unset for Preview. Otherwise a preview build would migrate your production database.
6. **Scheduler timing:** the Hobby plan runs `/api/cron` once a day (06:00 UTC). For on-time scheduled posts, use Pro with an hourly cron, or call `/api/cron` from any external cron with `Authorization: Bearer $CRON_SECRET`.

## Environment variables

Every variable the app reads. Nothing else is needed: the Vercel connection uses a token you paste in the app, not an env var.

| Variable | Local (`.env.local`) | Production (Vercel) | What it is and where to get it |
|---|---|---|---|
| `DATABASE_URL` | Leave empty (embedded database in `.data/`) | **Required** | Postgres connection string. Neon: Vercel → Storage → Neon, or neon.tech → Connection details → **Pooled** connection. The deploy stops with a clear message if it's missing. Migrations are applied by the build command. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Optional (dev defaults) | **Required** | Built-in administrator credentials. If the email or password is missing in production, no administrator account is created. |
| `BETTER_AUTH_SECRET` | Any value | **Required** | Signs sign-in sessions. `openssl rand -base64 32`. Changing it signs everyone out. |
| `TOKEN_ENCRYPTION_KEY` | Optional | **Required** | Encrypts the Google and Vercel tokens and webhook secrets in the database. Exactly 32 random bytes, base64: `openssl rand -base64 32`. **Never change it after connecting integrations**: stored tokens become unreadable and must be reconnected. |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Recommended | The app's public `https://` address. Used for sign-in, invite links, Google redirect URIs, the Vercel webhook URL and hosted blog links. If unset on Vercel, the production domain is used. |
| `CRON_SECRET` | Optional | Recommended | Any long random string. Vercel Cron sends it to `/api/cron` automatically. Without it the scheduler (syncs, uptime, scheduled posts, automations) doesn't run. |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | For Google | For Google | One OAuth client for Search Console and Analytics 4. Google Cloud Console → enable *Google Search Console API*, *Google Analytics Data API* and *Google Analytics Admin API* → Credentials → OAuth client ID (Web application). Add both redirect URIs: `<BETTER_AUTH_URL>/api/integrations/google_search_console/callback` and `<BETTER_AUTH_URL>/api/integrations/google_analytics/callback`. |
| `ANTHROPIC_API_KEY` | For agents | For agents | console.anthropic.com → API keys. Usage is billed to that account and capped per agent. |
| `AGENT_MODEL` | Optional | Optional | Model override for agents. Default `claude-opus-5-5`. |

Vercel sets `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL` itself; don't add them.

After changing a variable on Vercel, redeploy (Deployments → ⋯ → Redeploy) so it takes effect.

## Vercel deployments

See every product's Vercel deployments (live, building or failed, with branch, commit and build logs) on its Overview page.

1. In Vercel, open [Account Settings → Tokens](https://vercel.com/account/settings/tokens) → **Create Token**. Name it "Flotilla", set **Scope** to the team that owns your projects (or Full Account for a personal account), pick an expiration, and copy the token.
2. In Flotilla, open **Integrations → Vercel → Connect** and paste it. Flotilla checks the token, then lists every project it can see.
3. Pick the product for each project. Flotilla syncs its deployments straight away and, if the product has no Domain or Repository link yet, adds them from Vercel. Uptime checks and the site audit then work with no extra setup.

From then on:

- Opening a product refreshes its deployments if they're more than 2 minutes old. **Sync now** and every scheduler run refresh them too.
- A failed production deploy shows on the product, in the portfolio's **Needs attention**, and (with the **Production deploy failed → alert** automation switched on in Automations) in the owner's inbox, once per deployment.
- **Instant updates (optional, Vercel Pro or Enterprise):** Integrations → Vercel → *Instant updates (webhook)* shows the endpoint URL. In Vercel → Team Settings → Webhooks, create a webhook for the Deployment Created, Succeeded, Error, Cancelled and Promoted events with that URL, then paste the secret Vercel shows into Flotilla.
- When the token expires, the connection shows **Reconnect needed**: create a new token and use *Paste a new token*. Your project links are kept.
- **Disconnect** deletes the token from Flotilla. Also delete it in Vercel, since it may be used elsewhere.

## Connecting each Next.js site

For each product whose site is a Next.js app on Vercel:

1. **Deployments, domain and repository:** link its Vercel project (above).
2. **Search Console:** verify the domain in Google Search Console. A Domain property verifies by DNS. A URL-prefix property can use the HTML tag: in the site's root layout, `export const metadata = { verification: { google: "<token>" } }`. Then connect Search Console in Integrations and map the property to the product.
3. **Analytics 4:** add GA4 to the site, for example `<GoogleAnalytics gaId="G-XXXXXXX" />` from `@next/third-parties/google` in the root layout. Then connect Analytics in Integrations and map the property.
4. **Blog posts (optional):** either switch on the hosted blog (product → Content → Publishing), or deliver posts to the site by webhook. The receiving route handler is in [new-features.md §1.2](new-features.md#12-publishing-destinations-core-shipped). Add `FLOTILLA_SECRET` (the channel's signing secret) to that site's Vercel environment variables.

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
