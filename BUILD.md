# BUILD.md — How We Build Product OS

**Status:** Build plan v1 (13 November 2026)
**Source of vision:** [product-os-master-prompt-v3.md](product-os-master-prompt-v3.md). That file says *what* and *why*. This file says *how*, *in what order*, and *where the code goes*.
**Repository:** https://github.com/Rohit94r/Layerflow-Managment

If the two files disagree, the master prompt wins on product intent and this file wins on implementation detail. Any change to a decision here gets a row in [section 14](#14-decision-log).

---

## 1. What we are building

A **product portfolio operating system** for founders and early developers who run many products and have no single place to manage them.

One person may own a SaaS app, two side projects, a client site, and an API. Today that is spread across GitHub, Vercel, Stripe, Search Console, Notion, and a spreadsheet. Product OS gives them:

1. **A portfolio command center** — every product on one screen: stage, priority, health, what changed, what needs attention.
2. **A workspace per product** — strategy, tasks, docs, analytics, SEO, costs, deployments, in one place.
3. **Connected data** — integrations pull real numbers from the tools they already use, always labelled with source and freshness.
4. **Controlled automation and AI agents** — workflows and agents that do work, with an owner, permissions, approvals, cost tracking, and a stop button.

The rule that shapes everything: **information must lead to a next action.** A chart with no decision attached does not ship.

### What we are not building first

Not a Jira, Notion, Stripe, or analytics replacement. Not every integration. Not an unrestricted autonomous agent. The full non-goal list is in section 31 of the master prompt.

---

## 2. Current state of the repository

| Item | State (13 Nov 2026) |
|---|---|
| Stages shipped | Stage 0 (scaffold) and Stage 1 (core foundation) complete. Stage 2 (work and knowledge) and a first slice of Stage 5 (costs, renewals, manual revenue) shipped early because they make the portfolio usable day to day. |
| Stack | Next.js 16, React 19, TypeScript, Tailwind 4, Drizzle 0.45, Better Auth 1.7, Zod 4. See §3 for deviations from the original plan. |
| Database | Embedded PGlite (real Postgres in WASM) when `DATABASE_URL` is empty; any Postgres/Neon URL in staging and production. Same migrations for both. |
| Design | Finalised from the supplied "Corniche" reference: cream paper, cobalt ink, navy serif type. See §9. |
| Product name | Working name **LayerFlow OS**, set in one place: `src/lib/brand.ts`. |
| Quality gates | `pnpm lint`, `pnpm typecheck`, `pnpm test` (19 tests: tenant isolation, permissions, domain rules), `pnpm build`. All passing. |

### What works today

- Email and password sign-up and sign-in, sessions, sign-out.
- Workspaces: create, switch, rename, change address, timezone and currency, delete with typed confirmation.
- Members: invite by single-use link (7-day expiry, bound to the invited email), seven roles, change role, remove, leave. The last owner is protected.
- Product registry: create, edit, archive, restore, delete (archive first), pin, groups, parent/child products, links, tech stack, tags, review dates.
- Five independent classification fields (role, stage, priority, focus, health with reason), editable inline from the table and product page, plus bulk edit.
- Portfolio views: table (desktop) and cards, filters for every dimension, search, sorting, an archived view, and shareable URL state.
- Command center: setup checklist, key counts, lifecycle pipeline, rule-based "needs attention" list, products in focus, my work, upcoming renewals, decisions to revisit, recent activity.
- Work: tasks and bugs with per-workspace numbers (#1, #2…), a drag-and-drop board, a list with inline edits, filters, task detail with Markdown, comments and history.
- Docs and decisions: PRD, decision, runbook, meeting and research templates, Markdown, status, revisit dates, per-product docs.
- Finance: costs and subscriptions per product, monthly run-rate per currency (never silently converted), renewal tracking with "mark renewed", estimates flagged, manual revenue clearly labelled, and "Not recorded" shown instead of zero.
- Audit log of every change, with actor and field-level diff; workspace and per-product activity feeds.
- Command palette (Ctrl/Cmd+K) with permission-aware search across products, tasks and docs.
- Full JSON export of a workspace.
- Light, dark and system themes; responsive down to phone width; keyboard accessible.

---

## 3. Tech stack

One choice per concern. Versions are pinned to the latest stable release at scaffold time and recorded in `package.json`.

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, strict mode | One language across UI, API, jobs. |
| Framework | Next.js (App Router) + React | Server components, route handlers, one deploy target. |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) | Accessible components we own and can restyle to the template. |
| API | tRPC for the app, REST route handlers for webhooks and OAuth callbacks | End-to-end types inside the app; plain HTTP where providers call us. |
| Validation | Zod | Same schema validates forms, API input, and provider payloads. |
| Database | PostgreSQL on Neon | Managed, branching for previews, pooled connections. |
| ORM | Drizzle | SQL-shaped, typed, migrations in the repo. |
| Auth | Better Auth | Sessions, OAuth sign-in, organizations; data stays in our database. |
| Background jobs | Inngest | Durable steps, retries, schedules, concurrency keys per tenant, no queue server to run. |
| File storage | S3-compatible (Cloudflare R2) | Signed URLs, no egress fees. |
| Email | Resend + React Email | Transactional mail and digests. |
| AI | Vercel AI SDK as the model gateway, Claude as default model | Provider-agnostic calls, tool use, streaming. |
| Search | PostgreSQL full-text search | Good enough until proven otherwise. |
| Errors and logs | Sentry + structured JSON logs | Correlation ID on every request, job, and agent run. |
| Tests | Vitest (unit, integration), Playwright (end to end) | |
| Package manager | pnpm | |
| Hosting | Vercel (app) + Neon (database) + Inngest Cloud (jobs) | |

**Deliberately left out for now:** Redis, a vector database, microservices, a separate backend service, Kubernetes. Each is added only when a measured problem requires it.

### 3.1 What changed during the first build

| Planned | Built | Why |
|---|---|---|
| tRPC | Next.js server actions plus two REST route handlers (search, export) | Same end-to-end types with less code; every action still goes through a typed, permission-checked service. Revisit if a public API is needed. |
| Neon for every environment | PGlite locally, Postgres/Neon via `DATABASE_URL` elsewhere | Zero-setup local development and fast in-memory tests on a real Postgres engine. |
| Inngest from Stage 0 | Not added yet | No background work exists until integrations (Stage 3). Added with the first sync job. |
| Full-text search | `ILIKE` search, permission-aware | Enough for current data volumes; full-text indexes are added when search quality or speed demands it. |
| Row-level security in Stage 1 | Service-layer scoping plus cross-tenant tests; RLS not yet enabled | Every query is scoped by `workspace_id` and tested. RLS is the next hardening step before outside users are onboarded. |
| shadcn/ui | Hand-built components on design tokens | Smaller surface, matched to the Corniche style. |

---

## 4. Architecture

A **modular monolith**: one deployable application, split inside into modules with hard boundaries. This is the fastest way for a small team to ship and the easiest shape to split later.

```text
Browser
  │
Next.js app ── UI (server + client components)
  │
Auth + workspace context      every request resolves: user, workspace, role
  │
tRPC routers                  thin: validate input, check permission, call a service
  │
Domain modules                business rules; the only code that touches the database
  │         │
  │         └── Domain events ──► Outbox table ──► Inngest
  │                                                   │
PostgreSQL + object storage                   Background functions
                                                 ├─ provider sync
                                                 ├─ SEO crawl and reports
                                                 ├─ workflow execution
                                                 ├─ agent runtime
                                                 └─ notifications
                                                      │
                                              Provider adapters ──► external APIs
```

### 4.1 Two planes

- **Control plane** — configuration, permissions, billing, agent and workflow definitions. Runs in request handlers. Must be fast.
- **Execution plane** — syncs, crawls, workflow runs, agent runs. Runs only in background functions. A request handler never calls a provider for periodic data and never runs a long job.

### 4.2 Module rules

Each module in `src/modules/<name>` owns its tables, its business rules, and its public interface.

1. A module exports its public functions from `index.ts`. Other modules import only from there.
2. A module never queries another module's tables. It calls that module's service.
3. Modules communicate about things that happened through domain events (`product.created`, `sync.completed`), not direct calls into each other's internals.
4. Provider code lives only in `src/integrations/providers/<provider>`. No `fetch` to an external API anywhere else.
5. UI components never import the database client.

These rules are enforced by ESLint import boundaries, not by convention.

### 4.3 Multi-tenancy

The workspace is the tenant. This is the most important security property in the system.

- Every tenant-owned table has a non-null `workspace_id` with an index.
- Services receive a `ctx` object (`userId`, `workspaceId`, `role`) and filter every query by `workspace_id`. Every id a user submits (owner, assignee, product, parent, group) is checked to belong to the same workspace before it is stored. UI code is lint-blocked from importing the database client.
- PostgreSQL row-level security on tenant tables is the planned second layer (not yet enabled; see §3.1).
- Jobs, webhooks, and agent tool calls carry `workspaceId` and re-check permission at execution time. A job is never trusted because it was queued by an authorized user.
- An automated test suite attempts cross-workspace reads and writes on every router and must fail to access anything.

### 4.4 Permissions

Roles: Owner, Admin, Manager, Member, Viewer, Guest, Billing Manager. Permissions are named capabilities (`product.edit`, `finance.view`, `members.manage`, `data.export`). Roles map to capability sets in one file, `src/server/permissions/index.ts`. Every service function calls `assertCan(ctx, capability)` before doing anything, so a check can't be bypassed by calling a different page or action.

### 4.5 Data honesty

Every stored external metric carries `source`, `period`, `fetched_at`, `timezone`, and `coverage`. The UI treats `0`, `unknown`, `not connected`, `not authorized`, `stale`, `partial`, and `failed` as seven different states with seven different renderings. A shared `<DataState>` component enforces this so no screen invents its own.

---

## 5. Folder structure

```text
.
├── BUILD.md
├── product-os-master-prompt-v3.md
├── docs/
│   ├── adr/                      decision records (template: master prompt §33)
│   ├── specs/                    feature specs, one per slice (template: §34)
│   └── runbooks/
├── drizzle/                      generated SQL migrations
├── public/
├── e2e/                          Playwright tests
├── src/
│   ├── app/                      routes only; no business logic
│   │   ├── (marketing)/          landing, pricing
│   │   ├── (auth)/               sign in, sign up, invite accept
│   │   ├── (app)/
│   │   │   └── [workspaceSlug]/
│   │   │       ├── page.tsx              command center
│   │   │       ├── portfolio/
│   │   │       ├── products/[productSlug]/
│   │   │       │   ├── page.tsx          overview
│   │   │       │   ├── work/
│   │   │       │   ├── knowledge/
│   │   │       │   ├── seo/
│   │   │       │   ├── finance/
│   │   │       │   ├── agents/
│   │   │       │   └── settings/
│   │   │       ├── work/
│   │   │       ├── inbox/
│   │   │       ├── integrations/
│   │   │       ├── automations/
│   │   │       ├── agents/
│   │   │       ├── finance/
│   │   │       └── settings/
│   │   └── api/
│   │       ├── trpc/[trpc]/
│   │       ├── auth/[...all]/
│   │       ├── inngest/
│   │       ├── oauth/[provider]/callback/
│   │       └── webhooks/[provider]/
│   ├── modules/                  domain logic, one folder per domain
│   │   ├── identity/             users, workspaces, members, roles, invitations
│   │   ├── portfolio/            products, classification, groups, health
│   │   ├── work/                 projects, tasks, bugs, comments, labels
│   │   ├── knowledge/            documents, versions, decisions
│   │   ├── planning/             goals, roadmap items, ideas
│   │   ├── integrations/         connections, resources, mappings, sync runs
│   │   ├── seo/
│   │   ├── analytics/            metric definitions and snapshots
│   │   ├── finance/              vendors, expenses, budgets, renewals
│   │   ├── automation/           workflows, runs, approvals
│   │   ├── agents/               catalog, instances, runs, tools, memory
│   │   ├── notifications/        inbox items, preferences, delivery
│   │   ├── audit/                audit events and activity timeline
│   │   └── billing/              plans, entitlements, usage
│   │       each module contains:
│   │         schema.ts           Drizzle tables
│   │         service.ts          business rules
│   │         router.ts           tRPC procedures
│   │         events.ts           events emitted and handled
│   │         validators.ts       Zod schemas
│   │         index.ts            public interface
│   │         *.test.ts
│   ├── integrations/
│   │   ├── core/                 adapter interface, OAuth and token manager,
│   │   │                         rate limiter, normalized errors, webhook verify
│   │   └── providers/
│   │       ├── github/
│   │       ├── google-search-console/
│   │       ├── vercel/
│   │       └── stripe/
│   ├── jobs/                     Inngest functions, grouped by module
│   ├── ai/
│   │   ├── gateway.ts            single entry point for model calls
│   │   ├── tools/                permissioned agent tools
│   │   └── agents/               first-party agent definitions
│   ├── server/
│   │   ├── db/                   client, scoped query helper, RLS setup
│   │   ├── trpc/                 context, middleware, root router
│   │   ├── auth/                 Better Auth config
│   │   ├── permissions/          capabilities and role map
│   │   ├── events/               event bus and outbox
│   │   └── crypto/               token encryption
│   ├── components/
│   │   ├── ui/                   shadcn primitives
│   │   ├── layout/               app shell, sidebar, command palette
│   │   └── shared/               DataState, EmptyState, StatusBadge, tables
│   ├── features/                 screen-level UI, mirrors modules
│   ├── lib/                      pure utilities
│   ├── styles/                   tokens and globals
│   └── env.ts                    validated environment variables
└── .github/workflows/            lint, typecheck, test, migration check
```

**Why one app and not a monorepo:** with one or two developers, package boundaries cost more than they return. The module rules in 4.2 give the same isolation. When a second deployable is needed (for example a dedicated agent worker), `src/modules` and `src/integrations` move into `packages/` unchanged.

---

## 6. Data model

Schema grows one slice at a time. No migration creates tables for a stage that has not started.

**Conventions for every tenant table**

- `id` — UUID v7 (time-sortable).
- `workspace_id` — not null, foreign key, indexed.
- `created_at`, `updated_at`, `created_by`.
- `archived_at` for soft archive; hard deletion runs through a deletion job that also cleans files and provider tokens.
- Query-critical fields are typed columns. JSON is for display-only extras, never for secrets or filters.
- Enumerations that users will customize (statuses, labels) are tables, not database enums.

**Stage 1 tables**

| Table | Purpose |
|---|---|
| `user`, `session`, `account` | Managed by Better Auth. |
| `workspace` | Name, slug, timezone, locale, default currency. |
| `workspace_member` | User, workspace, role. |
| `invitation` | Email, role, token hash, expiry, status. |
| `product` | Registry fields from master prompt §4.1. |
| `product_domain` | Domains and URLs per product. |
| `product_group`, `product_tag` | Organization. |
| `product_relationship` | Parent, child, related. |
| `audit_event` | Actor, actor type (human, system, integration, agent), action, target, before and after, correlation ID. |

Product classification is five independent columns: `role`, `lifecycle`, `priority`, `focus`, `health`. They are never merged into one status. Health additionally stores `health_reason` and `health_source` (`computed` or `manual`).

Later stages add tables as listed in master prompt §22.

---

## 7. Integrations

Every provider implements one interface so the rest of the system never knows which provider it is talking to.

```ts
interface ProviderAdapter {
  id: string
  scopes: ScopeDescription[]              // shown to the user before authorizing
  authorize(ctx): AuthorizationUrl
  exchange(code, state): Tokens
  refresh(tokens): Tokens
  discoverResources(conn): Resource[]     // repos, sites, projects
  sync(conn, mapping, cursor): SyncResult // incremental, paginated
  verifyWebhook?(request): WebhookEvent
  revoke(conn): void
}
```

- Tokens are encrypted at rest with a key from the environment and are never sent to the browser or a model.
- OAuth uses a signed `state`, PKCE where supported, and a redirect allowlist.
- Each sync writes a `sync_run` row: started, finished, status, records, error, cursor. This row is what powers freshness labels.
- External resources are mapped to a product explicitly by the user. Nothing is auto-attributed.
- Rate limiting and backoff are handled in `integrations/core`, with Inngest concurrency keyed by connection.
- Webhooks are verified by signature and timestamp, deduplicated by delivery ID, then handed to a job.
- Disconnect revokes at the provider, deletes tokens, and states what synced data is kept or removed.

**Provider order:** GitHub, then Google Search Console, then Vercel, then Stripe. One is finished and used before the next begins.

---

## 8. Automation and agents

Built late (Stages 6 and 7), but the foundations go in early so they do not need a rewrite.

**Foundations present from Stage 1**

- Domain events for every meaningful change. These become workflow triggers later.
- `actor_type` on audit events, so agent activity is distinguishable from human activity from day one.
- Capability-based permissions, so an agent can be granted a narrow set of capabilities exactly like a role.

**Workflow engine (Stage 6)**

`Trigger → Conditions → Steps → Approval → Execution → Result → Audit`. Each workflow run is one Inngest function run. Steps are a fixed catalog of typed actions; there is no arbitrary user code. Every workflow has dry run, versioning, a pause control, and a workspace-level kill switch.

**Agent runtime (Stage 7)**

- An agent is a definition (instructions, tool list, output schema) plus an instance (workspace, product scope, owner, budget, schedule).
- A run moves through `queued → running → waiting_for_tool → waiting_for_approval → retrying → succeeded | failed | cancelled | timed_out`. Every transition is stored and streamed to the UI.
- Tools are functions in `src/ai/tools`. Each one checks the instance's permissions when it executes, records inputs and outputs with redaction, and records cost.
- Any tool marked external, financial, destructive, or customer-visible creates an approval record and pauses the run until a human decides.
- Content fetched from the web, documents, or tickets is passed to the model as untrusted data, never as instructions.
- Each instance has a budget cap. Reaching it pauses the agent and raises an alert.
- The UI shows action summaries and evidence, not model reasoning.

---

## 9. Design system

> **Provisional.** The design template was not attached to the request. Everything below is a working default so engineering is not blocked. When the template arrives, its colors, type, radius, and component style replace these tokens in `src/styles/tokens.css`, and this section is updated. Components read only from tokens, so the swap does not touch feature code.

**Character:** a calm, professional command center. Dense with information, quiet in appearance. Not an admin template.

**Principles**

1. One primary action per screen, always visible.
2. Color carries meaning (status, severity), never decoration.
3. Tables and lists before cards. Cards only for genuinely separate objects.
4. No chart without a decision next to it.
5. Every screen has designed states for loading, empty, error, stale, partial, disconnected, and permission denied.
6. Everything works by keyboard. Command palette on `Ctrl/Cmd + K`.

**Provisional tokens**

| Token | Light | Dark |
|---|---|---|
| Background | `#FFFFFF` | `#0B0C0E` |
| Surface | `#F7F7F8` | `#141518` |
| Border | `#E4E4E7` | `#26272B` |
| Text | `#18181B` | `#F4F4F5` |
| Muted text | `#71717A` | `#A1A1AA` |
| Accent | `#4F46E5` | `#818CF8` |
| Success / Warning / Danger | `#16A34A` / `#D97706` / `#DC2626` | lighter steps of the same hues |

- **Type:** Geist Sans for interface, Geist Mono for numbers, IDs, and code. Base size 14px. Tabular figures in all tables.
- **Spacing:** 4px grid.
- **Radius:** 6px controls, 8px panels.
- **Elevation:** borders instead of shadows, except for popovers and dialogs.
- **Icons:** Lucide, 16px, one stroke weight.
- **Themes:** light and dark from the first commit.

**App shell**

```text
┌───────────┬──────────────────────────────────────────────┐
│ Workspace │  Breadcrumb                 Search   Inbox   │
│ switcher  ├──────────────────────────────────────────────┤
│           │                                              │
│ Home      │   Page title                 [Primary action]│
│ Portfolio │                                              │
│ Work      │   Content                                    │
│ Inbox     │                                              │
│ ───────── │                                              │
│ Products  │                                              │
│  · pinned │                                              │
│ ───────── │                                              │
│ Settings  │                                              │
└───────────┴──────────────────────────────────────────────┘
```

Navigation shows only modules that exist. Insights, Finance, Automations, Agents, and Integrations appear in the sidebar when their stage ships, not before. On small screens the sidebar becomes a drawer and tables collapse to stacked rows.

**Core shared components:** `AppShell`, `CommandPalette`, `DataTable` (sort, filter, saved views, bulk actions), `DataState`, `EmptyState`, `StatusBadge`, `FreshnessLabel`, `ConfirmDialog`, `ActivityTimeline`, `ApprovalCard`.

---

## 10. Build stages

Each stage ships as vertical slices: schema, API, UI, tests, and audit together. A stage is done when it is reliable, tested, and actually used on the founder's own portfolio, not when its pages render.

| Stage | Delivers | Done when |
|---|---|---|
| **0. Scaffold** | Next.js app, tooling, CI, database, auth wiring, design tokens, app shell | A signed-in user sees an empty shell on a deployed URL; CI is green. |
| **1. Core foundation** | Workspaces, members, roles, invitations, product registry, classification, portfolio views, product workspace overview, search, audit log | The founder's real products are entered and managed here; cross-tenant tests pass. |
| **2. Work and knowledge** | Projects, tasks, bugs, comments, labels, documents, decision log, basic roadmap, inbox, attachments | Daily work for at least one product is tracked here for two weeks. |
| **3. Integrations** | Catalog, connection lifecycle, resource mapping, background sync, freshness states, GitHub as first provider | A repository is connected, mapped, synced on a schedule, and disconnects cleanly. |
| **4. SEO and insights** | Search Console sync, SEO dashboard, opportunity detection, insight-to-task, health v1 | An insight produced a task that was completed. |
| **5. Finance and operations** | Vendors, expenses, renewals, budgets, deployments (Vercel), revenue (Stripe), reports | Monthly cost per product is accurate against real invoices. |
| **6. Automation** | Trigger and action engine, templates, approvals, run history, kill switch | Three templates run unattended for two weeks without a false action. |
| **7. Agents** | Catalog, instances, tools, permissions, run lifecycle, live activity, approvals, cost | One first-party agent runs weekly with approvals and its output is accepted more often than rejected. |
| **8. Advanced** | Sprints, CRM and support, visual workflow builder, AI assistant, client workspaces | Only after user validation. |

### First slices, in order

1. **Scaffold** — project setup, lint, typecheck, test runner, CI, environment validation, Drizzle and Neon, Better Auth sign-in, app shell with tokens.
2. **Workspace** — create, switch, settings, tenant-scoped query helper, row-level security, cross-tenant test harness.
3. **Members and roles** — invite, accept, change role, remove; capability map; permission middleware.
4. **Product registry** — create, edit, archive, restore; five classification dimensions; domains.
5. **Portfolio views** — table and grid, filters, saved views, bulk edit, groups and tags.
6. **Product workspace overview** — summary, links, classification, activity.
7. **Audit and activity** — event recording on every mutation, timeline UI.
8. **Global search and command palette.**

Each slice starts with a short spec in `docs/specs/` and ends with the completion report from master prompt §32.8.

---

## 11. Scalability

Designed in from the start, because these are expensive to retrofit:

- **Tenant isolation at the data layer** (section 4.3).
- **Cursor pagination on every list.** No endpoint returns an unbounded set.
- **Indexes chosen from query patterns:** every tenant table indexes `(workspace_id, <main sort or filter column>)`.
- **Idempotency** on every job, webhook, and external action, using a stored key.
- **Outbox pattern** for events, so a committed change always produces its event and never a phantom one.
- **Per-tenant fairness** in jobs through Inngest concurrency keys, so one large workspace cannot starve the rest.
- **Pooled database connections** through Neon's pooler.
- **Snapshots, not live calls:** dashboards read stored metric snapshots; providers are called only by sync jobs.

Added when measurements demand it, not earlier:

| Signal | Response |
|---|---|
| Slow dashboard queries | Materialized rollups, then read replicas. |
| Metric and audit tables growing large | Time partitioning and retention jobs. |
| Search quality or latency complaints | Dedicated search engine. |
| Semantic retrieval needed for agents | `pgvector` first, dedicated store only if that fails. |
| Agent runs exceeding serverless limits | Extract the agent runtime to its own worker. |
| Hot rate-limit or cache paths | Redis. |

Watched from Stage 1: p95 request latency, error rate, job queue age, sync lag, database connection use, and AI and API cost per workspace.

---

## 12. Security baseline

Applies to every slice. Details are in master prompt §24.

- Authorization on the server for every request, job, webhook, and tool call.
- Secrets only in environment variables, validated at boot in `src/env.ts`. Never in the client bundle, logs, or model context.
- Provider tokens encrypted at rest; revoked on disconnect and on workspace deletion.
- Zod validation on every input. Output encoding by default through React.
- Rate limits on auth, invitations, and all public endpoints.
- Server-side request forgery protection on any feature that fetches a user-supplied URL (crawler, webhooks): block private address ranges, limit redirects, cap response size.
- Security headers and a content security policy from the first deploy.
- Dependency and secret scanning in CI.
- Workspace export and deletion paths exist before any outside user is onboarded.

No compliance claims are made anywhere in the product or marketing until independently validated.

---

## 13. Quality, environments, and delivery

**Testing**

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | Services, validators, permission map, health calculation. |
| Integration | Vitest + a real Postgres database | Routers with authorization; the cross-tenant suite. |
| Contract | Vitest + recorded fixtures | Provider adapters. No live provider calls in CI. |
| End to end | Playwright | Onboarding, product CRUD, invite flow, one journey per stage. |

**CI on every pull request:** format, lint (including module boundaries), typecheck, unit and integration tests, migration check, build. Nothing merges red.

**Environments**

| Environment | App | Database |
|---|---|---|
| Local | `pnpm dev` | Neon development branch or local Postgres |
| Preview | Vercel preview per pull request | Neon branch per pull request |
| Production | Vercel production | Neon main branch, backups on, restore tested |

**Branching:** short-lived feature branches into `main`. `main` is always deployable. Migrations are forward-only and backward-compatible with the previously deployed code, so a rollback of the app never breaks on schema.

**Environment variables** (names only; values live in the host's secret store)

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`.

**Definition of done for a slice**

1. Acceptance criteria in the spec are met.
2. Authorization and cross-tenant tests exist and pass.
3. Loading, empty, error, and permission states are designed and built.
4. Mutations write audit events.
5. Works on mobile width and by keyboard.
6. Lint, typecheck, and tests pass in CI.
7. Completion report written.

---

## 14. Decision log

| # | Date | Decision | Reason | Revisit when |
|---|---|---|---|---|
| 1 | 2026-11-13 | Modular monolith in a single Next.js app | Small team; fastest path; boundaries enforced by lint | A second deployable is needed |
| 2 | 2026-11-13 | tRPC inside the app, REST only for provider-facing endpoints | End-to-end types with no code generation | A public API is planned |
| 3 | 2026-11-13 | Inngest for background work | Durable steps and per-tenant concurrency without running queue infrastructure | Cost or run-duration limits are hit |
| 4 | 2026-11-13 | Better Auth | Auth data stays in our Postgres; organization support | Enterprise single sign-on is required |
| 5 | 2026-11-13 | Workspace-scoped queries plus row-level security | Two independent layers against tenant leakage | Never removed; only strengthened |
| 6 | 2026-11-13 | PostgreSQL full-text search first | No extra system to operate | Search quality complaints |
| 7 | 2026-11-13 | Provisional design tokens | Design template not yet received | Template is provided |

---

## 15. Open questions

1. **Design template** — needs to be shared (image, Figma link, or URL) so section 9 can be finalized before Stage 0 UI work.
2. **Product name** — needed before the marketing site and auth emails.
3. **Relationship to existing LayerFlow code** — is this a fresh product, or does it extend an existing codebase and domain?
4. **First outside users** — solo founders or small teams first? This decides how early invitations and roles need polish.
5. **Sign-in methods at launch** — Google and GitHub only, or email and password as well?
